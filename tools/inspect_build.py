"""Read-only inventory of the installed Unity player. No Steam/account data is read."""
import argparse
import collections
import json
from pathlib import Path
import UnityPy

def inspect(data_dir: Path, output: Path):
    result = {}
    for path in sorted(data_dir.iterdir()):
        if not (path.name.startswith('level') or path.name.endswith('.assets') or path.name == 'globalgamemanagers'):
            continue
        env = UnityPy.load(str(path))
        counts = collections.Counter()
        objects = []
        for obj in env.objects:
            counts[obj.type.name] += 1
            if obj.type.name in ('GameObject', 'MonoScript', 'MonoBehaviour', 'BuildSettings', 'PlayerSettings', 'Transform'):
                try:
                    tree = obj.read_typetree()
                    objects.append({'id': obj.path_id, 'type': obj.type.name, 'data': tree})
                except Exception as exc:
                    objects.append({'id': obj.path_id, 'type': obj.type.name, 'error': str(exc), 'bytes': obj.byte_size})
        result[path.name] = {'unity': env.file.unity_version, 'counts': dict(counts), 'objects': objects}
        print(path.name, dict(counts), flush=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2), encoding='utf-8')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('data_dir', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    inspect(args.data_dir, args.output)
