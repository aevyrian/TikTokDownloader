import asyncio
import json
import re
import sqlite3
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import httpx


def canonical(value):
    value = value.strip().rstrip('.,，。；;!！)）')
    if re.fullmatch(r'\d{15,24}', value):
        return f'https://www.douyin.com/video/{value}', value
    p = urlsplit(value)
    if p.scheme != 'https' or p.hostname not in {'www.douyin.com', 'douyin.com', 'v.douyin.com', 'www.iesdouyin.com'} or p.username or p.password or p.port:
        raise ValueError('仅支持抖音 HTTPS 作品、分享和用户主页链接')
    match = re.search(r'/(?:video|note)/(\d{15,24})(?:/|$)', p.path)
    ids = parse_qs(p.query).get('modal_id', [])
    ident = match[1] if match else (ids[0] if ids and re.fullmatch(r'\d{15,24}', ids[0]) else '')
    if ident:
        return f'https://www.douyin.com/video/{ident}', ident
    if p.hostname == 'v.douyin.com' and re.fullmatch(r'/[\w-]+/?', p.path):
        return f'https://v.douyin.com/{p.path.strip("/")}/', 'share:' + p.path.strip('/')
    if p.hostname in {'www.douyin.com', 'douyin.com'} and re.fullmatch(r'/user/[\w-]+/?', p.path):
        return 'https://www.douyin.com' + p.path.rstrip('/'), 'user:' + p.path.rstrip('/').split('/')[-1]
    raise ValueError('未识别到作品或用户主页链接')


def links(text):
    candidates = re.findall(r'https?://[^\s<>"\u200b]+|(?<!\d)\d{15,24}(?!\d)', text)
    if not candidates:
        raise ValueError('请输入抖音链接或作品 ID')
    return list(dict.fromkeys(canonical(v) for v in candidates))


def safe_name(value):
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', str(value)).strip(' .')[:64]
    if not value or value.upper().split('.')[0] in {'CON', 'PRN', 'AUX', 'NUL', *[f'COM{i}' for i in range(1, 10)], *[f'LPT{i}' for i in range(1, 10)]}:
        return '_' + value
    return value


class Store:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.root / 'manager.db', check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY, url TEXT NOT NULL, media_key TEXT NOT NULL UNIQUE,
          state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
          next_run REAL NOT NULL DEFAULT 0, progress INTEGER NOT NULL DEFAULT 0,
          total INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL DEFAULT '',
          error TEXT NOT NULL DEFAULT '', files TEXT NOT NULL DEFAULT '[]',
          created REAL NOT NULL, updated REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS history (media_key TEXT PRIMARY KEY, files TEXT NOT NULL, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        ''')
        self.db.commit()

    def config(self):
        result = dict(workers=2, retries=2, max_pages=5, category='author')
        result.update({r['key']: json.loads(r['value']) for r in self.db.execute('SELECT * FROM settings')})
        return result

    def configure(self, data):
        with self.db:
            for k, v in data.items():
                self.db.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', (k, json.dumps(v)))

    def add(self, items):
        result = []
        now = time.time()
        with self.db:
            for url, key in items:
                exists = self.db.execute('SELECT * FROM tasks WHERE media_key=?', (key,)).fetchone()
                old = self.db.execute('SELECT * FROM history WHERE media_key=?', (key,)).fetchone()
                if exists:
                    result.append(dict(id=exists['id'], duplicate=True))
                    continue
                cursor = self.db.execute('INSERT INTO tasks(url,media_key,state,files,created,updated) VALUES (?,?,?,?,?,?)',
                                         (url, key, 'skipped' if old else 'queued', old['files'] if old else '[]', now, now))
                result.append(dict(id=cursor.lastrowid, duplicate=bool(old)))
        return result

    def update(self, ident, **values):
        allowed = {'state', 'media_key', 'attempts', 'next_run', 'progress', 'total', 'title', 'error', 'files'}
        if not values.keys() <= allowed:
            raise ValueError('invalid update')
        values['updated'] = time.time()
        with self.db:
            self.db.execute('UPDATE tasks SET ' + ','.join(k + '=?' for k in values) + ' WHERE id=?', (*values.values(), ident))

    def claim(self):
        with self.db:
            row = self.db.execute("SELECT * FROM tasks WHERE state IN ('queued','retry_wait') AND next_run<=? ORDER BY id LIMIT 1", (time.time(),)).fetchone()
            if row:
                self.db.execute("UPDATE tasks SET state='running', attempts=attempts+1, updated=? WHERE id=?", (time.time(), row['id']))
                return dict(row) | {'attempts': row['attempts'] + 1}

    def page(self, page=1, size=20, state=''):
        where = ' WHERE state=?' if state else ''
        args = (state,) if state else ()
        total = self.db.execute('SELECT COUNT(*) FROM tasks' + where, args).fetchone()[0]
        rows = self.db.execute('SELECT * FROM tasks' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?', (*args, size, (page-1)*size)).fetchall()
        return dict(items=[dict(r) | {'files': json.loads(r['files'])} for r in rows], total=total, page=page, size=size)

    def import_history(self, path):
        path = Path(path).resolve()
        if not path.is_file():
            raise ValueError('历史数据库不存在')
        source = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
        try:
            ids = [str(r[0]) for r in source.execute('SELECT ID FROM download_data')]
        finally:
            source.close()
        with self.db:
            before = self.db.total_changes
            self.db.executemany('INSERT OR IGNORE INTO history VALUES (?, ?, ?)', [(i, '[]', time.time()) for i in ids if re.fullmatch(r'\d{15,24}', i)])
            return self.db.total_changes - before


class Queue:
    def __init__(self, store, resolver, downloader):
        self.store, self.resolver, self.downloader = store, resolver, downloader
        self.workers = []

    async def start(self):
        with self.store.db:
            self.store.db.execute("UPDATE tasks SET state='queued',next_run=0 WHERE state='running'")
        self.workers = [asyncio.create_task(self.loop()) for _ in range(self.store.config()['workers'])]

    async def close(self):
        for worker in self.workers:
            worker.cancel()
        await asyncio.gather(*self.workers, return_exceptions=True)
        with self.store.db:
            self.store.db.execute("UPDATE tasks SET state='queued',next_run=0 WHERE state='running'")

    async def loop(self):
        while True:
            task = self.store.claim()
            if task:
                await self.execute(task)
            else:
                await asyncio.sleep(.3)

    async def execute(self, task):
        ident = task['id']
        try:
            config = self.store.config()
            result = await asyncio.wait_for(self.resolver.resolve(task['url'], config), timeout=180)
            if 'children' in result:
                added = self.store.add([canonical(u) for u in result['children']])
                warning = result.get('warning', '')
                self.store.update(ident, state='partial' if warning else 'completed', title=f'分页采集：{len(added)} 条作品', error=warning)
                return
            key = str(result['id'])
            # Canonical aliases and share URLs converge before downloading; no await until ownership is established.
            other = self.store.db.execute('SELECT id FROM tasks WHERE media_key=? AND id<>?', (key, ident)).fetchone()
            old = self.store.db.execute('SELECT * FROM history WHERE media_key=?', (key,)).fetchone()
            if other or old:
                self.store.update(ident, state='skipped', title=result.get('title', ''), error='已在队列或历史中', files=old['files'] if old else '[]')
                return
            self.store.update(ident, media_key=key, title=result.get('title', ''), progress=0, total=0, error='')
            files = await self.downloader.download(result, config, lambda n, total: self.store.update(ident, progress=n, total=total))
            if not files:
                raise RuntimeError('解析没有产生可下载媒体')
            encoded = json.dumps(files, ensure_ascii=False)
            with self.store.db:
                self.store.db.execute('INSERT OR REPLACE INTO history VALUES (?,?,?)', (key, encoded, time.time()))
                self.store.db.execute("UPDATE tasks SET state='completed',files=?,error='',updated=? WHERE id=?", (encoded, time.time(), ident))
        except asyncio.CancelledError:
            self.store.update(ident, state='queued', next_run=0)
            raise
        except Exception as exc:
            # Never expose upstream response bodies, headers, signed URLs or cookies.
            message = str(exc) if isinstance(exc, (ValueError, RuntimeError)) else type(exc).__name__ + '：请求失败或超时，请检查连接及平台配置'
            retry = task['attempts'] <= self.store.config()['retries']
            self.store.update(ident, state='retry_wait' if retry else 'failed', next_run=time.time() + min(60, 2 ** task['attempts']), error=message[:300])


class MediaDownloader:
    def __init__(self, root, transport=None):
        self.root = Path(root).resolve()
        self.transport = transport

    @staticmethod
    def validate(url):
        p = urlsplit(url)
        suffixes = ('douyinvod.com', 'douyinpic.com', 'byteimg.com', 'ibytedtos.com', 'snssdk.com', 'amemv.com', 'douyin.com', 'pstatp.com')
        if p.scheme != 'https' or p.username or p.password or p.port or not any(p.hostname == s or (p.hostname or '').endswith('.' + s) for s in suffixes):
            raise ValueError('媒体地址不是受支持的抖音 CDN')

    async def download(self, media, config, progress):
        category = media.get('author', '未知作者') if config['category'] == 'author' else media.get('kind', 'video')
        folder = self.root / safe_name(category) / safe_name(media['id'])
        folder.mkdir(parents=True, exist_ok=True)
        files, done = [], 0
        async with httpx.AsyncClient(timeout=httpx.Timeout(45, connect=15), transport=self.transport, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.douyin.com/'}) as client:
            for index, asset in enumerate(media['assets']):
                url = asset['url']
                ext = asset.get('ext', 'mp4')
                if ext not in {'mp4', 'jpg', 'png', 'webp', 'avif', 'heic'}:
                    raise ValueError('不支持的媒体类型')
                target = folder / f'{index+1:03d}.{ext}'
                temporary = target.with_suffix(target.suffix + '.part')
                try:
                    # Validate each redirect; never forward cookies to a media CDN.
                    for _ in range(6):
                        self.validate(url)
                        async with client.stream('GET', url) as response:
                            if response.is_redirect:
                                url = str(response.url.join(response.headers['location']))
                                continue
                            response.raise_for_status()
                            if not response.headers.get('content-type', '').split(';')[0].startswith(('video/', 'image/', 'application/octet-stream')):
                                raise RuntimeError('媒体响应不是视频或图片')
                            length = int(response.headers.get('content-length', 0))
                            received = 0
                            last = 0
                            with temporary.open('wb') as output:
                                async for chunk in response.aiter_bytes(256*1024):
                                    output.write(chunk)
                                    received += len(chunk)
                                    if time.monotonic()-last > .25:
                                        progress(done+received, done+length if length else 0)
                                        last = time.monotonic()
                            if not received or (length and received != length):
                                raise RuntimeError('媒体为空或文件不完整')
                            temporary.replace(target)
                            done += received
                            progress(done, done if index == len(media['assets'])-1 else 0)
                            files.append(str(target.relative_to(self.root)))
                            break
                    else:
                        raise RuntimeError('媒体重定向次数过多')
                finally:
                    temporary.unlink(missing_ok=True)
        return files
