"""Protect the Unity identity rewrite, including fields unknown to UnityPy."""
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from runtime_identity import find_runtime, replace_serialized_string, brand_menu


class RuntimeIdentityTests(unittest.TestCase):
    def test_menu_rewrite_preserves_component_fields(self):
        class Reader:
            endian = '<'
        class Component:
            type = type('ObjectType', (), {'name': 'MonoBehaviour'})
            reader = Reader()
            def __init__(self, text):
                data = text.encode()
                self.raw = b'\x11' * 88 + struct.pack('<i', len(data)) + data + b'\0' * (-len(data) % 4) + b'unknown-tail'
            def get_raw_data(self): return self.raw
            def set_raw_data(self, raw): self.raw = raw
        title = Component('Imported! Imported! IMPORTED!\n')
        subtitle = Component('OG MAP · first created for Imported! Imported! IMPORTED!')
        environment = type('Environment', (), {'objects': [title, subtitle]})()
        brand_menu(environment)
        for obj in environment.objects:
            self.assertTrue(obj.raw.startswith(b'\x11' * 88))
            self.assertTrue(obj.raw.endswith(b'unknown-tail'))
            self.assertNotIn(b'Imported', obj.raw)
        self.assertIn(b'Right! Right! RIGHT!', title.raw)
        self.assertIn(b'FOREST RUN', subtitle.raw)
        before = [obj.raw for obj in environment.objects]
        brand_menu(environment)
        self.assertEqual(before, [obj.raw for obj in environment.objects])

    def test_rewrite_preserves_unknown_fields_and_alignment(self):
        for endian in ['<', '>']:
            for old, new in [('Imported Game', 'RightRightRight'), ('Publisher', 'DocMorphic'), ('é', 'New')]:
                data = old.encode('utf-8')
                field = struct.pack(endian + 'i', len(data)) + data + b'\0' * (-len(data) % 4)
                prefix, suffix = b'unknown-header\x01\xff', b'unknown-tail\x11\x00\xff\xfe'
                changed = replace_serialized_string(prefix + field + suffix, old, new, endian)
                self.assertTrue(changed.startswith(prefix))
                self.assertTrue(changed.endswith(suffix))
                middle = changed[len(prefix):-len(suffix)]
                self.assertEqual(len(middle) % 4, 0)
                length = struct.unpack(endian + 'i', middle[:4])[0]
                self.assertEqual(middle[4:4 + length].decode(), new)

    def test_missing_or_ambiguous_identity_rejected(self):
        field = struct.pack('<i', 4) + b'Game'
        for raw in [b'unknown', field + field]:
            with self.assertRaisesRegex(ValueError, 'Missing or ambiguous'):
                replace_serialized_string(raw, 'Game', 'RightRightRight')

    def test_detects_runtime_without_hardcoded_imported_name(self):
        with tempfile.TemporaryDirectory(prefix='rrr-identity-test-') as temporary:
            root = Path(temporary)
            (root / 'Imported.exe').touch()
            (root / 'Imported_Data').mkdir()
            (root / 'RightRightRight.exe').touch()
            runtime, data = find_runtime(root)
            self.assertEqual(runtime.name, 'Imported.exe')
            self.assertEqual(data.name, 'Imported_Data')
            (root / 'Other.exe').touch()
            (root / 'Other_Data').mkdir()
            with self.assertRaisesRegex(ValueError, 'exactly one'):
                find_runtime(root)


if __name__ == '__main__':
    unittest.main()
