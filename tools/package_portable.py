"""Bundle a prepared, licensed player without any recipient-side Steam install lookup."""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

import UnityPy

ROOT = Path(__file__).resolve().parents[1]
BLOCKED_IDS = {0, 480, 5425110}


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def package(source: Path, launcher: Path, output: Path, app_id=None, archive=True):
    source, launcher, output = source.resolve(), launcher.resolve(), output.resolve()
    if app_id is not None and (app_id in BLOCKED_IDS or not 0 < app_id <= 0xFFFFFFFF):
        raise ValueError('Use the separately assigned Right Right Right Steam App ID.')
    if output.exists():
        raise ValueError('Output already exists. Choose a new output folder; packaging never overwrites a build.')
    if source == output or source in output.parents or output in source.parents:
        raise ValueError('Source and output must be separate directories.')
    required = ['LeftLeftLEFT.exe', 'GameAssembly.dll', 'UnityPlayer.dll', 'baselib.dll', 'version.dll',
                'LeftLeftLEFT_Data', 'dotnet', 'MelonLoader/net6', 'MelonLoader/Dependencies',
                'MelonLoader/Il2CppAssemblies', 'MelonLoader/Dependencies/Il2CppAssemblyGenerator/Config.cfg']
    for name in required:
        if not (source / name).exists():
            raise ValueError('Prepared player component missing: ' + name)
    if not launcher.is_file() or not (ROOT / 'src/bin/Release/net6.0/RightRightRight.dll').is_file():
        raise ValueError('Build the portable launcher and mod before packaging.')
    supported = json.loads((ROOT / 'tools/supported-build.json').read_text())
    for name in ['GameAssembly.dll', 'LeftLeftLEFT_Data/level1']:
        if digest(source / name) != supported['Files'][name]:
            raise ValueError('Unsupported runtime: ' + name)

    env = UnityPy.load(str(source / 'LeftLeftLEFT_Data/globalgamemanagers'))
    settings = next(o for o in env.objects if o.type.name == 'BuildSettings')
    tree = settings.read_typetree()
    expected = ['Assets/Scenes/Menu.unity'] + [f'Assets/Scenes/{i}.unity' for i in range(1, 4)]
    expected += [f"Assets/Scenes/{s['Scene']}.unity" for s in json.loads((ROOT / 'levels/stages.json').read_text())]
    if tree['scenes'] != expected:
        raise ValueError('Prepared player must contain the nine expected scenes.')
    # This value belongs to the original build environment, not our game identity.
    # Do not print it, put it in a manifest, or ship it in the portable download.
    token = tree.get('m_AuthToken', '')
    tree['m_AuthToken'] = ''
    settings.save_typetree(tree)
    sanitized = env.file.save()
    if token and token.encode() in sanitized:
        raise ValueError('Original build token survived sanitization.')

    player = output / 'player'
    player.mkdir(parents=True)
    total = len(required)
    for index, name in enumerate(required, 1):
        src, dest = source / name, player / name
        print(f'Bundling component {index}/{total}: {name}', flush=True)
        if src.is_dir():
            shutil.copytree(src, dest, ignore=shutil.ignore_patterns('*.log', 'Logs', 'Latest.log'))
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
    if (source / 'D3D12').exists():
        shutil.copytree(source / 'D3D12', player / 'D3D12')
    (player / 'LeftLeftLEFT_Data/globalgamemanagers').write_bytes(sanitized)
    shutil.copy2(launcher, player / 'RightRightRight.exe')
    (player / 'Mods').mkdir()
    shutil.copy2(ROOT / 'src/bin/Release/net6.0/RightRightRight.dll', player / 'Mods/RightRightRight.dll')
    settings_dir = player / 'UserData/RightRightRight'
    settings_dir.mkdir(parents=True)
    shutil.copy2(ROOT / 'levels/stages.json', settings_dir / 'stages.json')
    config = {'Format': 1, 'State': 'configured' if app_id else 'pending-steam',
              'SteamAppId': app_id, 'ContentVersion': '0.3.0-alpha.1'}
    (player / 'rrr-distribution.json').write_text(json.dumps(config, indent=2))
    licenses = output / 'Licenses'
    licenses.mkdir()
    shutil.copy2(ROOT / 'LICENSE', licenses / 'RightRightRight-code-MIT.txt')
    shutil.copy2(ROOT / 'installer/MELONLOADER-LICENSE.txt', licenses / 'MelonLoader.txt')
    (licenses / 'Original-game.txt').write_text(
        'Original game runtime, artwork, audio, characters and bundled game dependencies are not covered by '
        'the Right Right Right source-code MIT license. Original game: Stellux Interactive. '
        'This distribution relies on the developer permission stated by the project owner.\n')
    (output / 'READ-ME.txt').write_text(
        'RIGHT RIGHT RIGHT / PORTABLE BUILD\n'
        'Extract the entire download. Open player/RightRightRight.exe.\n'
        'All game files and the loader runtime are bundled. No original playtest installation, Python, '
        '.NET SDK, setup commands or first-launch downloads are required.\n'
        'Steam invites require this game\'s own configured Steam App ID, Steam running, and access '
        'to this game on each account.\n'
        + ('STEAM CONFIGURATION PENDING: this is an engineering candidate, not a player release.\n'
           if not app_id else 'A configured App ID is not a substitute for assigning Steam account access.\n')
        + 'Diagnostics: player/Logs/launcher.log and player/MelonLoader/Latest.log.\n')
    files = {p.relative_to(player).as_posix(): digest(p) for p in sorted(player.rglob('*')) if p.is_file()}
    manifest = {'Format': 1, 'SteamState': config['State'], 'Files': files}
    (player / 'package-manifest.json').write_text(json.dumps(manifest, indent=2))
    if archive:
        archive_path = output.with_suffix('.zip')
        if archive_path.exists():
            raise ValueError('Archive already exists; choose a new output name.')
        print('Compressing complete portable build...', flush=True)
        with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
            for file in sorted(output.rglob('*')):
                if file.is_file():
                    bundle.write(file, Path('RightRightRight') / file.relative_to(output))
        archive_path.with_suffix('.sha256').write_text(digest(archive_path) + '  ' + archive_path.name + '\n')
    print(f'PORTABLE_PACKAGE_PASS: {len(files)} bundled files; Steam state={config["State"]}; build token removed.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--launcher', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--app-id', type=int)
    parser.add_argument('--no-archive', action='store_true')
    args = parser.parse_args()
    package(args.source, args.launcher, args.output, args.app_id, not args.no_archive)
