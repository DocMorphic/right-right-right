"""Build one self-contained Windows setup EXE carrying the entire verified game."""
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from build_from_release import find_dotnet, extract
from verify_portable import verify

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, required=True, help='Complete standalone ZIP, not the legacy mod installer.')
    parser.add_argument('--output', type=Path, default=ROOT / 'local/friend-installer')
    parser.add_argument('--dotnet')
    args = parser.parse_args()
    archive = args.package.resolve()
    sdk = find_dotnet(args.dotnet)
    with tempfile.TemporaryDirectory(prefix='rrr-installer-') as temporary:
        folder = Path(temporary)
        unpacked = folder / 'package'
        extract(archive, unpacked)
        player = unpacked / 'RightRightRight/player'
        count = verify(player)
        config = json.loads((player / 'rrr-distribution.json').read_text(encoding='utf-8-sig'))
        if config.get('State') != 'direct' or config.get('SteamAppId') is not None or config.get('ContentVersion') != '0.3.0-alpha.5':
            raise ValueError('Installer input must be the current standalone build without Steam/playtest setup.')
        if not (player / 'GameRuntime.exe').is_file() or (player / 'GameRuntime_Data/app.info').read_text() != 'DocMorphic\nRightRightRight':
            raise ValueError('Rebuild the package with the current independent-game identity before making its installer.')
        checksum = folder / 'player.sha256'
        with archive.open('rb') as stream:
            checksum.write_text(hashlib.file_digest(stream, 'sha256').hexdigest())
        output = args.output.resolve()
        output.mkdir(parents=True, exist_ok=True)
        subprocess.run([sdk, 'publish', str(ROOT / 'standalone/installer/RightRightRight.Setup.csproj'), '-c', 'Release',
                        '-r', 'win-x64', '--self-contained', 'true', '-o', str(output), '--nologo',
                        '-p:PortablePackageZip=' + str(archive), '-p:PortablePackageHash=' + str(checksum)], check=True)
    executable = output / 'RightRightRight-Setup.exe'
    with executable.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    (output / 'SHA256SUMS.txt').write_text(digest + '  ' + executable.name + '\n')
    print(f'INSTALLER_PASS: {count} game files embedded; {executable}')
    print('Recipients run only this EXE. The game and runtimes are bundled; no Steam/playtest or developer setup is used.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print('INSTALLER_FAILED: ' + str(error), file=sys.stderr)
        sys.exit(1)
