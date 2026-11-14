#!/usr/bin/env python3
"""Export native result title masks without rebuilding models or other UI.

Uses the original embedded Anton atlas and the existing native title renderer.
Licensed generated artwork remains an ignored packaging input.
"""
import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path

from export_web_assets import Exporter, ROOT


def export_titles(runtime, output):
    output.mkdir(parents=True, exist_ok=True)
    titles = {}
    with tempfile.TemporaryDirectory(prefix='rrr-native-result-titles-') as temporary:
        staging = Path(temporary)
        (staging / 'ui').mkdir()
        exporter = Exporter(runtime, staging)
        for text, filename in [("TREE'D", 'TreeStampTitle.png'), ('FINISHED', 'FinishStampTitle.png')]:
            reference = {'nodes': [{'text': {'fontAsset': 'Anton-Regular SDF',
                'value': text, 'fontSize': 78, 'color': [1, 1, 1, 1]}}]}
            metadata = exporter.main_menu_title(reference)
            target = output / filename
            shutil.copyfile(staging / 'ui/MainMenuTitle.png', target)
            metadata.update(url='/assets/ui/' + filename,
                sha256=hashlib.sha256(target.read_bytes()).hexdigest())
            titles[text] = metadata
    report = {'copyright': 'Original game and artwork: Stellux Interactive. '
        'Used under developer permission stated by the project owner; excluded from the source-code MIT license.',
        'source': 'Native CrashWreckFX.BuildStamp RVA0x5350D0 and original Anton atlas',
        'titles': titles,
        'resultTime': {'source': 'StageBestTimes.Format RVA0x5294F0',
            'negative': '\u2014', 'below60': 'seconds.ToString("0.00") + "s"',
            'atLeast60': 'floor(seconds/60) + ":" + (seconds-minutes*60).ToString("00.00")'},
        'note': 'White alpha masks from original 96px glyph pixels; browser scales to the native 78px title setting.'}
    (output / 'ResultStampTitles.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path,
        default=ROOT / 'local/builds/RightRightRight-0.3.0-alpha.5/player/GameRuntime_Data')
    parser.add_argument('--output', type=Path, default=ROOT / 'web/public/assets/ui')
    args = parser.parse_args()
    print(json.dumps(export_titles(args.runtime, args.output), indent=2))
