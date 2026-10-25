"""Generate the tiny pinned scene-table delta used by the Python-free friend installer."""
import argparse
import base64
import difflib
import hashlib
import json
from pathlib import Path
import UnityPy

ROOT = Path(__file__).resolve().parents[1]

def make(source_dir: Path, output: Path):
    source_path = source_dir / 'LeftLeftLEFT_Data/globalgamemanagers'
    source = source_path.read_bytes()
    supported = json.loads((ROOT / 'tools/supported-build.json').read_text())
    source_hash = hashlib.sha256(source).hexdigest()
    if source_hash != supported['Files']['LeftLeftLEFT_Data/globalgamemanagers']:
        raise ValueError('Unsupported original scene table.')
    env = UnityPy.load(str(source_path))
    obj = next(o for o in env.objects if o.type.name == 'BuildSettings')
    tree = obj.read_typetree()
    for stage in json.loads((ROOT / 'levels/stages.json').read_text()):
        tree['scenes'].append(f"Assets/Scenes/{stage['Scene']}.unity")
    obj.save_typetree(tree)
    target = env.file.save()
    operations = []
    inserts = bytearray()
    for tag, a, b, c, d in difflib.SequenceMatcher(None, source, target, autojunk=True).get_opcodes():
        if tag == 'equal':
            operations.append({'Copy': a, 'Length': b - a})
        elif tag in ('replace', 'insert'):
            operations.append({'Data': base64.b64encode(target[c:d]).decode('ascii')})
            inserts.extend(target[c:d])
    # Prevent accidental inclusion of an original build authentication value in literal inserts.
    token = tree.get('m_AuthToken', '').encode('ascii')
    if token and token in inserts:
        raise ValueError('Delta unexpectedly contains the original build authentication field.')
    if len(inserts) > 4096:
        raise ValueError('Unexpectedly large scene-table change; inspect before packaging.')
    patch = {'SourceSha256': source_hash, 'TargetSha256': hashlib.sha256(target).hexdigest(), 'Operations': operations}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(patch, separators=(',', ':')))
    print(f'Delta: {len(operations)} operations, {len(inserts)} new bytes; original assets stay local.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'installer/payload/player-delta.json')
    args = parser.parse_args()
    make(args.source, args.output)
