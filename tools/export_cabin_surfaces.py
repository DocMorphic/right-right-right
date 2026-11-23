#!/usr/bin/env python3
"""Export original cabin lighting and per-material feature flags."""
import argparse,hashlib,json,struct
from pathlib import Path
import numpy as np
from export_web_assets import Exporter,ROOT,local_matrix,color

def rendering_settings(runtime,e):
    """Pinned URP v13 serialized settings, with header/version validation."""
    import UnityPy
    pipeline=UnityPy.load(str(runtime/'globalgamemanagers.assets'))
    asset=next(o for o in pipeline.objects if o.type.name=='MonoBehaviour' and getattr(o.read(check_read=False),'m_Name','')=='PC_RPAsset')
    raw=asset.get_raw_data()
    if struct.unpack_from('<ii',raw,44)!=(13,13):raise ValueError('Unsupported original render-pipeline layout.')
    value=lambda offset,fmt='f':struct.unpack_from('<'+fmt,raw,offset)[0]
    if value(184,'i')!=2048 or value(232,'i')!=4:raise ValueError('Unexpected original shadow atlas/cascades.')
    light=next(c.component.read() for c in e.find('Sun').m_Component if c.component.type.name=='Light')
    motion=next(o for o in e.environment.objects if o.type.name=='MonoBehaviour' and getattr(o.read(check_read=False),'m_Name','')=='MotionBlur')
    m=motion.get_raw_data();name_length=struct.unpack_from('<i',m,28)[0];start=(32+name_length+3)&~3
    active,mode_override,mode,quality_override,quality,intensity_override,intensity,clamp_override,clamp=struct.unpack_from('<6IfIf',m,start)
    if mode!=0 or quality not in [0,1,2]:raise ValueError('Unsupported original motion-blur mode.')
    shadows={'sourceFile':asset.assets_file.name,'sourcePathId':asset.path_id,'sourceSha256':hashlib.sha256(raw).hexdigest(),
        'atlasResolution':value(184,'i'),'distance':value(228),'cascadeCount':value(232,'i'),'cascadeSplits':list(struct.unpack_from('<3f',raw,248)),
        'cascadeBorder':value(260),'softQuality':value(284,'i'),'strength':light.m_Shadows.m_Strength,
        'depthBias':light.m_Shadows.m_Bias,'normalBias':light.m_Shadows.m_NormalBias,'nearPlane':light.m_Shadows.m_NearPlane}
    blur={'sourceFile':motion.assets_file.name,'sourcePathId':motion.path_id,'sourceSha256':hashlib.sha256(m).hexdigest(),
        'active':bool(active and intensity_override),'mode':'CameraOnly','quality':['Low','Medium','High'][quality],
        'intensity':intensity,'clamp':clamp,'iterations':[2,3,4][quality],'cabinExcluded':True}
    return shadows,blur

def export(runtime,output):
    e=Exporter(runtime,output);settings=next(o.read() for o in e.scene.objects.values() if o.type.name=='RenderSettings')
    sun=e.go_transform(e.find('Sun'));direction=local_matrix(sun)[:3,:3]@np.array([0.,0.,-1.]);direction[0]*=-1
    materials={}
    for o in e.environment.objects:
        if o.type.name=='Material':
            d=o.read();floats=dict(d.m_SavedProperties.m_Floats)
            materials[d.m_Name]={'environmentReflections':floats.get('_EnvironmentReflections',1)>0,'specularHighlights':floats.get('_SpecularHighlights',1)>0}
            if d.m_Name=='Car_Glass':
                glass={'sourceFile':o.assets_file.name,'sourcePathId':o.path_id,'colors':{key:color(value) for key,value in d.m_SavedProperties.m_Colors},'floats':floats}
    result={'source':'Original level1 RenderSettings and Sun transform; material feature flags from original materials',
        'sunDirection':direction.tolist(),'ambientSky':color(settings.m_AmbientSkyColor),'ambientEquator':color(settings.m_AmbientEquatorColor),
        'ambientGround':color(settings.m_AmbientGroundColor),'ambientIntensity':settings.m_AmbientIntensity,'materials':materials,
        'glass':glass,'postprocessing':{'source':'sharedassets1.assets VolumeProfile335 / Tonemapping336 / Vignette331','tonemap':'UnityNeutral','exposure':1,'vignette':{'color':[.05,.05,.06],'intensity':.18,'smoothness':.38,'center':[.5,.5]}}}
    result['shadows'],result['postprocessing']['motionBlur']=rendering_settings(runtime,e)
    result['renderers']={}
    for go_id,components in e.components.items():
        renderer=components.get('SkinnedMeshRenderer') or components.get('MeshRenderer')
        if renderer is not None:
            result['renderers'][str(go_id)]={'castShadows':renderer.m_CastShadows!=0,'receiveShadows':renderer.m_ReceiveShadows,'castingMode':renderer.m_CastShadows}
    # The runtime has its own baked RGBM cube. A fresh reflection generated from
    # the background PNGs changes the cabin's colour and specular response.
    cube=settings.m_GeneratedSkyboxReflection.read()
    if cube.m_TextureFormat!=4 or cube.m_ImageCount!=6:
        raise ValueError('Expected the original six-face RGBA32 reflection cube.')
    width=cube.m_Width;raw=cube.get_image_data();faces=[];decoded=[];mips=[]
    reflection_dir=output/'reflections';reflection_dir.mkdir(parents=True,exist_ok=True)
    for face in range(6):
        offset=face*cube.m_CompleteImageSize
        pixels=np.frombuffer(raw[offset:offset+width*width*4],dtype=np.uint8).reshape(width,width,4)/255.
        rgb=pixels[:,:,:3];linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
        # Unity RGBM in a linear project: encoded.rgb * alpha^2.2 * 5^2.2.
        rgba=np.ones((width,width,4),dtype='<f2')
        rgba[:,:,:3]=linear*(pixels[:,:,3:]**2.2)*(5**2.2)
        path=reflection_dir/f'native-cabin-{face}.rgba16f';path.write_bytes(rgba.tobytes());decoded.append(rgba[:,:,:3])
        faces.append('/assets/reflections/'+path.name)
    offset=width*width*4
    for level in range(1,cube.m_MipCount):
        size=max(1,width>>level);urls=[]
        for face in range(6):
            start=face*cube.m_CompleteImageSize+offset
            pixels=np.frombuffer(raw[start:start+size*size*4],dtype=np.uint8).reshape(size,size,4)/255.
            rgb=pixels[:,:,:3];linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
            rgba=np.ones((size,size,4),dtype='<f2');rgba[:,:,:3]=linear*pixels[:,:,3:]**2.2*5**2.2
            path=reflection_dir/f'native-cabin-{face}-mip{level}.rgba16f';path.write_bytes(rgba.tobytes());urls.append('/assets/reflections/'+path.name)
        mips.append({'width':size,'faces':urls});offset+=size*size*4
    result['reflection']={'sourceFile':cube.object_reader.assets_file.name,'sourcePathId':cube.object_reader.path_id,
        'sourceSha256':hashlib.sha256(raw).hexdigest(),'width':width,'faces':faces,'type':'RGBA16F','colorSpace':'linear',
        'nativeMipCount':cube.m_MipCount,'decode':{'multiplier':5**2.2,'exponent':2.2,'rgbTransfer':'sRGB to linear'},
        'faceOrder':['+X','-X','+Y','-Y','+Z','-Z'],'meanLinearRgb':np.mean(decoded,axis=(0,1,2),dtype=float).tolist(),
        'mips':mips,'note':'All native prefiltered cube levels preserved. Native surface shader samples source roughness LOD directly, without regenerating a Three PMREM.'}
    path=output/'cabin-surfaces.json';path.write_text(json.dumps(result,indent=2)+'\n');return {'path':str(path),'materials':len(materials)}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--runtime',type=Path,default=ROOT/'local/builds/RightRightRight-0.3.0-alpha.5/player/GameRuntime_Data');p.add_argument('--output',type=Path,default=ROOT/'web/public/assets');a=p.parse_args();print(json.dumps(export(a.runtime,a.output)))
