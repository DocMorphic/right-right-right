#!/usr/bin/env python3
"""Export original terrain, background forest and existing roadside props.

Generated original assets stay ignored; this adds no invented scenery.
"""
import argparse
import hashlib
import json
import math
import tempfile
from collections import Counter
from pathlib import Path

import numpy as np

from export_native_courses import load_scene, reflected_world, rounded, digest
from export_web_assets import ROOT, TREES, REFLECT, local_matrix, vec, color, safe_name

_MATERIAL_CACHE = {}


def write_json(path, value):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(rounded(value), separators=(',', ':'), allow_nan=False) + '\n')
    temporary.replace(path)


def material_spec(pointer):
    reader = pointer.deref()
    key = (reader.assets_file.name, reader.path_id)
    if key in _MATERIAL_CACHE: return _MATERIAL_CACHE[key]
    d = pointer.read(); colors = dict(d.m_SavedProperties.m_Colors); floats = dict(d.m_SavedProperties.m_Floats)
    shader = d.m_Shader.read()
    result = {'name': d.m_Name, 'color': color(colors.get('_BaseColor', colors.get('_Color'))) if colors else [1, 1, 1, 1],
        'roughness': max(.04, 1 - floats.get('_Smoothness', floats.get('_Glossiness', 0))),
        'doubleSided': floats.get('_Cull', 2) == 0, 'unlit': 'Unlit' in (shader.m_Name or shader.m_ParsedForm.m_Name)}
    _MATERIAL_CACHE[key] = result
    return result


def export_scene(e, number, assets, tree_bases, prop_models, prop_bases):
    output = assets / 'scenery'; output.mkdir(parents=True, exist_ok=True)
    e.output = output / 'models'; e.output.mkdir(exist_ok=True)
    e.texture_manifest = {}; e.material_inventory = {}; e.warnings = []
    terrain_obj = next(o for o in e.scene.objects.values() if o.type.name == 'Terrain')
    terrain = terrain_obj.read(); data_ptr = terrain.m_TerrainData.deref(); data = data_ptr.read(); h = data.m_Heightmap
    resolution = h.m_Resolution
    heights = np.asarray(h.m_Heights, dtype='<u2')
    if len(heights) != resolution * resolution: raise ValueError('Unexpected native terrain resolution.')
    height_file = output / f'native-{number:02}.heights.bin'; height_file.write_bytes(heights.tobytes())
    texture_records = {}
    def texture(pointer, normal=False):
        if not pointer.m_PathID: return None
        # Use the existing DXT5nm conversion for normals, isolated from other assets.
        with tempfile.TemporaryDirectory(prefix='rrr-scenery-texture-') as folder:
            before = e.output; e.output = Path(folder); e.texture_manifest = {}
            url = e.texture(pointer, normal=normal)
            path = e.output / url.removeprefix('/assets/'); content = path.read_bytes(); e.output = before
        sha = hashlib.sha256(content).hexdigest(); name = sha[:12] + '-' + path.name
        target = output / 'textures' / name; target.parent.mkdir(exist_ok=True); target.write_bytes(content)
        result = '/assets/scenery/textures/' + name
        texture_records[result] = {'sha256': sha, 'sourceFile': pointer.deref().assets_file.name, 'sourcePathId': pointer.m_PathID}
        return result
    layers = []
    for pointer in data.m_SplatDatabase.m_TerrainLayers:
        layer = pointer.read()
        layers.append({'name': layer.m_Name, 'diffuse': texture(layer.m_DiffuseTexture),
            'normal': texture(layer.m_NormalMapTexture, True), 'tileSize': vec(layer.m_TileSize, 2),
            'tileOffset': vec(layer.m_TileOffset, 2), 'tint': vec(layer.m_DiffuseRemapMax, 4),
            'normalScale': layer.m_NormalScale, 'metallic': layer.m_Metallic, 'roughness': 1 - layer.m_Smoothness})
    splats = []
    for i, pointer in enumerate(data.m_SplatDatabase.m_AlphaTextures):
        # Only three terrain layers exist. Drop unused zero alpha to prevent an
        # image decoder from premultiplying away the original RGB data weights.
        image = pointer.read().image.convert('RGB')
        name = f'native-{number:02}.splat-{i}.png'; image.save(output / name, optimize=True)
        splats.append({'url': '/assets/scenery/' + name, 'size': [image.width, image.height],
            'channels': 'RGB = terrain layers 0,1,2; original byte values; unused zero alpha removed',
            'colorSpace': 'linear data; NoColorSpace', 'flipY': False})
    tree_instances, props, material_sets = [], [], []
    material_ids = {}
    prop_counts = Counter()
    def material_set(renderer):
        spec = [material_spec(p) for p in renderer.m_Materials]
        key = json.dumps(rounded(spec), sort_keys=True)
        if key not in material_ids:
            material_ids[key] = len(material_sets); material_sets.append(spec)
        return material_ids[key]
    def instance(go, base, key, renderer):
        matrix = reflected_world(e, go) @ np.linalg.inv(base)
        scale = float(np.linalg.norm(matrix[:3, 0])); yaw = math.atan2(matrix[0, 2], matrix[2, 2])
        expected = np.array([[math.cos(yaw), 0, math.sin(yaw)], [0, 1, 0], [-math.sin(yaw), 0, math.cos(yaw)]]) * scale
        entry = {'model': key, 'position': matrix[:3, 3].tolist(), 'yaw': yaw, 'scale': scale,
            'materialSet': material_set(renderer), 'solid': False}
        if np.max(np.abs(matrix[:3, :3] - expected)) > 1e-5: entry['matrix'] = matrix.T.reshape(-1).tolist()
        return entry
    def roadside(go):
        t = e.go_transform(go)
        while t.m_Father.m_PathID:
            t = t.m_Father.read(); parent = t.m_GameObject.read()
            if parent.m_Name == 'Roadside_Props': return True
        return False
    for go_id, comp in e.components.items():
        if 'MeshFilter' not in comp or 'MeshRenderer' not in comp: continue
        go = e.gos[go_id]; renderer = comp['MeshRenderer']
        if not go.m_IsActive or not renderer.m_Enabled: continue
        name = go.m_Name.split(' (')[0]
        if name in TREES:
            collider = comp.get('CapsuleCollider')
            if collider is not None and collider.m_Enabled and not collider.m_IsTrigger: continue
            tree_instances.append(instance(go, tree_bases[name], TREES.index(name), renderer))
        elif roadside(go):
            # These are original scene bushes/rocks/stumps, not newly designed props.
            if name not in prop_models:
                model = e.glb(go, safe_name(name) + '.glb', preserve_root_scale=True, preserve_root_rotation=True)
                model['url'] = '/assets/scenery/models/' + safe_name(name) + '.glb'
                prop_models[name] = model
                base = REFLECT @ local_matrix(e.go_transform(go)) @ REFLECT; base[:3, 3] = 0
                prop_bases[name] = base
            props.append(instance(go, prop_bases[name], name, renderer)); prop_counts[name] += 1
    terrain_go = terrain.m_GameObject.read()
    document = {'schemaVersion': 1, 'scene': str(number), 'copyright': 'Original game and assets: Stellux Interactive. Authorized original content; excluded from source-code MIT license.',
        'source': {'levelFile': e.scene.name, 'levelSha256': digest(e.runtime / e.scene.name),
            'terrainFile': data_ptr.assets_file.name, 'terrainPathId': data_ptr.path_id,
            'terrainFileSha256': digest(e.runtime / data_ptr.assets_file.name)},
        'terrain': {'resolution': resolution, 'heightUrl': '/assets/scenery/' + height_file.name,
            'heightEncoding': 'uint16 little endian, row-major [z][x]', 'heightDivisor': 32767,
            'spacing': vec(h.m_Scale), 'size': [(resolution - 1) * h.m_Scale.x, h.m_Scale.y, (resolution - 1) * h.m_Scale.z],
            'matrix': reflected_world(e, terrain_go).T.reshape(-1).tolist(),
            'positionFormula': 'matrix * [-column*spacing.x, height/32767*spacing.y, row*spacing.z, 1]',
            'splatUv': '[column/(resolution-1),1-row/(resolution-1)], Texture.flipY=false',
            'layers': layers, 'splats': splats, 'heightSha256': digest(height_file)},
        'treeVariants': TREES, 'backgroundTrees': tree_instances,
        'placement': 'Root-origin placements relative to each exported model. No collider-center offset; no additional X reflection.',
        'materialSets': material_sets, 'props': props, 'propModels': prop_models,
        'textureSources': texture_records}
    path = output / f'native-{number:02}.json'; write_json(path, document)
    report = {'scene': str(number), 'metadataUrl': '/assets/scenery/' + path.name,
        'heightResolution': resolution, 'heightRange': [int(heights.min()), int(heights.max())],
        'backgroundTrees': len(tree_instances), 'originalProps': dict(prop_counts),
        'metadataBytes': path.stat().st_size, 'metadataSha256': digest(path)}
    print(json.dumps(report), flush=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=ROOT / 'local/builds/RightRightRight-0.3.0-alpha.5/player/GameRuntime_Data')
    parser.add_argument('--assets', type=Path, default=ROOT / 'web/public/assets')
    args = parser.parse_args()
    first = load_scene(args.runtime, 1); bases = {}
    for name in TREES:
        go = next(g for g in first.gos.values() if g.m_Name == name and 'CapsuleCollider' in first.components[g.object_reader.path_id])
        matrix = REFLECT @ local_matrix(first.go_transform(go)) @ REFLECT; matrix[:3, 3] = 0; bases[name] = matrix
    models, prop_bases, reports = {}, {}, []
    for number in (1, 2, 3):
        scene = first if number == 1 else load_scene(args.runtime, number)
        reports.append(export_scene(scene, number, args.assets, bases, models, prop_bases))
        write_json(args.assets / 'scenery/index.json', {'schemaVersion': 1, 'scenes': reports})
    report = ROOT / 'local/web-assets/native-scenery-provenance.json'
    report.write_text(json.dumps(reports, indent=2) + '\n')


if __name__ == '__main__': main()
