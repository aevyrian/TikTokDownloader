import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.core import Core, verified_files

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'vendor' / 'TikTokDownloader'))
WORK_ID = '7682813070766825882'


class LivePhotoTests(unittest.IsolatedAsyncioTestCase):
    async def test_live_photo_parses_and_requires_every_mixed_media_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            item = {'id': WORK_ID, 'type': '实况', 'downloads': ['https://example.com/motion', 'https://example.com/still']}
            core = Core(root, root / 'data', root / 'media')
            core.ready = True
            core.parser = SimpleNamespace(handle_detail=AsyncMock(return_value=SimpleNamespace(data=item)))
            self.assertEqual(await core.parse(WORK_ID, 'detail'), [item])
            folder = root / '作品' / WORK_ID
            folder.mkdir(parents=True)
            (folder / f'{WORK_ID}_1.mp4').write_bytes(b'motion')
            with self.assertRaises(RuntimeError):
                verified_files(root, item)
            (folder / f'{WORK_ID}_2.jpeg').write_bytes(b'still')
            self.assertEqual(verified_files(root, item), [f'作品/{WORK_ID}/{WORK_ID}_1.mp4', f'作品/{WORK_ID}/{WORK_ID}_2.jpeg'])
