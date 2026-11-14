"""Integrity/caching tests for the developer bootstrap; no game or cloud service."""
import hashlib
import io
import json
import sys
import tempfile
import unittest
import subprocess
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import build_from_release as builder
from verify_portable import verify


class PortableBuilderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='rrr-build-test-')
        self.root = Path(self.temp.name).resolve()

    def tearDown(self):
        # Cleanup is restricted to the exact temporary test directory we created.
        assert self.root.parent == Path(tempfile.gettempdir()).resolve()
        assert self.root.name.startswith('rrr-build-test-')
        self.temp.cleanup()

    def archive(self):
        content = b'compile reference fixture'
        manifest = json.dumps({'Format': 1, 'Files': {'reference.dll': hashlib.sha256(content).hexdigest()}})
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as bundle:
            bundle.writestr('RightRightRight/player/reference.dll', content)
            bundle.writestr('RightRightRight/player/package-manifest.json', manifest)
        return stream.getvalue()

    def test_download_cache_and_modified_base(self):
        content = self.archive()
        tools = self.root / 'tools'
        tools.mkdir()
        (tools / 'portable-base.json').write_text(json.dumps({
            'Tag': 'test-base', 'Url': 'https://github.com/DocMorphic/right-right-right/releases/download/test/base.zip',
            'Sha256': hashlib.sha256(content).hexdigest(), 'PlayerPath': 'RightRightRight/player'}))
        with patch.object(builder, 'ROOT', self.root), patch.object(builder.urllib.request, 'urlopen', return_value=io.BytesIO(content)) as download:
            player = builder.prepare_base(self.root / 'cache')
            self.assertEqual(verify(player), 1)
            self.assertEqual(builder.prepare_base(self.root / 'cache'), player)
            download.assert_called_once()
            (player / 'reference.dll').write_bytes(b'modified reference')
            with self.assertRaisesRegex(ValueError, 'damaged'):
                builder.prepare_base(self.root / 'cache')

    def test_wrong_download_is_not_extracted(self):
        tools = self.root / 'tools'
        tools.mkdir()
        (tools / 'portable-base.json').write_text(json.dumps({
            'Tag': 'bad-base', 'Url': 'https://github.com/DocMorphic/right-right-right/releases/download/test/base.zip',
            'Sha256': '0' * 64, 'PlayerPath': 'RightRightRight/player'}))
        with patch.object(builder, 'ROOT', self.root), patch.object(builder.urllib.request, 'urlopen', return_value=io.BytesIO(self.archive())):
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                builder.prepare_base(self.root / 'cache')
        self.assertFalse((self.root / 'cache/bad-base/extracted').exists())

    def test_archive_traversal_is_rejected(self):
        for index, name in enumerate(['../escape.txt', '/absolute.txt', 'RightRightRight/../../escape.txt', 'RightRightRight\\..\\..\\escape.txt']):
            archive = self.root / f'bad-{index}.zip'
            with zipfile.ZipFile(archive, 'w') as bundle:
                bundle.writestr(name, 'bad')
            with self.assertRaises(ValueError):
                builder.extract(archive, self.root / f'unpacked-{index}')
        self.assertFalse((self.root / 'escape.txt').exists())

    def test_manifest_traversal_is_rejected(self):
        player = self.root / 'player'
        player.mkdir()
        (player / 'package-manifest.json').write_text(json.dumps({'Format': 1, 'Files': {'../outside.dll': '0' * 64}}))
        with self.assertRaisesRegex(ValueError, 'escapes'):
            verify(player)

    def test_runtime_on_path_does_not_hide_local_sdk(self):
        name = 'dotnet.exe' if sys.platform == 'win32' else 'dotnet'
        sdk = self.root / 'local/tools/dotnet' / name
        sdk.parent.mkdir(parents=True)
        sdk.write_text('SDK fixture')
        def probe(command, **_):
            return subprocess.CompletedProcess(command, 0, '8.0.411 [test/sdk]\n' if command[0] == str(sdk) else '', '')
        with patch.object(builder, 'ROOT', self.root), patch.object(builder.shutil, 'which', return_value='/runtime/dotnet'), patch.object(builder.subprocess, 'run', side_effect=probe):
            self.assertEqual(builder.find_dotnet(None), str(sdk))

    def test_runtime_only_sdk_override_fails_clearly(self):
        with patch.object(builder.shutil, 'which', return_value='/runtime/dotnet'), patch.object(builder.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '', '')):
            with self.assertRaisesRegex(ValueError, 'runtime alone'):
                builder.find_dotnet('/runtime/dotnet')


if __name__ == '__main__':
    unittest.main()
