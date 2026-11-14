"""Check a Windows portable package on any build OS without executing its EXE."""
import argparse
import hashlib
import json
import re
from pathlib import Path, PurePosixPath


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify(player):
    player = Path(player).resolve()
    manifest = json.loads((player / 'package-manifest.json').read_text(encoding='utf-8-sig'))
    files = manifest.get('Files')
    if manifest.get('Format') != 1 or not isinstance(files, dict) or not files:
        raise ValueError('Invalid or empty package manifest.')
    for name, expected in files.items():
        relative = PurePosixPath(name.replace('\\', '/'))
        target = (player / str(relative)).resolve()
        if relative.is_absolute() or '..' in relative.parts or not target.is_relative_to(player):
            raise ValueError('Manifest path escapes the player directory.')
        if not isinstance(expected, str) or not re.fullmatch('[0-9a-fA-F]{64}', expected):
            raise ValueError('Invalid package checksum: ' + name)
        if digest(target) != expected.lower():
            raise ValueError('Package file is missing or damaged: ' + name)
    return len(files)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('player', type=Path)
    args = parser.parse_args()
    print(f'PACKAGE_PASS: {verify(args.player)} manifest files verified without launching Windows.')
