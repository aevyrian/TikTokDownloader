import asyncio
import json
import sqlite3
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from manager.app import create_app
from manager.core import MediaDownloader, Queue, Store, canonical, links, safe_name
from manager.resolver import Resolver

ID = '7123456789012345678'
URL = 'https://www.douyin.com/video/' + ID


class FixtureResolver:
    async def resolve(self, url, config):
        key = canonical(url)[1]
        if key.startswith('user:'):
            return {'children': [URL, URL]}
        return {'id': ID if key.startswith('share:') else key, 'title': '<script>alert(1)</script>',
                'author': '../CON', 'kind': 'video', 'assets': [{'url': 'https://v.douyinvod.com/test', 'ext': 'mp4'}]}


def media_transport(request):
    return httpx.Response(200, headers={'content-type': 'video/mp4', 'content-length': '1024'}, content=b'x'*1024)


def test_links_normalize_and_reject():
    assert links('分享 ' + URL + '。\nhttps://www.douyin.com/note/' + ID) == [(URL, ID)]
    assert canonical('https://www.douyin.com/?modal_id=' + ID) == (URL, ID)
    for value in ['http://www.douyin.com/video/'+ID, 'https://www.douyin.com.evil.test/video/'+ID, 'https://127.0.0.1/', 'https://evil.test/', 'https://u:p@www.douyin.com/video/'+ID]:
        with pytest.raises(ValueError):
            canonical(value)


def test_store_pagination_and_history(tmp_path):
    store = Store(tmp_path/'data')
    store.add([(URL, ID), (URL, ID)])
    assert store.page()['total'] == 1
    store.add([canonical(str(int(ID)+i)) for i in range(1, 30)])
    assert len(store.page(2, 20)['items']) == 10
    old = tmp_path/'old.db'
    with sqlite3.connect(old) as db:
        db.execute('CREATE TABLE download_data(ID TEXT PRIMARY KEY)')
        db.execute('INSERT INTO download_data VALUES (?)', ('7999999999999999999',))
    before = old.read_bytes()
    assert store.import_history(old) == 1
    assert store.import_history(old) == 0
    assert old.read_bytes() == before
    store.add([canonical('7999999999999999999')])
    assert store.page()['items'][0]['state'] == 'skipped'
    store.db.close()


def test_queue_download_alias_and_restart(tmp_path):
    async def scenario():
        store = Store(tmp_path)
        store.add([canonical('https://v.douyin.com/abc/'), canonical('https://v.douyin.com/def/')])
        downloader = MediaDownloader(tmp_path/'downloads', transport=httpx.MockTransport(media_transport))
        queue = Queue(store, FixtureResolver(), downloader)
        await asyncio.gather(queue.execute(store.claim()), queue.execute(store.claim()))
        rows = store.page()['items']
        assert {r['state'] for r in rows} == {'completed', 'skipped'}
        completed = next(r for r in rows if r['state'] == 'completed')
        assert (tmp_path/'downloads'/completed['files'][0]).read_bytes() == b'x'*1024
        assert completed['progress'] == 1024
        assert store.db.execute('SELECT COUNT(*) FROM history').fetchone()[0] == 1
        store.add([canonical('7999999999999999998')])
        interrupted = store.claim()
        assert interrupted
        await queue.start()
        await queue.close()
        assert store.db.execute('SELECT state FROM tasks WHERE id=?', (interrupted['id'],)).fetchone()[0] == 'queued'
        store.db.close()
    asyncio.run(scenario())


def test_failures_backoff_and_no_false_history(tmp_path):
    class Failed:
        async def resolve(self, *_):
            raise RuntimeError('平台未返回作品')
    async def scenario():
        store = Store(tmp_path)
        store.configure({'retries': 1})
        store.add([canonical(URL)])
        queue = Queue(store, Failed(), None)
        await queue.execute(store.claim())
        row = store.page()['items'][0]
        assert row['state'] == 'retry_wait'
        assert not store.claim()
        store.update(row['id'], next_run=0)
        await queue.execute(store.claim())
        assert store.page()['items'][0]['state'] == 'failed'
        assert store.db.execute('SELECT COUNT(*) FROM history').fetchone()[0] == 0
        store.db.close()
    asyncio.run(scenario())


def test_profile_fanout_deduplicates(tmp_path):
    async def scenario():
        store = Store(tmp_path)
        store.add([canonical('https://www.douyin.com/user/test')])
        await Queue(store, FixtureResolver(), None).execute(store.claim())
        assert store.page()['total'] == 2
        assert store.page()['items'][0]['media_key'] == ID
        store.db.close()
    asyncio.run(scenario())


def test_media_rejects_redirect_and_removes_partial(tmp_path):
    async def scenario():
        media = await FixtureResolver().resolve(URL, {})
        downloader = MediaDownloader(tmp_path, transport=httpx.MockTransport(lambda r: httpx.Response(302, headers={'location': 'http://127.0.0.1/private'})))
        with pytest.raises(ValueError):
            await downloader.download(media, {'category':'type'}, lambda *_: None)
        downloader.transport = httpx.MockTransport(lambda r: httpx.Response(200, headers={'content-type': 'text/html'}, content=b'error'))
        with pytest.raises(RuntimeError):
            await downloader.download(media, {'category':'type'}, lambda *_: None)
        assert not list(tmp_path.rglob('*.part'))
    asyncio.run(scenario())


def test_api_auth_submit_files_settings_and_reopen(tmp_path):
    app = create_app(tmp_path, FixtureResolver(), MediaDownloader(tmp_path/'downloads', httpx.MockTransport(media_transport)))
    token = (tmp_path/'access-token').read_text()
    headers = {'Authorization': 'Bearer '+token}
    with TestClient(app) as client:
        assert client.get('/').status_code == 200
        assert client.get('/health').json()['status'] == 'ok'
        assert client.get('/api/tasks').status_code == 401
        assert client.post('/api/tasks', headers=headers, json={'text': 'https://evil.test/a'}).status_code == 400
        submitted = client.post('/api/tasks', headers=headers, json={'text': URL}).json()
        ident = submitted['items'][0]['id']
        end = time.monotonic()+5
        while time.monotonic()<end:
            row = client.get('/api/tasks', headers=headers).json()['items'][0]
            if row['state']=='completed':
                break
            time.sleep(.05)
        assert row['state']=='completed'
        assert client.get(f'/api/files/{ident}/0', headers=headers).content == b'x'*1024
        assert client.post(f'/api/tasks/{ident}/retry', headers=headers).status_code == 409
        assert client.post('/api/tasks', headers=headers, json={'text':URL}).json()['items'][0]['duplicate']
        assert client.post('/api/history/check', headers=headers, json={'ids':[ID,'7999999999999999999']}).json()['items'] == {ID:'completed','7999999999999999999':'new'}
        assert client.post('/api/history/check', headers=headers, json={'ids':['bad']}).status_code == 400
        assert client.put('/api/settings', headers=headers, json={'cookie':'secret-value'}).status_code == 200
        assert 'secret-value' not in client.get('/api/settings', headers=headers).text
        assert client.get('/api/settings', headers=headers).json()['has_cookie']
        assert client.put('/api/settings', headers=headers, json={'workers':99}).status_code == 422
        assert client.get('/api/tasks?page=0', headers=headers).status_code == 422
    with TestClient(create_app(tmp_path, FixtureResolver(), None)) as client:
        assert client.get('/api/tasks', headers=headers).json()['items'][0]['state']=='completed'


def test_normalize_highest_quality_images_and_names():
    media = Resolver.normalize({'aweme_id':ID, 'video':{'bit_rate':[{'bit_rate':1,'play_addr':{'url_list':['low']}},{'bit_rate':9,'play_addr':{'url_list':['high']}}]}})
    assert media['assets'][0]['url'] == 'high'
    assert Resolver.normalize({'aweme_id':ID,'images':[{'url_list':['image']} ]})['kind'] == 'images'
    assert '/' not in safe_name('../author')
    assert safe_name('CON') != 'CON'


def test_upstream_adapter_imports():
    # Catch missing native/runtime dependencies even when fixture tests pass.
    from src.interface.detail import Detail
    from src.encrypt import DouYinParams
    assert callable(Detail)
    assert callable(DouYinParams().sign_url)


def test_cookie_params_are_per_request():
    from types import SimpleNamespace
    original = {'uifid':'', 'msToken':''}
    first = SimpleNamespace(params=original)
    second = SimpleNamespace(params=original)
    Resolver.configure_interface(first, 'UIFID=visitor; msToken=token')
    Resolver.configure_interface(second, '')
    assert first.params == {'uifid':'visitor','msToken':'token'}
    assert second.params == original == {'uifid':'','msToken':''}


def test_partial_profile_keeps_children(tmp_path):
    class Partial:
        async def resolve(self, *_):
            return {'children':[URL], 'warning':'后续分页失败'}
    async def scenario():
        store=Store(tmp_path)
        store.add([canonical('https://www.douyin.com/user/test')])
        await Queue(store,Partial(),None).execute(store.claim())
        assert store.page()['total']==2
        assert store.page()['items'][1]['state']=='partial'
        assert store.page()['items'][0]['media_key']==ID
        store.db.close()
    asyncio.run(scenario())
