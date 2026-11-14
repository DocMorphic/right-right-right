#!/usr/bin/env python3
"""Export original Anton digit masks for the requested browser countdown.

Glyph artwork and timing are native references. A centered screen layout is
user-requested browser presentation, not a recovered native screen canvas.
"""
import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path

from export_web_assets import Exporter, ROOT


def export(runtime, output):
    output.mkdir(parents=True, exist_ok=True); digits = []
    with tempfile.TemporaryDirectory(prefix='rrr-countdown-glyphs-') as folder:
        staging = Path(folder); (staging / 'ui').mkdir()
        exporter = Exporter(runtime, staging)
        for digit in ['5', '4', '3', '2', '1']:
            reference = {'nodes': [{'text': {'fontAsset': 'Anton-Regular SDF', 'value': digit,
                'fontSize': 96, 'color': [1, 1, 1, 1]}}]}
            metadata = exporter.main_menu_title(reference)
            filename = f'Countdown{digit}.png'; target = output / filename
            shutil.copyfile(staging / 'ui/MainMenuTitle.png', target)
            metadata.pop('nativeTextFontSize', None)
            metadata['referenceColor'] = metadata.pop('nativeTextColor')
            metadata['note'] = 'White alpha digit mask composed from original Anton atlas glyph pixels and metrics. Screen layout, size and tint are browser presentation choices; no original screen-countdown canvas was recovered.'
            metadata.update(url='/assets/ui/' + filename, digit=int(digit),
                referenceFontSize=96, sha256=hashlib.sha256(target.read_bytes()).hexdigest())
            digits.append(metadata)
    report = {'schemaVersion': 1, 'digits': digits,
        'source': 'Original Anton-Regular SDF atlas; StageController.BeginCountdown RVA0x529B50 / Update0x52B140',
        'timing': {'digits': [5, 4, 3, 2, 1], 'secondsPerDigit': 1, 'totalSeconds': 5,
            'afterLastDigit': 'Race begins, native RacingDigit=0; no GO text recovered.'},
        'presentation': 'Visible screen countdown requested by the user. Cached original runtime shows tablet digits; no native centered countdown Canvas, screen font size or screen position was found. Do not claim native layout recovery.',
        'copyright': 'Original glyph artwork: Stellux Interactive. Authorized original content; excluded from source-code MIT license.'}
    (output / 'CountdownTitles.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=ROOT / 'local/builds/RightRightRight-0.3.0-alpha.5/player/GameRuntime_Data')
    parser.add_argument('--output', type=Path, default=ROOT / 'web/public/assets/ui')
    args = parser.parse_args(); print(json.dumps(export(args.runtime, args.output), indent=2))
