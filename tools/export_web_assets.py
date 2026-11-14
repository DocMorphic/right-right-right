#!/usr/bin/env python3
"""Export the authorized original Unity runtime assets to browser-ready GLB.

No geometry is invented: meshes, scene hierarchy, materials, texture pixels,
colliders and audio all come from the pinned native player. Skinned meshes are
baked in the native scene's seated pose, avoiding a separate Unity animation
runtime in the browser. Copyright remains with the original asset owners.

Install: .venv-build/bin/pip install -r tools/web-assets-requirements.txt
Run: .venv-build/bin/python tools/export_web_assets.py --runtime PATH
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import shutil
import struct
from pathlib import Path

import numpy as np
import UnityPy
from PIL import Image
from UnityPy.helpers.MeshHelper import MeshHandler

ROOT = Path(__file__).resolve().parents[1]
REFLECT = np.diag([-1., 1., 1., 1.])
TREES = ['CommonTree_3', 'CommonTree_5', 'PineTree_1', 'PineTree_3', 'BirchTree_2', 'BirchTree_3']


def safe_name(value):
    return re.sub(r'[^A-Za-z0-9_.-]+', '_', value).strip('_') or 'unnamed'


def vec(value, dimensions=3):
    return [float(getattr(value, c)) for c in 'xyzw'[:dimensions]]


def color(value):
    return [float(getattr(value, c)) for c in 'rgba']


def srgb_linear(rgb):
    return [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]


def local_matrix(transform):
    x, y, z, w = vec(transform.m_LocalRotation, 4)
    q = np.array([x, y, z, w]); q /= np.linalg.norm(q)
    x, y, z, w = q
    result = np.eye(4)
    result[:3, :3] = np.array([
        [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]) @ np.diag(vec(transform.m_LocalScale))
    result[:3, 3] = vec(transform.m_LocalPosition)
    return result


def ptr_key(pointer):
    obj = pointer.deref()
    return obj.assets_file.name, obj.path_id


class Exporter:
    def __init__(self, runtime: Path, output: Path):
        self.runtime, self.output = runtime, output
        files = ['level1', 'sharedassets1.assets', 'sharedassets0.assets', 'resources.assets', 'Resources/unity default resources']
        files.extend(p.name for p in runtime.iterdir() if p.is_file() and p.suffix in ['.resS', '.resource'])
        self.environment = UnityPy.load(*[str(runtime / name) for name in files if (runtime / name).exists()])
        self.scene = next(f for f in self.environment.files.values() if getattr(f, 'name', '') == 'level1')
        self.gos = {o.path_id: o.read() for o in self.scene.objects.values() if o.type.name == 'GameObject'}
        self.transforms = {}
        self.components = {}
        self.world_cache = {}
        self.texture_manifest = {}
        self.warnings = []
        self.material_inventory = {}
        self.output.mkdir(parents=True, exist_ok=True)
        for go_id, go in self.gos.items():
            self.components[go_id] = {}
            for c in go.m_Component:
                kind = c.component.type.name
                if kind not in ['Transform', 'MeshFilter', 'MeshRenderer', 'SkinnedMeshRenderer', 'BoxCollider', 'SphereCollider', 'CapsuleCollider', 'MeshCollider', 'Camera']:
                    continue
                data = c.component.read()
                self.components[go_id][kind] = data
                if kind == 'Transform': self.transforms[c.component.m_PathID] = data

    def go_transform(self, go):
        return self.components[go.object_reader.path_id]['Transform']

    def world(self, transform):
        key = transform.object_reader.path_id
        if key not in self.world_cache:
            value = local_matrix(transform)
            if transform.m_Father.m_PathID:
                value = self.world(transform.m_Father.read()) @ value
            self.world_cache[key] = value
        return self.world_cache[key]

    def find(self, name):
        return next(go for go in self.gos.values() if go.m_Name == name and 'Transform' in self.components[go.object_reader.path_id])

    def texture(self, pointer, *, normal=False):
        data = pointer.read()
        key = f'{safe_name(data.m_Name)}' + ('_gltf_normal' if normal else '')
        if key in self.texture_manifest: return self.texture_manifest[key]['url']
        image = data.image.convert('RGBA')
        if normal:
            # Unity DXT5nm stores X in alpha (or red for uncompressed maps), Y
            # in green. Reconstruct tangent-space Z for glTF's RGB normal map.
            pixels = np.array(image).astype(np.float32) / 255.
            alpha_encoded = np.ptp(pixels[:, :, 0]) < .03 and np.ptp(pixels[:, :, 3]) > .03
            nx = pixels[:, :, 3 if alpha_encoded else 0] * 2 - 1
            ny = pixels[:, :, 1] * 2 - 1
            nz = np.sqrt(np.maximum(0, 1-nx*nx-ny*ny))
            pixels[:, :, :3] = np.stack([nx, ny, nz], axis=-1) * .5 + .5
            pixels[:, :, 3] = 1
            image = Image.fromarray(np.uint8(np.clip(pixels, 0, 1)*255))
        target = self.output / 'textures' / f'{key}.png'
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, optimize=True)
        url = f'/assets/textures/{key}.png'
        self.texture_manifest[key] = {'url': url, 'name': data.m_Name, 'width': image.width, 'height': image.height, 'colorSpace': 'linear' if normal else 'sRGB', 'sourceFile': data.object_reader.assets_file.name, 'sourcePathId': data.object_reader.path_id}
        return url

    def export_textures(self):
        for obj in self.environment.objects:
            if obj.type.name == 'Texture2D' and obj.assets_file.name in ['sharedassets1.assets', 'sharedassets0.assets', 'resources.assets']:
                data = obj.read()
                if not data.m_Name or any(k in data.m_Name for k in ['Font', 'Atlas', 'GridBox', 'UI', 'Emoji']): continue
                self.texture(PointerAdapter(obj))

    def glb(self, go, relative, preserve_root_scale=False, preserve_root_rotation=False, include_inactive=False):
        builder = GLB(self)
        root = builder.add_go(go, root=True, preserve_root_scale=preserve_root_scale, preserve_root_rotation=preserve_root_rotation, include_inactive=include_inactive)
        builder.document['scenes'] = [{'nodes': [root]}]
        target = self.output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        builder.save(target)
        positions = np.array(builder.bounds) if builder.bounds else np.zeros((1, 3))
        return {'url': '/assets/' + relative, 'name': go.m_Name, 'bounds': {'min': positions.min(axis=0).tolist(), 'max': positions.max(axis=0).tolist()}, 'nodes': len(builder.document['nodes']), 'meshCount': len(builder.document['meshes']), 'triangles': builder.triangle_count, 'bytes': target.stat().st_size, 'sourceFile': 'level1', 'sourcePathId': go.object_reader.path_id}

    def audio(self):
        output = {}
        for obj in self.environment.objects:
            if obj.type.name != 'AudioClip': continue
            clip = obj.read()
            try:
                for name, data in clip.samples.items():
                    filename = safe_name(name)
                    target = self.output / 'sounds' / filename
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                    output[clip.m_Name] = {'url': '/assets/sounds/'+filename, 'bytes': len(data), 'sourceFile': obj.assets_file.name, 'sourcePathId': obj.path_id}
            except Exception as exc:
                self.warnings.append(f'Audio {clip.m_Name}: {exc}')
        return output

    def anchor(self, go, root):
        m = REFLECT @ np.linalg.inv(self.world(self.go_transform(root))) @ self.world(self.go_transform(go)) @ REFLECT
        return {'name': go.m_Name, 'position': m[:3, 3].tolist(), 'matrix': m.T.reshape(-1).tolist()}

    def tree_collision(self, go):
        t=self.go_transform(go); comp=self.components[go.object_reader.path_id]
        collider=comp.get('CapsuleCollider')
        if not collider:return None
        scale=np.array(vec(t.m_LocalScale)); matrix=REFLECT@local_matrix(t)@REFLECT; matrix[:3,3]=0
        center=vec(collider.m_Center); center[0]*=-1
        axis=int(collider.m_Direction)
        return {'type':'capsule','center':(matrix@np.array(center+[1.]))[:3].tolist(),'radius':float(collider.m_Radius*max(scale[(axis+1)%3],scale[(axis+2)%3])),'height':float(collider.m_Height*scale[axis]),'up':'+Y'}

    def surfaces(self):
        layers={}
        for obj in self.environment.objects:
            if obj.type.name!='TerrainLayer':continue
            d=obj.read()
            layer={'name':d.m_Name,'albedo':self.texture(d.m_DiffuseTexture),'tileSize':vec(d.m_TileSize,2),'tint':vec(d.m_DiffuseRemapMax,4),'roughness':1-d.m_Smoothness}
            if d.m_NormalMapTexture.m_PathID:layer['normal']=self.texture(d.m_NormalMapTexture,normal=True)
            layers[d.m_Name]=layer
        road=next(o.read() for o in self.environment.objects if o.type.name=='Material' and o.read().m_Name=='road material')
        tex=dict(road.m_SavedProperties.m_TexEnvs)
        return {'road':{'name':road.m_Name,'albedo':self.texture(tex['_MainTex'].m_Texture),'normal':self.texture(tex['_BumpMap'].m_Texture,normal=True),'roughness':1.,'uv':'native road: U spans width, V repeats along distance'},'terrainLayers':layers,'ground':layers['RW_CartoonGrass']}

    def atmosphere(self):
        d=next(o.read() for o in self.scene.objects.values() if o.type.name=='RenderSettings')
        sun=d.m_Sun.read()
        return {'fog':{'enabled':d.m_Fog,'color':color(d.m_FogColor)[:3],'near':d.m_LinearFogStart,'far':d.m_LinearFogEnd,'density':d.m_FogDensity,'mode':'linear'},'ambient':{'sky':color(d.m_AmbientSkyColor)[:3],'ground':color(d.m_AmbientGroundColor)[:3],'intensity':d.m_AmbientIntensity},'sun':{'color':color(sun.m_Color)[:3],'intensity':sun.m_Intensity},'skybox':{'px':'/assets/textures/Left_Tex.png','nx':'/assets/textures/Right_Tex.png','py':'/assets/textures/Up_Tex.png','ny':'/assets/textures/Down_Tex.png','pz':'/assets/textures/Front_Tex.png','nz':'/assets/textures/Back_Tex.png'}}

    def export_ui(self):
        """Export only the native IMGUI assets and embedded font, losslessly."""
        font_obj=next(o for o in self.environment.objects if o.type.name=='Font' and o.read().m_Name=='LiberationSans')
        font=font_obj.read(); data=bytes(font.m_FontData)
        font_dir=self.output/'fonts'; font_dir.mkdir(parents=True,exist_ok=True)
        (font_dir/'LiberationSans.ttf').write_bytes(data)
        shutil.copyfile(ROOT/'installer/LiberationSans-OFL.txt',font_dir/'LiberationSans-OFL.txt')
        fonts={'LiberationSans':{'url':'/assets/fonts/LiberationSans.ttf','licenseUrl':'/assets/fonts/LiberationSans-OFL.txt','family':'Liberation Sans','nativeName':font.m_Name,'nativeFontSize':font.m_FontSize,'nativeAscent':font.m_Ascent,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'sourceFile':font_obj.assets_file.name,'sourcePathId':font_obj.path_id}}
        cabin_font_obj=next(o for o in self.environment.objects if o.type.name=='Font' and o.read().m_Name=='ShareTechMono-Regular')
        cabin_font=cabin_font_obj.read();cabin_data=bytes(cabin_font.m_FontData)
        (font_dir/'ShareTechMono-Regular.ttf').write_bytes(cabin_data)
        shutil.copyfile(ROOT/'tools/licenses/ShareTechMono-OFL.txt',font_dir/'ShareTechMono-OFL.txt')
        fonts['ShareTechMono']={'url':'/assets/fonts/ShareTechMono-Regular.ttf','licenseUrl':'/assets/fonts/ShareTechMono-OFL.txt','family':'Share Tech Mono','nativeName':cabin_font.m_Name,'nativeFontSize':cabin_font.m_FontSize,'bytes':len(cabin_data),'sha256':hashlib.sha256(cabin_data).hexdigest(),'sourceFile':cabin_font_obj.assets_file.name,'sourcePathId':cabin_font_obj.path_id,'usage':'CabinFont native resource Fonts/ShareTechMono-Regular; dashboard and tablet TextMesh timer'}
        builtin=next(f for f in self.environment.files.values() if getattr(f,'name','')=='unity default resources')
        ui_dir=self.output/'ui';ui_dir.mkdir(parents=True,exist_ok=True)
        textures={}
        for obj in builtin.objects.values():
            if obj.type.name!='Texture2D' or not 11001<=obj.path_id<=11026:continue
            d=obj.read();filename=safe_name(d.m_Name)+'.png';image=d.image
            image.save(ui_dir/filename,optimize=True)
            center=list(image.convert('RGBA').getpixel((image.width//2,image.height//2)))
            textures[obj.path_id]={'name':d.m_Name,'url':'/assets/ui/'+filename,'width':image.width,'height':image.height,'centerPixelRGBA8':center,'sourceFile':builtin.name,'sourcePathId':obj.path_id}
        skin=decode_native_game_skin(builtin.objects[11000].get_raw_data(),textures)
        skin.update(sourceFile=builtin.name,sourcePathId=11000,fontOverride='LiberationSans',copyright='Unity Technologies native runtime IMGUI skin; retained with authorized game content')
        (ui_dir/'GameSkin.json').write_text(json.dumps(skin,indent=2)+'\n')
        (ui_dir/'CREDITS.txt').write_text('Native Unity IMGUI GameSkin and control textures: Unity Technologies.\nExported unchanged from the authorized original game runtime.\nLiberation Sans: see ../fonts/LiberationSans-OFL.txt.\n')
        menu_env=UnityPy.load(str(self.runtime/'level0'))
        menu_camera=next(o.read() for o in menu_env.objects if o.type.name=='Camera')
        menu_counts={kind:sum(o.type.name==kind for o in menu_env.objects) for kind in ['MeshRenderer','MeshFilter','SkinnedMeshRenderer','GameObject','RectTransform','Transform']}
        menu={'sourceFile':'level0','sourceCameraPathId':menu_camera.object_reader.path_id,'clearFlags':menu_camera.m_ClearFlags,'clearMode':'SolidColor' if menu_camera.m_ClearFlags==2 else 'Skybox','backgroundColor':color(menu_camera.m_BackGroundColor),'fieldOfView':menu_camera.field_of_view,'nearClip':menu_camera.near_clip_plane,'farClip':menu_camera.far_clip_plane,'objectCounts':menu_counts,'note':'Current native menu has no 3D mesh geometry. DirectSession disables MenuCanvas and draws its IMGUI panel over this flat camera background.'}
        camera=self.components[self.find('Main Camera').object_reader.path_id]['Camera']
        cabin_camera={'sourceFile':'level1','sourcePathId':camera.object_reader.path_id,'fieldOfView':camera.field_of_view,'nearClip':camera.near_clip_plane,'farClip':camera.far_clip_plane,'clearFlags':camera.m_ClearFlags,'backgroundColor':color(camera.m_BackGroundColor)}
        tablet=self.tablet_metadata()
        (ui_dir/'TabletMinimap.json').write_text(json.dumps(tablet,indent=2)+'\n')
        return fonts,{'skinUrl':'/assets/ui/GameSkin.json','skin':skin,'textures':textures,'menu':menu,'cabinCamera':cabin_camera,'tablet':tablet}

    def tablet_metadata(self):
        go=self.find('Tablet')
        obj=next(c.component.deref() for c in go.m_Component if c.component.type.name=='MonoBehaviour' and c.component.deref().read_typetree(check_read=False,wrap=True).m_Script.read().m_ClassName=='TabletMinimap')
        data=obj.get_raw_data();offset=32
        def unpack(fmt):
            nonlocal offset
            values=struct.unpack_from('<'+fmt,data,offset);offset+=struct.calcsize('<'+fmt);return values
        road_file,road_id=unpack('iq');length=unpack('i')[0]
        road_name=data[offset:offset+length].decode();offset=(offset+length+3)&~3
        car_file,car_id=unpack('iq');screen_file,screen_id=unpack('iq')
        ortho,look_ahead,rt,width,marker=unpack('ffiff')
        colors={name:list(unpack('ffff')) for name in ['roadColor','markerFill','markerOutline','mapBackground']}
        if offset!=len(data):raise ValueError('Unsupported TabletMinimap serialized layout')
        return {'sourceFile':'level1','sourcePathId':obj.path_id,'serializedBytes':len(data),'decodedBytes':offset,'roadObjectName':road_name,'orthoSize':ortho,'lookAheadFrac':look_ahead,'rtSize':rt,'roadWidthMul':width,'markerSize':marker,**colors,'markerTriangleFactors':[[0,0,.62],[-.42,0,-.48],[.42,0,-.48]],'screenRuntimeTransform':{'position':[0,.5+.008/max(.0001,vec(self.go_transform(go).m_LocalScale)[1]),-.015],'eulerDegrees':[-90,0,0],'scale':[.58,-.55,1],'note':'Native LayoutScreen modifies the source scene Screen quad on startup; values in native Unity tablet-local coordinates.'},'privacy':{'shaderProperty':'_Privacy','driver':1,'navigator':0,'glassColor':[.1,.09,.07,1],'hidesTimerText':True,'addsText':False},'timer':{'source':'Native GameAssembly TabletMinimap.BuildTimerHud RVA0x50E2A0 / UpdateTimerHud RVA0x5109F0; CabinFont.Font RVA0x4E9650','type':'3D TextMesh and native cubes, not Canvas/TMP or a route image header','parent':'Tablet','window':{'name':'TimerWindow','position':[0,.7,.37],'rotation':[0,0,0,1],'scale':[1,1,1]},'plate':{'name':'TimerPlate','position':[0,0,0],'scale':[.56,.05,.11],'color':[.02,.02,.018,1]},'rim':{'color':[.8,.42,.08,1],'cubes':[{'position':[0,.17,.045],'scale':[.526,.02,.006]},{'position':[0,.17,-.045],'scale':[.526,.02,.006]},{'position':[.26,.17,0],'scale':[.006,.02,.096]},{'position':[-.26,.17,0],'scale':[.006,.02,.096]}]},'text':{'name':'TimerText','position':[0,.04,.012],'rotation':'Quaternion.LookRotation(Vector3.up,Vector3.forward)','scale':[-.29538461565971375,.24,1],'font':'ShareTechMono','fontSize':48,'characterSize':.05,'fontStyle':0,'anchor':4,'alignment':1,'color':colors['roadColor'],'initial':'0:00.0','format':'minutes + ":" + seconds.ToString("00.0")','countdown':'bare integer digit 1..5','waitingAndCrashed':'empty string','update':'tenths of a second'}}}

    def run_ui(self):
        fonts,ui=self.export_ui()
        path=self.output/'manifest.json'
        manifest=json.loads(path.read_text()) if path.exists() else {'schemaVersion':1}
        manifest.update(fonts=fonts,ui=ui)
        path.write_text(json.dumps(manifest,indent=2)+'\n')
        print(json.dumps({'fonts':fonts,'uiTextures':len(ui['textures']),'styles':list(ui['skin']['styles'])},indent=2))

    def run(self):
        car = self.find('Car')
        models = {'car': self.glb(car, 'car.glb'), 'tablet': self.glb(self.find('Tablet'), 'tablet.glb', preserve_root_scale=True), 'trees': []}
        for name in TREES:
            tree=next(go for go in self.gos.values() if go.m_Name==name and 'CapsuleCollider' in self.components[go.object_reader.path_id])
            model=self.glb(tree, f'trees/{name}.glb', preserve_root_scale=True, preserve_root_rotation=True)
            model['collider']=self.tree_collision(tree)
            models['trees'].append(model)
        for name in ['StageStart', 'StageFinish']:
            models[name] = self.glb(self.find(name), name.lower()+'.glb', include_inactive=True)
        anchors = {}
        for name in ['HoldAnchor_Driver', 'HoldAnchor_Passenger', 'EyeAnchor', 'Main Camera', 'WheelRotationHelper', 'door_lf_ok', 'door_rf_ok', 'windscreen_ok', 'wiper_L', 'wiper_R']:
            anchors[name] = self.anchor(self.find(name), car)
        for character, role in [('character fat', 'driver'), ('character skiny', 'navigator')]:
            char = self.find(character)
            pending = [self.go_transform(char)]
            while pending:
                t = pending.pop()
                go = t.m_GameObject.read()
                if go.m_Name == 'Head': anchors[role+'Head'] = self.anchor(go, car)
                pending.extend(c.read() for c in t.m_Children)
        self.export_textures()
        surfaces=self.surfaces()
        sounds = self.audio()
        manifest = {'schemaVersion': 1, 'source': 'Authorized original Left Left LEFT / Right Right Right native runtime', 'copyright': 'Original game and assets: Stellux Interactive. Used under developer permission stated by project owner; excluded from the source-code MIT license.', 'coordinateSystem': {'up': '+Y', 'forward': '+Z', 'units': 'meters', 'conversion': 'Unity X reflected; winding reversed; UV V flipped; native seated skeletal pose baked'}, 'models': models, 'anchors': anchors, 'textures': self.texture_manifest, 'sounds': sounds, 'materials': self.material_inventory, 'mud': {'source': 'Native Car_Glass material procedural shader; no mud bitmap exists', 'color': [0.2999999821, 0.1999999583, 0.1099999622], 'noiseScale': 3.5, 'opacity': 1.0}, 'warnings': self.warnings}
        manifest['surfaces']=surfaces
        manifest['atmosphere']=self.atmosphere()
        manifest['runtime']={'sourceDirectory':self.runtime.name,'level1Sha256':hashlib.sha256((self.runtime/'level1').read_bytes()).hexdigest(),'unityPyVersion':UnityPy.__version__}
        manifest['fonts'],manifest['ui']=self.export_ui()
        (self.output/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
        (self.output/'CREDITS.txt').write_text('Original game and assets: Stellux Interactive — Left Left LEFT\nBrowser adaptation: Right Right Right\nUsed under the developer permission stated by the project owner.\nLicensed original content is excluded from the repository source-code MIT license.\nSee the repository LICENSE for the adaptation license.\n')
        print(json.dumps({'output': str(self.output), 'models': models, 'anchors': anchors, 'textures': len(self.texture_manifest), 'sounds': len(sounds), 'warnings': self.warnings}, indent=2))


class PointerAdapter:
    def __init__(self, obj): self.obj = obj
    def read(self): return self.obj.read()
    def deref(self): return self.obj


def decode_native_game_skin(data,textures):
    """Decode Unity's native serialized GameSkin; MonoBehaviour type tree is stripped.

    The native skin contains 20 fixed GUIStyles followed by custom styles. Each
    GUIStyle serializes eight (PPtr<Texture2D>, Color) states then its RectOffsets,
    font/text metrics and dimensions. Every read is bounds checked by struct and
    names are checked against the native built-in list to reject changed layouts.
    """
    offset=52
    def unpack(fmt):
        nonlocal offset
        values=struct.unpack_from('<'+fmt,data,offset);offset+=struct.calcsize('<'+fmt)
        return values
    def string():
        nonlocal offset
        count=unpack('i')[0]
        if not 0<=count<128:raise ValueError('Unsupported Unity GameSkin layout')
        value=data[offset:offset+count].decode('utf-8');offset=(offset+count+3)&~3
        return value
    def style():
        nonlocal offset
        name=string();result={'name':name,'states':{}}
        for state in ['normal','hover','active','onNormal','onHover','onActive','focused','onFocused']:
            file_id,path_id=unpack('iq');rgba=list(unpack('ffff'))
            result['states'][state]={'textColor':rgba,'background':textures.get(path_id,{}).get('url'),'backgroundPathId':path_id}
        for field in ['border','margin','padding','overflow']:
            result[field]=dict(zip(['left','right','top','bottom'],unpack('iiii')))
        result['fontFileId'],result['fontPathId']=unpack('iq')
        result['fontSize'],result['fontStyle'],result['alignment']=unpack('iii')
        result['wordWrap'],result['richText']=map(bool,unpack('BB'));offset=(offset+3)&~3
        result['clipping'],result['imagePosition']=unpack('ii')
        result['contentOffset']=list(unpack('ff'))
        result['fixedWidth'],result['fixedHeight']=unpack('ff')
        result['stretchWidth'],result['stretchHeight']=map(bool,unpack('BB'));offset=(offset+3)&~3
        return result
    expected=['box','button','toggle','label','textfield','textarea','window','horizontalslider','horizontalsliderthumb','verticalslider','verticalsliderthumb','horizontalscrollbar','horizontalscrollbarthumb','horizontalscrollbarleftbutton','horizontalscrollbarrightbutton','verticalscrollbar','verticalscrollbarthumb','verticalscrollbarupbutton','verticalscrollbardownbutton','scrollview']
    styles={}
    for expected_name in expected:
        item=style()
        if item['name'].lower()!=expected_name:raise ValueError(f"Unexpected native GUIStyle {item['name']} at {offset}")
        styles[item['name']]=item
    custom_count=unpack('i')[0]
    if not 0<=custom_count<50:raise ValueError('Invalid custom GUIStyle count')
    for _ in range(custom_count):
        item=style();styles[item['name']]=item
    double,triple=unpack('ii')
    settings={'doubleClickSelectsWord':bool(double),'tripleClickSelectsLine':bool(triple),'cursorColor':list(unpack('ffff')),'cursorFlashSpeed':unpack('f')[0],'selectionColor':list(unpack('ffff'))}
    if offset!=len(data):raise ValueError('Unexpected trailing GameSkin bytes')
    return {'name':'GameSkin','styles':styles,'settings':settings,'serializedBytes':len(data),'decodedBytes':offset,'fontSizeFallback':'GUIFonts replaces skin font with embedded LiberationSans (native import size 16px); zero style.fontSize inherits font size.'}


class GLB:
    def __init__(self, exporter):
        self.exporter = exporter
        self.document = {'asset': {'version': '2.0', 'generator': 'Right Right Right native-asset exporter', 'copyright': 'Original game/asset owners; used with developer permission'}, 'scene': 0, 'nodes': [], 'meshes': [], 'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}], 'accessors': [], 'bufferViews': [], 'buffers': []}
        self.binary = bytearray()
        self.mesh_cache, self.material_cache, self.image_cache = {}, {}, {}
        self.bounds, self.triangle_count = [], 0
        self.root_world = None

    def blob(self, data, target=None):
        self.binary.extend(b'\0'*(-len(self.binary)%4))
        view = {'buffer': 0, 'byteOffset': len(self.binary), 'byteLength': len(data)}
        if target: view['target'] = target
        self.document['bufferViews'].append(view)
        self.binary.extend(data)
        return len(self.document['bufferViews'])-1

    def accessor(self, array, kind, component=5126, target=34962, bounds=False):
        array = np.asarray(array, dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[component])
        if component == 5126: array = np.nan_to_num(array, nan=0., posinf=0., neginf=0.)
        view = self.blob(array.tobytes(), target)
        entry = {'bufferView': view, 'componentType': component, 'count': len(array), 'type': kind}
        if bounds:
            entry['min'] = array.min(axis=0).tolist(); entry['max'] = array.max(axis=0).tolist()
        self.document['accessors'].append(entry)
        return len(self.document['accessors'])-1

    def image(self, pointer, normal=False):
        key = (ptr_key(pointer), normal)
        if key in self.image_cache: return self.image_cache[key]
        url = self.exporter.texture(pointer, normal=normal)
        data = (self.exporter.output / url.removeprefix('/assets/')).read_bytes()
        self.document['images'].append({'bufferView': self.blob(data), 'mimeType': 'image/png', 'name': pointer.read().m_Name})
        self.document['textures'].append({'sampler': 0, 'source': len(self.document['images'])-1})
        idx = len(self.document['textures'])-1
        self.image_cache[key] = idx
        return idx

    def material(self, pointer):
        key = ptr_key(pointer)
        if key in self.material_cache: return self.material_cache[key]
        m = pointer.read()
        colors = dict(m.m_SavedProperties.m_Colors); floats = dict(m.m_SavedProperties.m_Floats); tex = dict(m.m_SavedProperties.m_TexEnvs)
        rgba = color(colors['_BaseColor'] if '_BaseColor' in colors else colors['_Color']) if '_BaseColor' in colors or '_Color' in colors else [1,1,1,1]
        rgba[:3]=srgb_linear(rgba[:3])
        result = {'name': m.m_Name, 'pbrMetallicRoughness': {'baseColorFactor': rgba, 'metallicFactor': floats.get('_Metallic', 0), 'roughnessFactor': max(.04, 1-floats.get('_Smoothness', floats.get('_Glossiness', 0)))}, 'doubleSided': floats.get('_Cull', 2) == 0}
        for field in ['_BaseMap', '_MainTex']:
            if field in tex and tex[field].m_Texture.m_PathID:
                result['pbrMetallicRoughness']['baseColorTexture'] = {'index': self.image(tex[field].m_Texture)}
                break
        if '_BumpMap' in tex and tex['_BumpMap'].m_Texture.m_PathID:
            result['normalTexture'] = {'index': self.image(tex['_BumpMap'].m_Texture, normal=True), 'scale': floats.get('_BumpScale', 1)}
        if floats.get('_Surface', 0) > .5 or rgba[3] < .999: result['alphaMode'] = 'BLEND'
        elif floats.get('_AlphaClip', 0) > .5: result.update(alphaMode='MASK', alphaCutoff=floats.get('_Cutoff', .5))
        # URP unlit materials are common for the original hand-colored cabin.
        # Preserve their appearance rather than darkening them with PBR lighting.
        try: shader_name = m.m_Shader.read().m_Name
        except Exception: shader_name = ''
        if 'Unlit' in shader_name:
            result['extensions'] = {'KHR_materials_unlit': {}}
            self.document.setdefault('extensionsUsed', [])
            if 'KHR_materials_unlit' not in self.document['extensionsUsed']: self.document['extensionsUsed'].append('KHR_materials_unlit')
        if '_EmissionColor' in colors:
            emission = color(colors['_EmissionColor'])[:3]
            if max(emission) > 0: result['emissiveFactor'] = [min(1, max(0, c)) for c in srgb_linear(emission)]
        result['extras'] = {'unityMaterialName': m.m_Name, 'unityShader': shader_name}
        self.exporter.material_inventory[f'{key[0]}:{key[1]}'] = {'name': m.m_Name, 'shader': shader_name, 'colors': {k:color(v) for k,v in colors.items()}, 'floats': floats}
        self.document['materials'].append(result)
        idx = len(self.document['materials'])-1; self.material_cache[key] = idx
        return idx

    def mesh(self, pointer, materials, renderer=None):
        key = (ptr_key(pointer), tuple(ptr_key(m) for m in materials), renderer.object_reader.path_id if renderer else None)
        if key in self.mesh_cache: return self.mesh_cache[key]
        mesh = pointer.read(); h = MeshHandler(mesh); h.process()
        if not h.m_Vertices: return None
        positions = np.array(h.m_Vertices, dtype=float)[:, :3]
        normals = np.array(h.m_Normals, dtype=float)[:, :3] if h.m_Normals else None
        tangents = np.array(h.m_Tangents, dtype=float) if h.m_Tangents else None
        if renderer and renderer.m_Bones and h.m_BoneWeights:
            renderer_t = self.exporter.components[renderer.m_GameObject.m_PathID]['Transform']
            inv_world = np.linalg.inv(self.exporter.world(renderer_t))
            bind = [np.array([[getattr(b,f'e{r}{c}') for c in range(4)] for r in range(4)]) for b in mesh.m_BindPose]
            matrices = np.array([inv_world @ self.exporter.world(b.read()) @ p for b,p in zip(renderer.m_Bones, bind)])
            weights, indices = np.array(h.m_BoneWeights), np.array(h.m_BoneIndices,dtype=int)
            skin = (matrices[indices] * weights[:, :, None, None]).sum(axis=1)
            positions = np.einsum('nij,nj->ni',skin,np.column_stack([positions,np.ones(len(positions))]))[:,:3]
            if normals is not None: normals = np.einsum('nij,nj->ni',np.linalg.inv(skin[:,:3,:3]).transpose(0,2,1),normals)
            if tangents is not None: tangents[:,:3] = np.einsum('nij,nj->ni',skin[:,:3,:3],tangents[:,:3])
        positions[:,0] *= -1
        attrs = {'POSITION': self.accessor(positions, 'VEC3', bounds=True)}
        if normals is not None:
            normals[:,0] *= -1; normals /= np.maximum(1e-12,np.linalg.norm(normals,axis=1)[:,None])
            attrs['NORMAL'] = self.accessor(normals, 'VEC3')
        if h.m_UV0:
            uv=np.array(h.m_UV0)[:,:2]; uv[:,1]=1-uv[:,1]
            attrs['TEXCOORD_0'] = self.accessor(uv,'VEC2')
        if tangents is not None:
            tangents[:,0] *= -1
            tangents[:,:3] /= np.maximum(1e-12,np.linalg.norm(tangents[:,:3],axis=1)[:,None])
            # Reflection and V flip each reverse handedness, canceling out.
            attrs['TANGENT'] = self.accessor(tangents,'VEC4')
        if h.m_Colors:
            colors=np.array(h.m_Colors,dtype=float)
            if np.max(colors)>1:colors/=255.
            colors=np.clip(colors,0,1)
            attrs['COLOR_0'] = self.accessor(colors,'VEC4' if colors.shape[1]==4 else 'VEC3')
        primitives = []
        for i, triangles in enumerate(h.get_triangles()):
            triangles = np.array(triangles,dtype=np.uint32)
            if not len(triangles): continue
            triangles = triangles[:,[0,2,1]].reshape(-1)
            primitive={'attributes':attrs,'indices':self.accessor(triangles,'SCALAR',5125,34963)}
            if materials: primitive['material'] = self.material(materials[min(i,len(materials)-1)])
            primitives.append(primitive); self.triangle_count += len(triangles)//3
        self.document['meshes'].append({'name':mesh.m_Name,'primitives':primitives,'extras':{'nativePoseBaked':bool(renderer),'sourcePathId':mesh.object_reader.path_id}})
        idx = len(self.document['meshes'])-1; self.mesh_cache[key]=(idx, positions)
        return idx, positions

    def add_go(self, go, root=False, preserve_root_scale=False, preserve_root_rotation=False, include_inactive=False, parent_matrix=None):
        comp = self.exporter.components[go.object_reader.path_id]; t=comp['Transform']
        node={'name':go.m_Name, 'extras':{'unityPathId':go.object_reader.path_id,'nativeActive':go.m_IsActive}}
        matrix=local_matrix(t)
        if root:
            self.root_world=self.exporter.world(t)
            matrix=matrix.copy() if preserve_root_rotation else np.eye(4)
            matrix[:3,3]=0
            if preserve_root_scale: matrix[:3,:3]=np.diag(vec(t.m_LocalScale))
            if preserve_root_rotation:matrix[:3,:3]=local_matrix(t)[:3,:3]
        converted=REFLECT@matrix@REFLECT
        node.update(translation=converted[:3,3].tolist(),rotation=[float(t.m_LocalRotation.x),-float(t.m_LocalRotation.y),-float(t.m_LocalRotation.z),float(t.m_LocalRotation.w)] if not root or preserve_root_rotation else [0,0,0,1],scale=vec(t.m_LocalScale) if not root or preserve_root_scale else [1,1,1])
        idx=len(self.document['nodes']); self.document['nodes'].append(node)
        cumulative=converted if parent_matrix is None else parent_matrix@converted
        renderer=comp.get('SkinnedMeshRenderer') or comp.get('MeshRenderer')
        pointer=renderer.m_Mesh if 'SkinnedMeshRenderer' in comp else comp['MeshFilter'].m_Mesh if 'MeshFilter' in comp else None
        if renderer and pointer and renderer.m_Enabled:
            result=self.mesh(pointer, renderer.m_Materials, comp.get('SkinnedMeshRenderer'))
            if result:
                node['mesh']=result[0]
                p=result[1]
                transformed=(cumulative@np.column_stack([p,np.ones(len(p))]).T).T[:,:3]
                self.bounds.extend([transformed.min(axis=0).tolist(),transformed.max(axis=0).tolist()])
        colliders=[]
        for kind in ['BoxCollider','SphereCollider','CapsuleCollider','MeshCollider']:
            if kind not in comp: continue
            c=comp[kind]
            item={'type':kind,'enabled':c.m_Enabled,'isTrigger':c.m_IsTrigger}
            for attr in ['m_Center','m_Size']:
                if hasattr(c,attr):
                    item[attr[2:].lower()]=vec(getattr(c,attr))
                    if attr=='m_Center':item['center'][0]*=-1
            for attr in ['m_Radius','m_Height','m_Direction']:
                if hasattr(c,attr):item[attr[2:].lower()]=getattr(c,attr)
            colliders.append(item)
        if colliders:node['extras']['colliders']=colliders
        children=[]
        for child in t.m_Children:
            child_go=child.read().m_GameObject.read()
            if not child_go.m_IsActive and not include_inactive:continue
            children.append(self.add_go(child_go,include_inactive=include_inactive,parent_matrix=cumulative))
        if children:node['children']=children
        return idx

    def save(self,path):
        for key in ['images','textures','materials','meshes']:
            if not self.document[key]:del self.document[key]
        if 'textures' not in self.document:self.document.pop('samplers',None)
        self.document['buffers']=[{'byteLength':len(self.binary)}]
        encoded=json.dumps(self.document,separators=(',',':'),allow_nan=False).encode()
        encoded+=b' '*(-len(encoded)%4)
        self.binary.extend(b'\0'*(-len(self.binary)%4))
        length=12+8+len(encoded)+8+len(self.binary)
        path.write_bytes(struct.pack('<4sII',b'glTF',2,length)+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(self.binary),b'BIN\0')+self.binary)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime',type=Path,default=ROOT/'local/builds/RightRightRight-0.3.0-alpha.5/player/GameRuntime_Data')
    parser.add_argument('--output',type=Path,default=ROOT/'web/public/assets')
    parser.add_argument('--ui-only',action='store_true',help='Add original font and native GameSkin textures/metrics without changing other asset exports')
    args=parser.parse_args()
    if not (args.runtime/'level1').exists():parser.error('runtime must contain original level1 and sharedassets files')
    exporter=Exporter(args.runtime,args.output)
    if args.ui_only:exporter.run_ui()
    else:exporter.run()


if __name__=='__main__':main()
