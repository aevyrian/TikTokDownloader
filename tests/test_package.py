import hashlib
import io
import json
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from tools.package_image import add_healthcheck, project_files, source_zip, verify_linux_dependencies, write_layer, verify_vaapi
from tools.prepare_ffmpeg import prepare as prepare_ffmpeg


class PackageTests(unittest.TestCase):
    def test_source_zip_uses_public_manifest_without_local_data_or_caches(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            included = {"app/main.py", "app/static/task-view.js", "userscripts/send.user.js", "tests/test_example.py",
                        "vendor/TikTokDownloader/src/core.py", "vendor/TikTokDownloader/license",
                        "tools/package_image.py", "tools/ffmpeg/.gitkeep", "tools/vaapi/.gitkeep",
                        "tools/wheels/.gitkeep", ".env.example", "Dockerfile", "LICENSE", "THIRD_PARTY_NOTICES.md"}
            excluded = {"app/.env", "app/credentials.json", "app/main.py.bak", "app/main.before.py",
                        "app/__pycache__/main.py", "tests/.private/test_example.py", "tools/wheels/cache.whl",
                        "tools/ffmpeg/ffmpeg.tar.xz", "tools/vaapi/runtime.tar", "tools/private.py",
                        "vendor/TikTokDownloader/Volume/settings.json", "vendor/TikTokDownloader/docs/private.md",
                        ".comet/config.yaml", ".env", ".env.production", "data/library.sqlite3", "docs/进度.md"}
            for name in included | excluded:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("synthetic", encoding="utf-8")
            with patch("tools.package_image.ROOT", root):
                source_zip(root / "source.zip")
            with zipfile.ZipFile(root / "source.zip") as archive:
                self.assertEqual(set(archive.namelist()), included)
                self.assertIsNone(archive.testzip())

    def test_hardware_runtime_checksum_rejects_corrupt_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);archive=root/'runtime.tar';archive.write_bytes(b'linux-vaapi-runtime')
            (root/'SHA256SUMS').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  runtime.tar\n')
            verify_vaapi(archive)
            archive.write_bytes(b'truncated-download')
            with self.assertRaisesRegex(ValueError,'checksum'):verify_vaapi(archive)
    def test_playback_binaries_keep_execute_mode_and_bad_archive_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);binary=root/'ffmpeg';binary.write_bytes(b'linux-binary')
            layer=root/'runtime.tar';write_layer(layer,[(binary,'usr/local/bin/ffmpeg')])
            with tarfile.open(layer) as archive:self.assertEqual(archive.getmember('usr/local/bin/ffmpeg').mode,0o755)
            bad=root/'bad.tar.xz';bad.write_bytes(b'wrong-download')
            with self.assertRaisesRegex(ValueError,'checksum'):prepare_ffmpeg(root/'bin',bad)
    def test_dependency_check_rejects_foreign_native_code(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            binary = root / "foreign.so"
            header = bytearray(64)
            header[:6] = b"\x7fELF\x02\x01"
            header[18:20] = (183).to_bytes(2, "little")
            binary.write_bytes(header)
            with self.assertRaisesRegex(ValueError, "amd64"):
                verify_linux_dependencies(root)
            header[18:20] = (62).to_bytes(2, "little")
            binary.write_bytes(header)
            verify_linux_dependencies(root)

    def test_project_layer_excludes_credentials_and_machine_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            files = ["app/main.py", "app/.env", "app/__pycache__/main.pyc",
                     "vendor/TikTokDownloader/license", "vendor/TikTokDownloader/Volume/settings.json",
                     "vendor/TikTokDownloader/src/core.py", "userscripts/send.user.js",
                     ".venv/secret", "app/native.pyd"]
            for name in files:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("content", encoding="utf-8")
            layer = root / "layer.tar"
            write_layer(layer, [(p, "app/" + p.relative_to(root).as_posix()) for p in project_files(root)])
            with tarfile.open(layer) as archive:
                self.assertEqual(set(archive.getnames()), {
                    "app/app/main.py", "app/vendor/TikTokDownloader/license",
                    "app/vendor/TikTokDownloader/src/core.py", "app/userscripts/send.user.js"})
                self.assertTrue(all(item.mode == 0o644 for item in archive.getmembers()))

    def test_healthcheck_rewrites_config_id_and_keeps_layers(self):
        with tempfile.TemporaryDirectory() as folder:
            source, target = Path(folder) / "source.tar", Path(folder) / "target.tar"
            config = json.dumps({"architecture": "amd64", "os": "linux", "config": {}}).encode()
            manifest = [{"Config": "old.json", "RepoTags": ["douyin-library:local"], "Layers": ["layer.tar"]}]
            with tarfile.open(source, "w") as archive:
                for name, data in [("old.json", config), ("manifest.json", json.dumps(manifest).encode()), ("layer.tar", b"layer")]:
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    archive.addfile(info, io.BytesIO(data))
            add_healthcheck(source, target)
            with tarfile.open(target) as archive:
                result = json.load(archive.extractfile("manifest.json"))[0]
                payload = archive.extractfile(result["Config"]).read()
                self.assertEqual(result["Config"], hashlib.sha256(payload).hexdigest() + ".json")
                self.assertEqual(archive.extractfile("layer.tar").read(), b"layer")
                self.assertEqual(json.loads(payload)["config"]["Healthcheck"]["Test"][0], "CMD")
                self.assertNotIn("old.json", archive.getnames())


if __name__ == "__main__":
    unittest.main()
