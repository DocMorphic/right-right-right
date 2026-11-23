#!/usr/bin/env python3
"""Export native physical dashboard settings and omitted TextMesh references.

The original car GLB is never changed. Generated original metadata/font outlines
remain ignored licensed assets, separate from authored source code.
"""
import argparse
import hashlib
import io
import json
import math
import struct
from pathlib import Path

import numpy as np
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen

from export_web_assets import Exporter, ROOT, REFLECT, local_matrix, vec, color, three_clock_typeface
from export_native_courses import rounded


def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def full_typeface(data):
    result = three_clock_typeface(data)
    font = TTFont(io.BytesIO(data)); glyph_set = font.getGlyphSet()
    scale = 100000 / (font['head'].unitsPerEm * 72)
    unit = lambda value: math.floor(value * scale + .5)
    class OutlinePen(BasePen):
        def __init__(self): super().__init__(glyph_set); self.commands = []
        def add(self, name, *points):
            self.commands.append(name)
            for point in points: self.commands.extend(str(unit(v)) for v in point)
        def _moveTo(self, p): self.add('m', p)
        def _lineTo(self, p): self.add('l', p)
        def _qCurveToOne(self, control, end): self.add('q', end, control)
        def _curveToOne(self, c1, c2, end): self.add('b', end, c1, c2)
        def _closePath(self): self.add('z')
        def _endPath(self): pass
    glyphs = {}
    for code, name in sorted(font.getBestCmap().items()):
        glyph = glyph_set[name]; pen = OutlinePen(); glyph.draw(pen)
        bounds_pen = BoundsPen(glyph_set); glyph.draw(bounds_pen); bounds = bounds_pen.bounds or (0, 0, 0, 0)
        glyphs[chr(code)] = {'ha': unit(font['hmtx'][name][0]), 'x_min': unit(bounds[0]),
            'x_max': unit(bounds[2]), 'o': ' '.join(pen.commands) + ' '}
    result['glyphs'] = glyphs; result['familyName'] = 'Right Right Right Native Cockpit'
    result['source']['conversion'] = 'All original Unicode cmap glyphs, same native TTF outlines/metrics and Three TTFLoader normalization; derivative name respects source reserved font name.'
    return result


def gauge_fields(data):
    offset = 32
    def take(fmt):
        nonlocal offset
        values = struct.unpack_from('<' + fmt, data, offset); offset += struct.calcsize('<' + fmt); return values
    fields = {}
    for name in ['car', 'carAudio', 'netBridge', 'bodyVisual']: fields[name] = list(take('iq'))
    for name in ['localPosition', 'localEuler']: fields[name] = list(take('3f'))
    for name in ['startAngle', 'endAngle', 'maxSpeedKmh', 'maxRpm', 'needleFollow']: fields[name] = take('f')[0]
    for name in ['housingColor', 'faceColor', 'rimColor', 'tickColor', 'needleColor', 'redlineColor']: fields[name] = list(take('4f'))
    if offset != len(data): raise ValueError('Changed DriverClusterGauges serialized layout.')
    return fields


def export(runtime, assets):
    e = Exporter(runtime, assets)
    components = {}
    for go in e.gos.values():
        for c in go.m_Component:
            o = c.component.deref()
            if o.type.name != 'MonoBehaviour': continue
            d = o.read_typetree(check_read=False, wrap=True)
            try: name = d.m_Script.read().m_ClassName
            except (AttributeError, KeyError): continue
            if name in ['DriverClusterGauges', 'GoofyCarController']: components[name] = o
    source = components['DriverClusterGauges']; settings = gauge_fields(source.get_raw_data())
    text = []
    for go in e.gos.values():
        if 'Transform' not in e.components[go.object_reader.path_id]: continue
        path = []; t = e.go_transform(go)
        while True:
            path.append(t.m_GameObject.read().m_Name)
            if path[-1] == 'ClusterGauges': break
            if not t.m_Father.m_PathID: break
            t = t.m_Father.read()
        if path[-1] != 'ClusterGauges': continue
        for c in go.m_Component:
            o = c.component.deref()
            if o.type.name != 'TextMesh': continue
            d = o.read(); t = e.go_transform(go); matrix = REFLECT @ local_matrix(t) @ REFLECT
            # TextMesh serializes a packed Color32. UnityPy's ColorRGBA helper
            # presents its little-endian bytes backwards for this native field.
            rgba = list(reversed(color(d.m_Color)))
            font = d.m_Font.read() if d.m_Font.m_PathID else None
            text.append({'name': go.m_Name, 'path': list(reversed(path)), 'unityPathId': go.object_reader.path_id,
                'textMeshPathId': o.path_id, 'text': d.m_Text, 'fontSize': d.m_FontSize,
                'characterSize': d.m_CharacterSize, 'fontStyle': d.m_FontStyle,
                'anchor': d.m_Anchor, 'alignment': d.m_Alignment, 'color': rgba,
                'font': font.m_Name if font else None, 'fontPathId': d.m_Font.m_PathID,
                'dynamic': go.m_Name == 'Readout',
                'localTransform': {'position': matrix[:3, 3].tolist(),
                    'rotation': [t.m_LocalRotation.x, -t.m_LocalRotation.y, -t.m_LocalRotation.z, t.m_LocalRotation.w],
                    'scale': vec(t.m_LocalScale)},
                'threeTextSize': d.m_FontSize * d.m_CharacterSize / 10 * 72 / 100})
    text.sort(key=lambda item: '/'.join(item['path']))
    font_obj = next(o for o in e.environment.objects if o.type.name == 'Font' and o.read().m_Name == 'ShareTechMono-Regular')
    font = font_obj.read(); font_bytes = bytes(font.m_FontData); typeface = full_typeface(font_bytes)
    font_path = assets / 'fonts/NativeCockpit.typeface.json'; font_path.parent.mkdir(exist_ok=True)
    font_path.write_text(json.dumps(typeface, separators=(',', ':')) + '\n')
    wheel = e.find('WheelRotationHelper'); raw = components['GoofyCarController'].get_raw_data()
    pointer = struct.pack('<iq', 0, e.go_transform(wheel).object_reader.path_id)
    offset = raw.find(pointer)
    if offset < 0 or raw.find(pointer, offset + 1) >= 0: raise ValueError('Ambiguous native steering wheel reference.')
    angle, x, y, z = struct.unpack_from('<4f', raw, offset + 12)
    report = {'schemaVersion': 1, 'source': 'Original compiled native physical dashboard and TextMesh references',
        'copyright': 'Original game/assets: Stellux Interactive. Authorized original content; excluded from source-code MIT license.',
        'sourceHashes': {name: digest(runtime / name) for name in ['level1', 'sharedassets1.assets', 'resources.assets']},
        'clusterNode': 'ClusterGauges', 'settings': settings,
        'needles': {'speed': {'parent': 'Speedo', 'node': 'NeedlePivot'}, 'rpm': {'parent': 'Tach', 'node': 'NeedlePivot'}},
        'animation': {'sourceLateUpdateRva': '0x50A490', 'sourceSetNeedleRva': '0x50AF40',
            'speedSource': 'Planar rigidbody velocity magnitude *3.6; includes lateral drift. Native active car first, then network motion/velocity fallback.',
            'smoothing': 'display += (target-display)*clamp(1-exp(-needleFollow*dt),0,1)',
            'browserNeedleZDegrees': 'lerp(startAngle,endAngle,clamp(display/max,0,1)); replaces local rotation, not an offset from the zero quaternion',
            'readout': 'RoundToInt(smoothedSpeedKmh).ToString()',
            'limiterActivation': 'CarAudio.OnLimiter RVA0x5335D0: _limiterVol >0.05',
            'limiterDip': 'While CarAudio limiter active: displayRpm - (250+850*clamp(abs(sin(time*21))*abs(sin(time*52)),0,1)); needle only.'},
        'textMeshes': text,
        'font': {'url': '/assets/fonts/NativeCockpit.typeface.json', 'ttfUrl': '/assets/fonts/ShareTechMono-Regular.ttf',
            'licenseUrl': '/assets/fonts/ShareTechMono-OFL.txt', 'sha256': digest(font_path),
            'sourceTtfSha256': hashlib.sha256(font_bytes).hexdigest(), 'glyphs': len(typeface['glyphs']),
            'sourceFile': font_obj.assets_file.name, 'sourcePathId': font_obj.path_id},
        'textGeometry': {'coordinates': 'Attach to existing source TextMesh nodes; generated glyph geometry needs X reflection [-1,1,1] to match reflected native mesh convention.',
            'colorDecode': 'Native TextMesh packed Color32 byte order is reversed relative to UnityPy ColorRGBA channel presentation; exported color is corrected RGBA.',
            'size': 'fontSize*characterSize/10*72/100 for the supplied Three typeface conversion.',
            'alignment': 'Native anchor4=MiddleCenter, alignment1=Center; centre text geometry on its native anchor.'},
        'steeringWheel': {'node': 'WheelRotationHelper', 'maxDegrees': angle, 'axis': [x, y, z],
            'sourceComponentPathId': components['GoofyCarController'].path_id, 'serializedReferenceOffset': offset,
            'note': 'Source maxSteeringWheelAngle is110 degrees. Hand IK generic190-degree fallback is not the source setting.'},
        'tabletReference': {'rootScale': vec(e.go_transform(e.find('Tablet')).m_LocalScale),
            'runtimeRootScale': [.26, .052, .32],
            'physicalDimensionsMeters': [.26, .052, .32],
            'routeTextureSize': 512, 'material': 'RW_TabletBezel, original URP Lit orange; no source diffuse image on bezel',
            'runtimeLayoutSource': '/assets/ui/TabletMinimap.json',
            'runtimeConstructionSource': '/assets/tablet-shell.json',
            'note': 'rootScale records the serialized scene cube. TabletShell.Awake replaces it with runtimeRootScale and constructs 14 protective parts. Apply that runtime construction before positioning the native Screen and timer. Reuse native held anchors; route artwork is generated at runtime.'},
        'scope': 'Physical cluster only; does not enable the separate native fullscreen DriverSpeedometer component. Car GLB untouched; runtime visual parity requires verification.'}
    path = assets / 'cockpit.json'; path.write_text(json.dumps(rounded(report), indent=2) + '\n')
    return {'path': str(path), 'sha256': digest(path), 'textMeshes': len(text), 'fontGlyphs': len(typeface['glyphs']), 'fontBytes': font_path.stat().st_size, 'steeringWheelMaxDegrees': angle}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=ROOT / 'local/builds/RightRightRight-0.3.0-alpha.5/player/GameRuntime_Data')
    parser.add_argument('--assets', type=Path, default=ROOT / 'web/public/assets')
    args = parser.parse_args(); print(json.dumps(export(args.runtime, args.assets), indent=2))
