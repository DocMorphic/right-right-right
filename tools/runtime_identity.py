"""Locate an imported Unity player and set the independent game's identity."""
import struct
import re
from pathlib import Path

RUNTIME = 'GameRuntime'
COMPANY = 'DocMorphic'
PRODUCT = 'RightRightRight'


def find_runtime(source):
    source = Path(source)
    candidates = [p for p in source.glob('*.exe') if p.with_name(p.stem + '_Data').is_dir()]
    if len(candidates) != 1:
        raise ValueError('Expected exactly one Unity runtime with a matching data directory.')
    executable = candidates[0]
    return executable, executable.with_name(executable.stem + '_Data')


def replace_serialized_string(raw, old, new, endian='<'):
    """Preserve unknown Unity fields rather than reserializing a partial schema."""
    def field(value):
        encoded = value.encode('utf-8')
        return struct.pack(endian + 'i', len(encoded)) + encoded + b'\0' * (-len(encoded) % 4)
    original = field(old)
    if not old or raw.count(original) != 1:
        raise ValueError('Missing or ambiguous Unity identity field; no file written.')
    return raw.replace(original, field(new), 1)


def brand_player_settings(environment):
    settings = next(o for o in environment.objects if o.type.name == 'PlayerSettings')
    # Unity 6000.3 has four trailing bytes not described by UnityPy's schema.
    # Read known fields, then replace only the two aligned string spans.
    tree = settings.read_typetree(check_read=False)
    raw = settings.get_raw_data()
    for key, value in [('companyName', COMPANY), ('productName', PRODUCT)]:
        raw = replace_serialized_string(raw, tree[key], value, settings.reader.endian)
    settings.set_raw_data(raw)
    return tree['companyName'], tree['productName']


def brand_menu(environment):
    # The pinned TMP component layout places its aligned text field at byte 88.
    # Rewrite only complete, validated string spans, preserving all other data.
    pattern = re.compile(r'\b(?P<word>[A-Za-z]+)!\s+(?P=word)!\s+(?P=word)!', re.I)
    count = 0
    for obj in environment.objects:
        if obj.type.name != 'MonoBehaviour':
            continue
        raw = obj.get_raw_data()
        if len(raw) < 92:
            continue
        length = struct.unpack(obj.reader.endian + 'i', raw[88:92])[0]
        if not 0 < length <= 4096 or 92 + length > len(raw):
            continue
        try:
            text = raw[92:92 + length].decode('utf-8')
        except UnicodeDecodeError:
            continue
        if text == 'FOREST RUN · Right Right Right':
            count += 1
            continue
        if not pattern.search(text):
            continue
        replacement = pattern.sub('Right! Right! RIGHT!', text)
        if not pattern.fullmatch(text.strip()):
            replacement = 'FOREST RUN · Right Right Right'
        obj.set_raw_data(replace_serialized_string(raw, text, replacement, obj.reader.endian))
        count += 1
    if count != 2:
        raise ValueError('Unsupported menu title layout; expected two branded labels.')
