/* Shared by the installed popup and the integration test. */
globalThis.DouyinClient = {
  server(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('后台地址格式无效，只填写主机和端口');
    return url.origin;
  },
  async request(server, token, path, body) {
    const response = await fetch(this.server(server) + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '提交失败');
    return data;
  },
  supported(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && ['www.douyin.com','douyin.com','v.douyin.com','www.iesdouyin.com'].includes(url.hostname); } catch { return false; }
  }
};
