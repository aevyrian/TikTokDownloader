import os
import secrets
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .core import MediaDownloader, Queue, Store, links
from .resolver import Resolver


class Submission(BaseModel):
    text: str = Field(min_length=1, max_length=100000)


class Configuration(BaseModel):
    workers: int = Field(default=2, ge=1, le=4)
    retries: int = Field(default=2, ge=0, le=5)
    max_pages: int = Field(default=5, ge=1, le=100)
    category: str = Field(default='author', pattern='^(author|type)$')
    cookie: str | None = Field(default=None, max_length=20000)


def create_app(data_dir=None, resolver=None, downloader=None):
    root = Path(data_dir or os.environ.get('DOUYIN_DATA', 'manager-data')).resolve()
    root.mkdir(parents=True, exist_ok=True)
    token_file = root / 'access-token'
    if os.environ.get('DOUYIN_TOKEN'):
        token = os.environ['DOUYIN_TOKEN']
    else:
        if not token_file.exists():
            token_file.write_text(secrets.token_urlsafe(32), encoding='utf-8')
            token_file.chmod(0o600)
        token = token_file.read_text(encoding='utf-8').strip()
    if len(token) < 16:
        raise RuntimeError('访问令牌至少需要 16 个字符')
    state = {}

    @asynccontextmanager
    async def lifespan(app):
        store = Store(root)
        queue = Queue(store, resolver or Resolver(), downloader or MediaDownloader(root / 'downloads'))
        state.update(store=store, queue=queue)
        app.state.store, app.state.queue = store, queue
        await queue.start()
        try:
            yield
        finally:
            await queue.close()
            store.db.close()

    app = FastAPI(title='抖音下载管理器', lifespan=lifespan)

    def auth(request: Request, authorization: str = Header(default='')):
        if not secrets.compare_digest(authorization, 'Bearer ' + token):
            raise HTTPException(401, '请填写正确的访问令牌')

    @app.get('/health')
    async def health():
        return {'status': 'ok', 'service': 'douyin-manager'}

    @app.get('/api/status', dependencies=[Depends(auth)])
    async def status():
        store = state['store']
        counts = dict(store.db.execute('SELECT state, COUNT(*) FROM tasks GROUP BY state').fetchall())
        return {'counts': counts, 'workers': len(state['queue'].workers), 'parser': 'repository Detail/Account', 'data_dir': str(root)}

    @app.post('/api/tasks', dependencies=[Depends(auth)])
    async def submit(body: Submission):
        try:
            items = links(body.text)
            if len(items) > 500:
                raise ValueError('一次最多提交 500 条链接')
            return {'items': state['store'].add(items)}
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from None

    @app.get('/api/tasks', dependencies=[Depends(auth)])
    async def tasks(page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100), state_filter: str = Query('', alias='state')):
        return state['store'].page(page, size, state_filter)

    @app.post('/api/tasks/{ident}/retry', dependencies=[Depends(auth)])
    async def retry(ident: int):
        store = state['store']
        row = store.db.execute('SELECT state FROM tasks WHERE id=?', (ident,)).fetchone()
        if not row:
            raise HTTPException(404, '任务不存在')
        if row['state'] not in {'failed', 'retry_wait'}:
            raise HTTPException(409, '只能重试失败或等待重试的任务')
        store.update(ident, state='queued', attempts=0, next_run=0, error='', progress=0, total=0)
        return {'ok': True}

    @app.get('/api/settings', dependencies=[Depends(auth)])
    async def settings():
        config = state['store'].config()
        return {k: v for k, v in config.items() if k != 'cookie'} | {'has_cookie': bool(config.get('cookie')), 'active_workers': len(state['queue'].workers)}

    @app.put('/api/settings', dependencies=[Depends(auth)])
    async def configure(body: Configuration):
        data = body.model_dump(exclude_none=True)
        state['store'].configure(data)
        return {'ok': True, 'message': '已保存；并发数在重启服务后生效'}

    @app.post('/api/history/import', dependencies=[Depends(auth)])
    async def import_history():
        # Fixed path only: no arbitrary server-side file reads via HTTP.
        try:
            return {'imported': state['store'].import_history(root / 'legacy' / 'DouK-Downloader.db')}
        except (ValueError, sqlite3.Error):
            raise HTTPException(400, '请将旧数据库副本放入数据目录 legacy/DouK-Downloader.db；需要 download_data 表') from None

    @app.get('/api/files/{ident}/{index}', dependencies=[Depends(auth)])
    async def file(ident: int, index: int):
        import json
        row = state['store'].db.execute('SELECT files FROM tasks WHERE id=?', (ident,)).fetchone()
        if not row:
            raise HTTPException(404)
        files = json.loads(row['files'])
        if not 0 <= index < len(files):
            raise HTTPException(404)
        base = (root / 'downloads').resolve()
        target = (base / files[index]).resolve()
        if not target.is_relative_to(base) or not target.is_file():
            raise HTTPException(404, '文件不存在')
        return FileResponse(target, filename=target.name)

    app.mount('/', StaticFiles(directory=Path(__file__).parent / 'web', html=True), name='web')
    return app
