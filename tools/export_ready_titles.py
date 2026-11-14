#!/usr/bin/env python3
"""Targeted original Anton ready-panel lettering; no models are rebuilt."""
import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path

from export_web_assets import Exporter, ROOT


def export_titles(runtime, output):
    output.mkdir(parents=True, exist_ok=True)
    titles = [('CONTROLS', 'ReadyControlsTitle.png', 52), ('DRIVER', 'ReadyDriverTitle.png', 26),
        ('NAVIGATOR', 'ReadyNavigatorTitle.png', 26), ('PRESS R WHEN READY', 'ReadyFooter.png', 36)]
    for driver in (False, True):
        for navigator in (False, True):
            text = 'DRIVER  ' + ('READY' if driver else '\u2014') + '      NAVIGATOR  ' + ('READY' if navigator else '\u2014')
            titles.append((text, f'ReadyStatus{int(driver)}{int(navigator)}.png', 22))
    result = []
    with tempfile.TemporaryDirectory(prefix='rrr-original-ready-titles-') as folder:
        staging = Path(folder); (staging / 'ui').mkdir()
        exporter = Exporter(runtime, staging)
        for text, filename, size in titles:
            reference = {'nodes': [{'text': {'fontAsset': 'Anton-Regular SDF', 'value': text,
                'fontSize': size, 'color': [1, 1, 1, 1]}}]}
            metadata = exporter.main_menu_title(reference)
            target = output / filename; shutil.copyfile(staging / 'ui/MainMenuTitle.png', target)
            metadata.update(url='/assets/ui/' + filename, sha256=hashlib.sha256(target.read_bytes()).hexdigest())
            result.append(metadata)
    report = {'source': 'Native StageReadyOverlay.Build RVA0x549E20 / Apply0x549BB0; original Anton atlas',
        'copyright': 'Original game and artwork: Stellux Interactive. Authorized original content; excluded from source-code MIT license.',
        'titles': result,
        'nativePanel': {'referenceResolution': [1920, 1080], 'size': [980, 620],
            'paletteSource': 'GameUiColors .cctor token0x60002E9 RVA0x539C60',
            'palette': {'Backdrop': [.14, .13, .12, 1], 'Panel': [.08, .075, .07, .96],
                'Amber': [1, .69, .13, 1], 'Sand': [.86, .78, .58, 1], 'Dim': [.52, .48, .4, 1]},
            'driverControls': 'W / S     throttle / brake\nA / D     steer\nSPACE     handbrake\nMOUSE     look around',
            'navigatorControls': 'E            grab / drop tablet\nHOLD E       dash knob = wipers\n             (drop tablet first)\nLMB + look   grab open door, slam shut\nMOUSE        look around',
            'bodyFont': 'ShareTechMono-Regular', 'bodyFontSize': 20,
            'rectsTopDown': {'title': [39.2, 12.4, 901.6, 74.4], 'driverHead': [58.8, 86.8, 411.6, 62],
                'driverBody': [58.8, 148.8, 411.6, 248], 'navigatorHead': [509.6, 86.8, 411.6, 62],
                'navigatorBody': [509.6, 148.8, 411.6, 285.2], 'footer': [58.8, 458.8, 862.4, 86.8],
                'status': [39.2, 545.6, 901.6, 62]}},
        'note': 'White original 96px glyph masks. Preserve aspect; scale by nativeTextFontSize/sourceFontSize before viewport scaling. Source UI references do not establish browser interaction/rendering parity.'}
    (output / 'ReadyTitles.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=ROOT / 'local/builds/RightRightRight-0.3.0-alpha.5/player/GameRuntime_Data')
    parser.add_argument('--output', type=Path, default=ROOT / 'web/public/assets/ui')
    args = parser.parse_args()
    print(json.dumps(export_titles(args.runtime, args.output), indent=2))
