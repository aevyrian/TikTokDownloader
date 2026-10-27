// ==UserScript==
// @name         Cloudrift Sender
// @namespace    douyin-local-library
// @version      1.6.1
// @description  一键下载作品或博主，按日、周、月订阅更新并同步网站收藏状态。
// @match        https://www.douyin.com/*
// @match        https://douyin.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==
(function () {
  'use strict';
  function douyinURL(value) {
    try {
      const u = new URL(value, 'https://www.douyin.com');
      return u.protocol === 'https:' && ['douyin.com', 'www.douyin.com'].includes(u.hostname) ? u : null;
    } catch { return null; }
  }
  function resolveTargets(page, focused, authorLink, activeId) {
    const current = douyinURL(page);
    const front = /^\d{19}$/.test(activeId || '') ? douyinURL(`/video/${activeId}`) : focused && douyinURL(focused);
    const result = { detail: null, author: null };
    if (!current) return result;
    for (const url of [front, current].filter(Boolean)) {
      const match = url.pathname.match(/^\/(video|note)\/(\d{19})\/?$/);
      const modal = url.searchParams.get('modal_id');
      if (match) { result.detail = `https://www.douyin.com/${match[1]}/${match[2]}`; break; }
      if (modal && /^\d{19}$/.test(modal)) { result.detail = `https://www.douyin.com/video/${modal}`; break; }
    }
    for (const url of [authorLink && douyinURL(authorLink), current].filter(Boolean)) {
      const match = url.pathname.match(/^\/user\/([A-Za-z0-9_-]{6,128})\/?$/);
      if (match) { result.author = `https://www.douyin.com/user/${match[1]}`; break; }
    }
    return result;
  }
  function normalizeServer(value) {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('请填网站根地址，例如 http://NAS地址:8090');
    }
    return url.origin;
  }
  function togglePanel(panel, button) {
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    button.setAttribute('aria-label', panel.hidden ? '打开媒体库发送菜单' : '收起媒体库发送菜单');
  }
  function defaultKind(value) { return value === 'detail' ? 'detail' : 'author'; }
  function pageTargets(scope, page) {
    const standalone = scope?.matches('[data-e2e="video-detail"], [data-e2e="note-detail"]');
    const work = !standalone && scope?.querySelector('a[href*="/video/"], a[href*="/note/"]')?.href;
    const author = scope?.querySelector('a[data-e2e="video-author-name"], a[data-e2e="video-avatar"]')
      || scope?.querySelector('[data-e2e="user-info"] a[href*="/user/"]') || scope?.querySelector('a[href*="/user/"]');
    const card = standalone ? null : scope?.matches('[data-e2e-vid]') ? scope : scope?.querySelector('[data-e2e-vid], [data-e2e-aweme-id]');
    const activeId = card?.getAttribute('data-e2e-vid') || card?.getAttribute('data-e2e-aweme-id');
    return { author, targets: resolveTargets(page, work, author?.href, activeId) };
  }
  function senderPosition(anchor, viewport, panelHeight) {
    const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
    const left = clamp(anchor ? anchor.left + (anchor.width - 36) / 2 : viewport.width - 56, 12, viewport.width - 48);
    const top = clamp(anchor ? anchor.top - 48 : 150, 12, viewport.height - 48);
    const panelWidth = Math.min(260, viewport.width - 24);
    return {left, top, panelWidth,
      panelLeft: clamp(left >= panelWidth + 24 ? left - panelWidth - 12 : left + 48, 12, viewport.width - panelWidth - 12),
      panelTop: clamp(top, 12, viewport.height - panelHeight - 12)};
  }
  function subscriptionState(authors,url) { const author=authors.find(a=>resolveTargets(a.url).author===url)||null;return {author,enabled:Boolean(author?.enabled),frequency:({4320:'three_days',10080:'weekly',43200:'monthly',129600:'quarterly',525600:'yearly'}[author?.interval_minutes]||'quarterly')}; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { resolveTargets, normalizeServer, togglePanel, defaultKind, senderPosition, pageTargets, subscriptionState }; return; }

  const host = document.createElement('div');
  host.id = 'douyin-library-sender';
  host.style.cssText = 'position:fixed;width:36px;height:36px;z-index:2147483647';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ':host{font:13px/1.5 system-ui;color:#eeeef0}*{box-sizing:border-box}section{position:fixed;padding:14px;border:1px solid #ffffff10;border-radius:12px;background:#25262be8;backdrop-filter:blur(24px);box-shadow:0 8px 28px #0004;max-height:calc(100vh - 24px);overflow:auto}section[hidden],[hidden],.settings-open .downloads{display:none!important}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}header strong{font-size:12px;font-weight:500;color:#a9a9b1;letter-spacing:.3px}button{border:0;border-radius:7px;padding:9px 10px;background:#ffffff08;color:inherit;cursor:pointer;font:inherit;text-align:left}button:hover{background:#ffffff13}button:disabled{opacity:.4;cursor:default}button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid #c7cad5;outline-offset:3px}.actions{display:grid;gap:4px;margin:12px 0 9px}.actions button{display:flex;align-items:center;min-height:38px}.actions button:before{content:"↓";font-size:18px;margin-right:10px;color:#b4b4bc}.actions .primary:before{color:#ff5077}.actions .primary{background:#ffffff0d}.close{padding:0;width:20px;height:20px;line-height:20px;text-align:center;background:transparent;font-size:19px;color:#93939d}.toggle{width:36px;height:36px;padding:0;text-align:center;border-radius:50%;background:#ffffff05;border:1px solid #ffffff14;color:#ffffff70;font-size:18px;line-height:1;transition:color .15s,background .15s}.toggle:hover,.toggle[aria-expanded=true],.toggle:focus-visible{color:#eee;background:#ffffff12}.creator{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.author-link{display:inline-block;margin-top:3px;font-size:11px;color:#94949f}p{font-size:11px;color:#93939e;margin:6px 0;overflow-wrap:anywhere}a{color:#b2b2bd;text-decoration:none}a:hover{color:#fff}.footer{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:9px;border-top:1px solid #ffffff0c;font-size:11px}.footer small{font-size:10px;color:#71717d}details{margin-top:12px}summary{cursor:pointer;color:#a5a5b0;font-size:11px;list-style:none}summary::-webkit-details-marker{display:none}summary:hover{color:#eee}label{display:block;margin:10px 0 5px;color:#b8b8c2;font-size:11px}input,select{display:block;width:100%;margin-top:5px;border:1px solid #ffffff14;background:#ffffff06;color:inherit;border-radius:6px;padding:7px;font:inherit;outline:none}input:focus,select:focus{border-color:#ffffff50}select option{background:#25262b}form button{width:100%;margin-top:12px;text-align:center;background:#ffffff12}.status{color:#c8c8d0;font-size:11px}.status:empty{display:none}';
  const panel = document.createElement('section'); panel.hidden = true; panel.setAttribute('aria-label', 'Cloudrift 下载面板');
  const toggle = document.createElement('button'); toggle.textContent = '▷'; toggle.className = 'toggle'; toggle.title = 'Cloudrift · 下载到媒体库';
  toggle.setAttribute('aria-label', '打开媒体库发送菜单'); toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => { settings.open = false; togglePanel(panel, toggle); if(!panel.hidden){authors=null;subscriptionGeneration++;subscriptionFor='';}detect(); });
  const header = document.createElement('header');
  const title = document.createElement('strong'); title.textContent = 'Cloudrift';
  const close = document.createElement('button'); close.textContent = '×'; close.className = 'close'; close.setAttribute('aria-label', '收起下载面板');
  close.addEventListener('click', () => { togglePanel(panel, toggle); toggle.focus(); }); header.append(title, close);
  const creator = document.createElement('strong'); creator.className = 'creator';
  const creatorRow=document.createElement('div');creatorRow.className='creator-row';
  const frequency=document.createElement('select');frequency.setAttribute('aria-label','博主更新周期');
  for(const [value,text] of [['three_days','每3天更新'],['weekly','每7天更新'],['monthly','每月更新'],['quarterly','每季度更新'],['yearly','每年更新']]){const option=document.createElement('option');option.value=value;option.textContent=text;frequency.append(option);}frequency.value='quarterly';
  const subscribe=document.createElement('button');subscribe.className='subscribe';subscribe.textContent='♡';subscribe.setAttribute('aria-label','订阅博主');subscribe.setAttribute('aria-pressed','false');
  creatorRow.append(creator,frequency,subscribe);
  const authorLink = document.createElement('a'); authorLink.className = 'author-link'; authorLink.target = '_blank'; authorLink.rel = 'noopener noreferrer';
  const detailButton = document.createElement('button'); detailButton.textContent = '下载当前作品';
  const authorButton = document.createElement('button'); authorButton.textContent = '下载博主全部作品';
  const actions = document.createElement('div'); actions.className = 'actions';
  const hint = document.createElement('p'); hint.textContent = '下载只下这次，点亮爱心才追更。';
  const settings = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = '连接与默认设置';
  const form = document.createElement('form');
  function field(text, control) { const label = document.createElement('label'); label.textContent = text; label.append(control); form.append(label); }
  const serverInput = document.createElement('input'); serverInput.type = 'url'; serverInput.required = true; serverInput.placeholder = 'http://nas.example:8090'; serverInput.value = GM_getValue('library_server', '');
  field('网站地址', serverInput);
  const tokenInput = document.createElement('input'); tokenInput.type = 'password'; tokenInput.autocomplete = 'new-password'; tokenInput.placeholder = '留空保留已保存的管理员密钥';
  field('管理员密钥', tokenInput);
  const preference = document.createElement('select');
  for (const [value, text] of [['author','博主全部作品（单次）'],['detail','当前作品（单次）']]) { const option = document.createElement('option'); option.value = value; option.textContent = text; preference.append(option); }
  preference.value = defaultKind(GM_getValue('library_default_kind', 'author')); field('默认下载内容', preference);
  const save = document.createElement('button'); save.type = 'submit'; save.textContent = '保存设置'; form.append(save); settings.append(summary, form);
  const footer = document.createElement('div'); footer.className = 'footer';
  const version = document.createElement('small'); version.textContent = 'SENDER 1.6.1';
  const libraryLink = document.createElement('a'); libraryLink.textContent = '查看任务 ↗'; libraryLink.target = '_blank'; libraryLink.rel = 'noopener noreferrer'; libraryLink.hidden = true;
  const status = document.createElement('p'); status.className = 'status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const downloads = document.createElement('div'); downloads.className = 'downloads'; downloads.append(creatorRow, authorLink, actions, hint);
  footer.append(version, libraryLink); panel.append(header, downloads, settings, status, footer); shadow.append(style, panel, toggle); document.body.append(host);
  host.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { togglePanel(panel, toggle); toggle.focus(); } });
  let targets = { detail: null, author: null }, sending = false, anchor = null;
  let subscription=null,subscriptionFor='',subscriptionBusy=false,subscriptionLoaded=false,authors=null,subscriptionGeneration=0;
  style.textContent+='.creator-row{display:flex;align-items:center;gap:7px}.creator-row .creator{flex:1;min-width:0}.creator-row select{flex:none;width:88px;margin:0;padding:4px 5px;font-size:11px}.subscribe{flex:none;width:25px;padding:0;background:transparent;color:#ffffff80;font-size:23px;line-height:28px;text-align:center}.subscribe[aria-pressed=true]{color:#ff4f78}.subscribe:hover{background:transparent;color:#fff}.subscribe[aria-pressed=true]:hover{color:#ff718e}';
  function subscriptionRequest(method,path,body){return new Promise((resolve,reject)=>{
    let server;try{server=normalizeServer(GM_getValue('library_server',''));}catch{reject(new Error('请先配置网站地址。'));return;}
    GM_xmlhttpRequest({method,url:server+path,timeout:15000,headers:{'Content-Type':'application/json',Authorization:`Bearer ${GM_getValue('library_token','')}`},...(body===undefined?{}:{data:JSON.stringify(body)}),
      onload(response){let data;try{data=JSON.parse(response.responseText);}catch{reject(new Error('网站返回异常，请检查连接。'));return;}if(response.status>=200&&response.status<300)resolve(data);else reject(new Error(typeof data.detail==='string'?data.detail:`订阅操作失败（${response.status}）`));},
      onerror(){reject(new Error('网站不可达，请检查 NAS 连接。'));},ontimeout(){reject(new Error('订阅请求超时，请重新打开面板核对状态。'));},onabort(){reject(new Error('订阅请求已中止。'));}});
  });}
  function paintSubscription(){
    const checked=subscriptionLoaded&&subscriptionFor===targets.author&&Boolean(subscription?.enabled);
    subscribe.textContent=checked?'♥':'♡';subscribe.setAttribute('aria-pressed',String(checked));subscribe.title=checked?'停止追更，保留已有作品':subscriptionLoaded?'按所选周期订阅此博主':subscriptionBusy?'正在核对网站订阅状态':'点击重新核对网站订阅状态';
    subscribe.disabled=subscriptionBusy||!targets.author;frequency.disabled=subscriptionBusy||!targets.author;
  }
  async function loadSubscription(){
    if(panel.hidden||settings.open||subscriptionBusy||!targets.author||subscriptionFor===targets.author)return;
    const link=targets.author;subscriptionFor=link;subscription=null;subscriptionLoaded=false;paintSubscription();
    if(!GM_getValue('library_server','')||!GM_getValue('library_token','')){subscribe.title='先在连接设置中配置网站';return;}
    if(authors){const found=subscriptionState(authors,link);subscription=found.author;subscriptionLoaded=true;frequency.value=found.frequency;paintSubscription();return;}
    const generation=subscriptionGeneration;
    subscriptionBusy=true;paintSubscription();
    try{const result=await subscriptionRequest('GET','/api/authors');if(!Array.isArray(result))throw new Error('网站订阅列表格式异常');
      if(generation===subscriptionGeneration){authors=result;subscriptionFor='';}
    }catch(error){if(generation===subscriptionGeneration){status.textContent=error.message;subscriptionFor=targets.author;}}
    finally{subscriptionBusy=false;paintSubscription();if(generation!==subscriptionGeneration||authors)loadSubscription();}
  }
  async function saveSubscription(changeFrequency=false){
    if(subscriptionBusy||!targets.author)return;
    if(!GM_getValue('library_server','')||!GM_getValue('library_token','')){configure();status.textContent='请先配置网站，再设置追更。';return;}
    const link=targets.author;
    if(!subscriptionLoaded||subscriptionFor!==link){subscriptionFor='';await loadSubscription();if(!subscriptionLoaded||targets.author!==link)return;}
    const turnOff=Boolean(subscription?.enabled)&&!changeFrequency,generation=subscriptionGeneration;subscriptionBusy=true;paintSubscription();
    try{const saved=subscription?.id?await subscriptionRequest('PATCH',`/api/authors/${encodeURIComponent(subscription.id)}`,turnOff?{enabled:false}:{frequency:frequency.value}):await subscriptionRequest('POST','/api/authors',{url:link,name:creator.textContent.replace(/^@+/,'').slice(0,100),frequency:frequency.value});
      if(generation===subscriptionGeneration){authors=null;if(targets.author===link){subscription=saved;subscriptionLoaded=true;subscriptionFor=link;status.textContent=turnOff?'已停止追更，已有作品保留。':`已订阅 · ${frequency.selectedOptions[0].textContent}`;}}
    }catch(error){if(generation===subscriptionGeneration&&targets.author===link){status.textContent=error.message;subscriptionFor=link;subscriptionLoaded=false;}}
    finally{subscriptionBusy=false;paintSubscription();if(generation!==subscriptionGeneration||targets.author!==link)loadSubscription();}
  }
  subscribe.addEventListener('click',()=>saveSubscription());
  frequency.addEventListener('change',()=>{if(subscriptionLoaded&&subscription?.enabled)saveSubscription(true);});
  const recent = new Set();
  function configure() {
    if (panel.hidden) togglePanel(panel, toggle);
    settings.open = true; detect(); serverInput.focus();
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    let server;
    try { server = normalizeServer(serverInput.value); } catch (error) { status.textContent = error.message; return; }
    const token = tokenInput.value.trim() || GM_getValue('library_token', '');
    if (!token) { status.textContent = '请填写管理员密钥。'; tokenInput.focus(); return; }
    GM_setValue('library_server', server); GM_setValue('library_token', token.trim());
    GM_setValue('library_default_kind', defaultKind(preference.value)); tokenInput.value = '';
    libraryLink.href = `${server}/#tasks`; libraryLink.hidden = false;
    prioritize(); settings.open = false;authors=null;subscriptionGeneration++;subscriptionFor='';status.textContent = '设置已保存，点击下载按钮才会发送。'; position();loadSubscription();
  });
  GM_registerMenuCommand('Cloudrift · 连接与默认下载设置', configure);
  function prioritize() {
    const kind = defaultKind(GM_getValue('library_default_kind', 'author'));
    authorButton.className = kind === 'author' ? 'primary' : '';
    detailButton.className = kind === 'detail' ? 'primary' : '';
    actions.replaceChildren(...(kind === 'author' ? [authorButton, detailButton] : [detailButton, authorButton]));
  }
  function position() {
    const p = senderPosition(anchor, {width:innerWidth,height:innerHeight}, panel.hidden ? 0 : panel.offsetHeight);
    host.style.left = p.left+'px'; host.style.top = p.top+'px';
    panel.style.left = p.panelLeft+'px'; panel.style.top = p.panelTop+'px'; panel.style.width = p.panelWidth+'px';
  }
  new ResizeObserver(position).observe(panel);
  function visible(element) { const r = element.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; }
  function detect() {
    // shortcut: 抖音可能调整页面结构，选择器失效时可进入独立作品/博主页发送。
    const playing = [...document.querySelectorAll('video')].find(video => visible(video) && !video.paused);
    const detailPage = document.querySelector('[data-e2e="video-detail"], [data-e2e="note-detail"]');
    const scope = (detailPage && visible(detailPage) ? detailPage : null)
      || [...document.querySelectorAll('[data-e2e="feed-active-video"]')].find(visible)
      || playing?.closest('[data-e2e="feed-item"], [data-e2e="feed-video"], [role="dialog"]')
      || [...document.querySelectorAll('[role="dialog"]')].find(visible);
    const current = pageTargets(scope, location.href), author = current.author;
    if (!sending && (targets.detail !== current.targets.detail || targets.author !== current.targets.author)) status.textContent = '';
    targets = current.targets;
    if(subscriptionFor!==targets.author){subscriptionLoaded=false;subscription=null;}
    const namedAuthor = [...(scope || document).querySelectorAll('[data-e2e="user-info"] a[href*="/user/"]')].find(a=>a.textContent.trim());
    const profileName=!scope&&location.pathname.startsWith('/user/')?document.querySelector('h1')?.textContent:'';
    creator.textContent = (profileName || scope?.querySelector('[data-e2e="feed-video-nickname"]')?.textContent || namedAuthor?.textContent || author?.textContent || '当前博主').trim();
    authorLink.hidden = !targets.author; authorLink.textContent = '查看博主主页 ↗'; authorLink.href = targets.author || '#'; authorLink.title = targets.author || '';
    let rail = scope?.querySelector('[data-e2e="video-avatar"]');
    anchor = rail && visible(rail) ? rail.getBoundingClientRect() : null;
    for (let node = rail?.parentElement; node && scope.contains(node); node = node.parentElement) {
      const r = node.getBoundingClientRect();
      if (r.width > 140) break;
      if (anchor && visible(node) && node.querySelector('[data-e2e="video-player-digg"]')) anchor = {left:anchor.left,width:anchor.width,top:r.top};
    }
    position();
    detailButton.disabled = sending || !targets.detail;
    authorButton.disabled = sending || !targets.author;
    detailButton.title = targets.detail || '请先打开一条作品';
    authorButton.title = targets.author || '请进入博主页或打开含作者信息的作品';
    paintSubscription();loadSubscription();
  }
  async function send(kind) {
    detect();
    const link = targets[kind];
    if (!link || sending) return;
    if (!GM_getValue('library_server', '') || !GM_getValue('library_token', '')) { configure(); status.textContent = '请先完成下方连接设置，再点击下载。'; return; }
    if (recent.has(link)) { status.textContent = '这个页面的对象已发送，请到网站查看任务。'; return; }
    const server = GM_getValue('library_server', '');
    try { normalizeServer(server); } catch { status.textContent = '网站地址无效，请重新配置。'; return; }
    sending = true; detect(); status.textContent = '正在向网站提交…';
    libraryLink.href = `${server}/#tasks`; libraryLink.hidden = false;
    try { GM_xmlhttpRequest({
      method: 'POST', url: `${server}/api/tasks`, timeout: 20000,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GM_getValue('library_token', '')}` },
      data: JSON.stringify({ link, kind }),
      onload(response) {
        sending = false; detect();
        let data; try { data = JSON.parse(response.responseText); } catch { data = {}; }
        if (response.status >= 200 && response.status < 300 && data.id !== undefined) {
          recent.add(link); status.textContent = targets[kind] === link ? `网站已收到任务 #${data.id}。下载进度请到网站查看。` : '';
        } else { status.textContent = typeof data.detail === 'string' ? data.detail : `提交失败（${response.status}），请检查网站地址与密钥。`; }
      },
      onerror() { sending = false; detect(); status.textContent = '网站不可达，请检查 NAS 连接和网站地址后重试。'; },
      ontimeout() { sending = false; detect(); status.textContent = '网站响应超时，请到网站检查任务后重试。'; },
      onabort() { sending = false; detect(); status.textContent = '提交已中止，可以重新发送。'; },
    }); } catch { sending = false; detect(); status.textContent = '未能提交，请检查脚本权限或连接设置后重试。'; }
  }
  detailButton.addEventListener('click', () => send('detail'));
  authorButton.addEventListener('click', () => send('author'));
  let pending;
  const observer = new MutationObserver(records => {
    if (records.every(record => host.contains(record.target))) return;
    clearTimeout(pending); pending = setTimeout(detect, 180);
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter:['data-e2e-vid','data-e2e-aweme-id','href'] });
  addEventListener('popstate', detect); addEventListener('resize', detect);
  settings.addEventListener('toggle', () => { panel.classList.toggle('settings-open',settings.open); title.textContent = settings.open ? '连接设置' : 'Cloudrift'; summary.textContent = settings.open ? '‹ 返回下载' : '连接与默认设置'; position(); });
  document.addEventListener('pointerdown', event => { if (!panel.hidden && !host.contains(event.target)) togglePanel(panel, toggle); });
  prioritize(); setInterval(detect, 1500); detect();
  try { const server = normalizeServer(GM_getValue('library_server', '')); libraryLink.href = `${server}/#tasks`; libraryLink.hidden = false; } catch {}
})();
