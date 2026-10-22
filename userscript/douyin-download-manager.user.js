// ==UserScript==
// @name         抖音下载管理助手
// @namespace    https://github.com/aevyrian/TikTokDownloader
// @version      0.2.0
// @description  提交当前作品、批量收集链接、识别下载历史，连接自己的下载后台
// @author       aevyrian
// @license      GPL-3.0
// @match        https://www.douyin.com/*
// @match        https://douyin.com/*
// @match        https://v.douyin.com/*
// @match        https://www.iesdouyin.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      127.0.0.1
// @connect      localhost
// @connect      *
// @run-at       document-idle
// ==/UserScript==

/* GPLv3. Uses the existing userscript manager; no new browser extension. */
(() => {
  'use strict';
  const STATES = {completed:'已下载',skipped:'已识别历史',queued:'排队中',running:'下载中',retry_wait:'等待重试',failed:'失败',partial:'部分完成',new:'未下载'};
  function serverURL(value) {
    const url = new URL(value);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('后台地址只填写主机和端口，例如 http://127.0.0.1:8787');
    return url.origin;
  }
  function mediaID(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || !['www.douyin.com','douyin.com','www.iesdouyin.com'].includes(u.hostname)) return '';
      const match = u.pathname.match(/\/(?:video|note)\/(\d{15,24})(?:\/|$)/);
      if (match) return match[1];
      for (const key of ['modal_id','aweme_id']) {
        const id = u.searchParams.get(key) || '';
        if (/^\d{15,24}$/.test(id)) return id;
      }
    } catch { /* not a media link */ }
    return '';
  }
  function collectLinks(doc) {
    const result = new Map();
    for (const anchor of doc.querySelectorAll('a[href]')) {
      const id = mediaID(anchor.href);
      if (id && !result.has(id)) result.set(id, 'https://www.douyin.com/video/' + id);
      if (result.size >= 500) break;
    }
    return [...result.values()];
  }
  function currentLink(location, doc) {
    const id = mediaID(location.href);
    if (id) return 'https://www.douyin.com/video/' + id;
    if (location.hostname === 'v.douyin.com') return location.href;
    // Some Douyin players keep /jingxuan in the URL. Read only visible hashtag links with an explicit aweme_id.
    const ids = new Set();
    for (const anchor of doc.querySelectorAll('a[href*="aweme_id="]')) {
      const rect = anchor.getBoundingClientRect();
      const candidate = mediaID(anchor.href);
      if (candidate && rect.width && rect.height && rect.top >= 0 && rect.top < (doc.defaultView?.innerHeight || 1080)) ids.add(candidate);
    }
    if (ids.size === 1) return 'https://www.douyin.com/video/' + [...ids][0];
    if (/^\/user\/[\w-]+\/?$/.test(location.pathname)) return location.origin + location.pathname;
    throw new Error('无法确定当前作品，请打开作品详情，或收集本页链接后选择提交');
  }
  class Backend {
    constructor(server, token) {
      this.server = serverURL(server);
      if (!token || token.length < 16) throw new Error('请先填写后台访问令牌');
      this.token = token;
    }
    request(path, body) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: body === undefined ? 'GET' : 'POST', url:this.server+'/api'+path,
          headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},
          ...(body === undefined ? {} : {data:JSON.stringify(body)}), timeout:20000, anonymous:true,
          onload(response) {
            let data;
            try { data=JSON.parse(response.responseText); } catch { reject(new Error('后台响应格式错误，请检查地址')); return; }
            if (response.status < 200 || response.status >= 300) { reject(new Error(typeof data.detail==='string' ? data.detail : '后台请求失败')); return; }
            resolve(data);
          },
          onerror:()=>reject(new Error('连接失败，请检查后台服务及油猴的跨域访问许可')),
          ontimeout:()=>reject(new Error('后台连接超时'))
        });
      });
    }
  }
  // The exact production helpers are exercised by Node tests without mounting a browser UI.
  if (typeof window === 'undefined') {
    module.exports = {Backend,serverURL,mediaID,collectLinks,currentLink};
    return;
  }
  if (document.getElementById('douyin-personal-download-helper')) return;
  const host=document.createElement('div');host.id='douyin-personal-download-helper';
  host.style.cssText='position:fixed;right:18px;bottom:28px;z-index:2147483646;';
  const root=host.attachShadow({mode:'closed'});
  root.innerHTML=`<style>
    :host{font:14px "Microsoft YaHei",sans-serif;color:#203f32}*{box-sizing:border-box}button,input,textarea{font:inherit}button{border:0;background:#285d46;color:white;border-radius:8px;padding:10px 12px;cursor:pointer}button:disabled{opacity:.5}#toggle{box-shadow:0 3px 15px #0004}#panel{display:none;width:min(370px,90vw);max-height:80vh;overflow:auto;background:#f7faf4;padding:20px;border:1px solid #d0ddcd;border-radius:14px;box-shadow:0 8px 40px #0004;margin-bottom:10px}h2{margin:0;font-size:19px}p{font-size:12px;color:#64806c;line-height:1.6}label{display:block;font-size:12px;margin:12px 0}input,textarea{display:block;background:white;color:#203f32;width:100%;padding:9px;border:1px solid #ccd9ca;border-radius:7px;margin:5px 0}textarea{resize:vertical}.actions{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}#status{overflow-wrap:anywhere;min-height:24px}details{margin:14px 0}summary{cursor:pointer;color:#3e6951}.close{float:right;background:transparent;color:#345d47;padding:0 4px}
  </style><section id="panel"><button class="close" id="close" aria-label="关闭">×</button><h2>抖音下载管理</h2><p>通过现有油猴脚本管理器，下载到自己的后台。</p><details id="configuration"><summary>后台连接设置</summary><label>后台地址<input id="server" placeholder="http://127.0.0.1:8787"></label><label>访问令牌<input id="token" type="password" autocomplete="off" placeholder="后台数据目录 access-token 文件内容"></label><button id="save">保存并测试连接</button><p>只保存到本机脚本存储，不自动读取 Cookie。</p></details><div class="actions"><button id="current">下载当前作品</button><button id="collect">收集本页链接</button><button id="history">识别本页历史</button></div><textarea id="links" rows="5" aria-label="批量下载链接" placeholder="收集后可删改；也可粘贴多条分享文案"></textarea><div class="actions"><button id="submit">提交这些链接</button><button id="open">打开管理面板</button></div><p id="status" role="status" aria-live="polite">请先配置后台连接。</p></section><button id="toggle">↓ 下载管理</button>`;
  document.body.append(host);
  const $=id=>root.getElementById(id), show=text=>{$('status').textContent=text;};
  let config={server:GM_getValue('douyin.server','http://127.0.0.1:8787'),token:GM_getValue('douyin.token','')};
  $('server').value=config.server;$('token').value=config.token;
  if(!config.token)$('configuration').open=true;
  const open=()=>{$('panel').style.display='block';};
  $('toggle').onclick=()=>{$('panel').style.display=$('panel').style.display==='block'?'none':'block';};
  $('close').onclick=()=>{$('panel').style.display='none';};
  GM_registerMenuCommand('打开抖音下载管理',open);
  const client=()=>new Backend(config.server,config.token);
  async function run(button,action){button.disabled=true;try{await action();}catch(error){show(error.message);}finally{button.disabled=false;}}
  $('save').onclick=()=>run($('save'),async()=>{
    const server=serverURL($('server').value.trim()),token=$('token').value.trim();
    await new Backend(server,token).request('/status');
    GM_setValue('douyin.server',server);GM_setValue('douyin.token',token);config={server,token};show('后台已连接，配置已保存在本机油猴存储。');
  });
  async function submit(text){if(!text.trim())throw new Error('请先填写或收集链接');const data=await client().request('/tasks',{text});show(`处理 ${data.items.length} 条，重复 ${data.items.filter(item=>item.duplicate).length} 条。可在管理面板查看进度。`);}
  $('current').onclick=()=>run($('current'),()=>submit(currentLink(window.location,document)));
  $('collect').onclick=()=>{const items=collectLinks(document);$('links').value=items.join('\n');show(`已收集 ${items.length} 条已加载的作品链接，请检查后提交。主页全部分页请直接提交主页链接。`);};
  $('submit').onclick=()=>run($('submit'),()=>submit($('links').value));
  $('history').onclick=()=>run($('history'),async()=>{
    const ids=collectLinks(document).map(mediaID);const current=mediaID(window.location.href);if(current&&!ids.includes(current))ids.unshift(current);
    const result=await client().request('/history/check',{ids:ids.slice(0,500)});let marked=0;
    for(const anchor of document.querySelectorAll('a[href]')){
      const state=result.items[mediaID(anchor.href)];if(!state||state==='new')continue;
      anchor.setAttribute('data-douyin-download-state',state);
      if(!anchor.dataset.douyinOriginalTitle)anchor.dataset.douyinOriginalTitle=anchor.title||' ';
      anchor.title=`[${STATES[state]||state}] ${anchor.dataset.douyinOriginalTitle.trim()}`;
      anchor.style.outline=state==='completed'||state==='skipped'?'2px solid #57b487':'2px dashed #c6a858';marked++;
    }
    const done=Object.values(result.items).filter(state=>state==='completed'||state==='skipped').length;
    show(`识别 ${ids.length} 个作品，其中 ${done} 个已下载；标记 ${marked} 个页面链接。`);
  });
  $('open').onclick=()=>{try{window.open(serverURL(config.server),'_blank','noopener,noreferrer');}catch(error){show(error.message);}};
})();
