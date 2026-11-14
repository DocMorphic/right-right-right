"""Rebuild the Windows package on macOS, Linux or Windows from a pinned release.

Requires Python 3.12, tools/portable-requirements.txt and a .NET SDK (8 or newer).
This cross-compiles our extension/launcher; it does not export a native Mac game.
"""
import argparse
import importlib.util
import json
import platform
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

from verify_portable import digest, verify

ROOT = Path(__file__).resolve().parents[1]


def extract(archive, destination):
    destination = Path(destination).resolve()
    if destination.exists():
        raise ValueError('Base extraction directory already exists; choose another cache directory.')
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            relative = PurePosixPath(item.filename.replace('\\', '/'))
            target = (destination / str(relative)).resolve()
            if (not relative.parts or relative.is_absolute() or '..' in relative.parts or
                    not target.is_relative_to(destination) or relative.parts[0] != 'RightRightRight' or
                    (item.external_attr >> 16) & 0o170000 == 0o120000):
                raise ValueError('Unsafe path in base archive.')
        bundle.extractall(destination)


def prepare_base(cache):
    config = json.loads((ROOT / 'tools/portable-base.json').read_text())
    cache = Path(cache).resolve() / config['Tag']
    archive = cache / 'base.zip'
    unpacked = cache / 'extracted'
    player = unpacked / config['PlayerPath']
    cache.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        if not config['Url'].startswith('https://github.com/DocMorphic/right-right-right/releases/download/'):
            raise ValueError('The base must be a pinned project release on GitHub.')
        print(f'Downloading pinned base {config["Tag"]} (about 185 MiB)...', flush=True)
        temporary = cache / 'base.zip.download'
        request = urllib.request.Request(config['Url'], headers={'User-Agent': 'RightRightRight-build'})
        with urllib.request.urlopen(request, timeout=60) as response, temporary.open('wb') as output:
            shutil.copyfileobj(response, output, 1024 * 1024)
        if digest(temporary) != config['Sha256']:
            raise ValueError('Downloaded base checksum mismatch. It will not be extracted or used.')
        temporary.replace(archive)
    if digest(archive) != config['Sha256']:
        raise ValueError('Cached base checksum mismatch. Use a new --cache directory.')
    if not unpacked.exists():
        extract(archive, unpacked)
    print(f'BASE_PASS: {verify(player)} bundled files verified.', flush=True)
    return player


def find_dotnet(override):
    if override:
        candidates = [shutil.which(override) or str(Path(override).resolve())]
    else:
        candidates = [shutil.which('dotnet')]
        local = ROOT / 'local/tools/dotnet' / ('dotnet.exe' if sys.platform == 'win32' else 'dotnet')
        if local.is_file():
            candidates.append(str(local))
    for executable in candidates:
        if not executable:
            continue
        try:
            result = subprocess.run([executable, '--list-sdks'], capture_output=True, text=True, timeout=20)
        except (OSError, subprocess.TimeoutExpired):
            continue
        if result.returncode == 0 and any(int(match.group(1)) >= 8 for line in result.stdout.splitlines()
                                         if (match := re.match(r'(\d+)\.\d+\.\d+', line))):
            return str(executable)
    raise ValueError('No .NET SDK 8+ found (a runtime alone cannot build). Install an SDK or supply --dotnet /path/to/dotnet.')


def run(command):
    subprocess.run(command, cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-player', type=Path, help='Existing verified extracted player; otherwise fetch the pinned release.')
    parser.add_argument('--cache', type=Path, default=ROOT / 'local/portable-base')
    parser.add_argument('--output', type=Path, default=ROOT / ('local/builds/windows-' + time.strftime('%Y%m%d-%H%M%S')))
    parser.add_argument('--relay-config', type=Path, default=ROOT / 'standalone/rrr-relay.production.json')
    parser.add_argument('--dotnet', help='SDK executable (not a Windows runtime under Wine).')
    parser.add_argument('--no-archive', action='store_true')
    args = parser.parse_args()
    if sys.version_info < (3, 11):
        raise ValueError('Python 3.11+ is required; Python 3.12 is recommended for the pinned dependencies.')
    if importlib.util.find_spec('UnityPy') is None:
        raise ValueError('Install dependencies first: python -m pip install -r tools/portable-requirements.txt')
    dotnet = find_dotnet(args.dotnet)
    output = args.output.resolve()
    if output.exists() or output.parent.joinpath(output.name + '.zip').exists():
        raise ValueError('Build output already exists; choose a new --output directory.')
    print(f'Build host: {platform.system()} {platform.machine()}; game target: Windows x64.', flush=True)
    player = args.base_player.resolve() if args.base_player else prepare_base(args.cache)
    if args.base_player:
        print(f'BASE_PASS: {verify(player)} files verified.', flush=True)
    # The published release includes all managed compile references. No Steam
    # install, home-PC path or interop generation is involved on the build host.
    run([dotnet, 'build', str(ROOT / 'src/RightRightRight.csproj'), '-c', 'Release', '--nologo', f'-p:GameDir={player}'])
    launcher = ROOT / 'local/cross-build/launcher'
    run([dotnet, 'publish', str(ROOT / 'standalone/RightRightRight.Launcher.csproj'), '-c', 'Release',
         '-r', 'win-x64', '--self-contained', 'true', '-o', str(launcher), '--nologo'])
    from package_portable import package
    package(player, launcher / 'RightRightRight.exe', output, direct=True,
            archive=not args.no_archive, relay_config=args.relay_config)
    count = verify(output / 'player')
    report = dict(HostOS=platform.system(), HostArchitecture=platform.machine(), Target='win-x64',
                  NativeMacGame=False, ManifestFiles=count, PackageVerified=True)
    (output.parent / (output.name + '.build.json')).write_text(json.dumps(report, indent=2) + '\n')
    print(f'BUILD_PASS: {count} files; {output / "player/RightRightRight.exe"}', flush=True)
    print('This is a Windows game package. macOS play requires a separately tested compatibility layer.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        print('BUILD_FAILED: ' + str(error), file=sys.stderr)
        sys.exit(1)
