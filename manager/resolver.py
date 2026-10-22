"""Reuse the repository's existing Detail/Account interfaces and signing code."""
import logging
from http.cookies import SimpleCookie
from types import SimpleNamespace

import httpx

from .core import canonical


class Resolver:
    @staticmethod
    def configure_interface(interface, cookie):
        parsed = SimpleCookie()
        try:
            parsed.load(cookie)
        except Exception:
            raise ValueError('Cookie 格式无效') from None
        values = {key.lower(): item.value for key, item in parsed.items()}
        # Upstream Parameter normally sets these globals; copy per request to avoid cross-task leakage.
        interface.params = dict(interface.params)
        interface.params['uifid'] = values.get('uifid', '')
        interface.params['msToken'] = values.get('mstoken', '')
        return interface

    async def resolve(self, url, config):
        url, key = canonical(url)
        if key.startswith('share:'):
            async with httpx.AsyncClient(timeout=20) as client:
                for _ in range(6):
                    canonical(url)
                    response = await client.get(url)
                    if not response.is_redirect:
                        break
                    url = str(response.url.join(response.headers['location']))
                else:
                    raise RuntimeError('分享链接重定向次数过多')
            url, key = canonical(url)
            if key.startswith('share:'):
                raise RuntimeError('分享链接未能解析成作品，请使用完整链接')

        from curl_cffi.requests import AsyncSession
        from src.custom import DATA_HEADERS, IMPERSONATE, USERAGENT
        from src.encrypt import DouYinParams
        from src.interface.account import Account
        from src.interface.detail import Detail
        from src.interface.template import API
        from src.tools import ColorfulConsole

        # Upstream logs may include response bodies. Keep them out of manager logs/API.
        logger = logging.getLogger('manager.upstream.silent')
        logger.handlers = [logging.NullHandler()]
        logger.propagate = False
        async with AsyncSession(timeout=20, impersonate=IMPERSONATE) as client:
            params = SimpleNamespace(headers=DATA_HEADERS.copy(), logger=logger,
                                     douyin_params=DouYinParams(), console=ColorfulConsole(),
                                     max_retry=0, timeout=20, client=client,
                                     impersonate=IMPERSONATE, user_agent=USERAGENT,
                                     max_pages=config['max_pages'])
            API.init_progress_object(True)
            cookie = config.get('cookie', '')
            if key.startswith('user:'):
                account = self.configure_interface(Account(params, cookie=cookie, sec_user_id=key[5:], pages=config['max_pages']), cookie)
                children, cursor = [], 0
                for _ in range(config['max_pages']):
                    account.response = []
                    items = await account.run(single_page=True)
                    if not items:
                        raise RuntimeError('账号分页返回空数据，请检查 Cookie、权限和平台兼容性')
                    children.extend(f'https://www.douyin.com/video/{i["aweme_id"]}' for i in items)
                    if account.finished:
                        break
                    if account.cursor == cursor:
                        raise RuntimeError('账号分页游标未前进，已停止以避免重复请求')
                    cursor = account.cursor
                return {'children': list(dict.fromkeys(children))}
            detail = self.configure_interface(Detail(params, cookie=cookie, detail_id=key), cookie)
            data = await detail.run()
            if not data:
                raise RuntimeError('平台未返回作品：可能需要有效 Cookie，或当前解析与平台不兼容')
            return self.normalize(data)

    @staticmethod
    def normalize(data):
        assets = []
        for image in data.get('images') or []:
            urls = image.get('url_list') or []
            if urls:
                assets.append({'url': urls[0], 'ext': 'jpg'})
        if not assets:
            video = data.get('video') or {}
            rates = sorted(video.get('bit_rate') or [], key=lambda i: i.get('bit_rate', 0), reverse=True)
            choices = [r.get('play_addr') or {} for r in rates] + [video.get('play_addr') or {}]
            for choice in choices:
                if choice.get('url_list'):
                    assets.append({'url': choice['url_list'][0], 'ext': 'mp4'})
                    break
        if not assets:
            raise RuntimeError('作品数据中没有可下载媒体')
        return {'id': str(data['aweme_id']), 'title': data.get('desc', ''),
                'author': (data.get('author') or {}).get('nickname', '未知作者'),
                'kind': 'images' if data.get('images') else 'video', 'assets': assets}
