"""Create an isolated player and append six scenes; never edits the Steam installation."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
import UnityPy

ROOT = Path(__file__).resolve().parents[1]

def prepare(source: Path, destination: Path):
    source, destination = source.resolve(), destination.resolve()
    if source == destination or source in destination.parents or destination in source.parents:
        raise ValueError('Source and destination must be separate directories.')
    data = source / 'LeftLeftLEFT_Data'
    missing = [name for name in ('LeftLeftLEFT.exe', 'GameAssembly.dll', 'LeftLeftLEFT_Data/level3')
               if not (source / name).is_file()]
    if missing:
        raise ValueError(f'Game files were not found in {source}. Missing: {", ".join(missing)}. '
                         'Use the folder opened by Steam > Manage > Browse local files, and pass it with -GamePath.')
    supported = json.loads((ROOT / 'tools/supported-build.json').read_text())
    for name, expected_hash in supported['Files'].items():
        if hashlib.sha256((source / name).read_bytes()).hexdigest() != expected_hash:
            raise ValueError(f'Unsupported source file: {name}. Expected Steam build {supported["SteamBuildId"]}. No files written.')
    stages = json.loads((ROOT / 'levels/stages.json').read_text())
    env = UnityPy.load(str(data / 'globalgamemanagers'))
    settings = next(o for o in env.objects if o.type.name == 'BuildSettings')
    tree = settings.read_typetree()
    expected = ['Assets/Scenes/Menu.unity', 'Assets/Scenes/1.unity', 'Assets/Scenes/2.unity', 'Assets/Scenes/3.unity']
    if tree['scenes'] != expected or tree['m_Version'] != '6000.3.16f1':
        raise ValueError('Unsupported player version/scene layout; no files written.')
    manifest = {name: hashlib.sha256((source / name).read_bytes()).hexdigest()
                for name in ['GameAssembly.dll', 'UnityPlayer.dll', 'LeftLeftLEFT_Data/level1', 'LeftLeftLEFT_Data/globalgamemanagers']}
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, destination, dirs_exist_ok=True)
    out_data = destination / 'LeftLeftLEFT_Data'
    for index, stage in enumerate(stages, 4):
        shutil.copy2(data / 'level1', out_data / f'level{index}')
        tree['scenes'].append(f"Assets/Scenes/{stage['Scene']}.unity")
    settings.save_typetree(tree)
    (out_data / 'globalgamemanagers').write_bytes(env.file.save())
    config = destination / 'UserData' / 'RightRightRight'
    config.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'levels/stages.json', config / 'stages.json')
    (config / 'source-hashes.json').write_text(json.dumps(manifest, indent=2))
    print(f'Prepared {destination}: 3 original + {len(stages)} additional stages.')

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True, type=Path)
    ap.add_argument('--destination', type=Path, default=ROOT / 'local/playable')
    args = ap.parse_args()
    prepare(args.source, args.destination)
