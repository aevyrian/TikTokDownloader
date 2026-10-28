// ==UserScript==
// @name         Cloudrift Sender
// @namespace    douyin-local-library
// @version      1.7.0
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
    const left = clamp(anchor ? anchor.left + (anchor.width - 44) / 2 : viewport.width - 64, 12, viewport.width - 56);
    const top = clamp(anchor ? anchor.top - 56 : 150, 12, viewport.height - 56);
    const panelWidth = Math.min(304, viewport.width - 24);
    return {left, top, panelWidth,
      panelLeft: clamp(left >= panelWidth + 24 ? left - panelWidth - 12 : left + 56, 12, viewport.width - panelWidth - 12),
      panelTop: clamp(top, 12, viewport.height - panelHeight - 12)};
  }
  function subscriptionState(authors,url) { const author=authors.find(a=>resolveTargets(a.url).author===url)||null;return {author,enabled:Boolean(author?.enabled),frequency:({4320:'three_days',10080:'weekly',43200:'monthly',129600:'quarterly',525600:'yearly'}[author?.interval_minutes]||'quarterly')}; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { resolveTargets, normalizeServer, togglePanel, defaultKind, senderPosition, pageTargets, subscriptionState }; return; }

  const host = document.createElement('div');
  host.id = 'douyin-library-sender';
  host.style.cssText = 'position:fixed;width:44px;height:44px;z-index:2147483647';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
:host{font:13px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#f0f0f3;color-scheme:dark}*{box-sizing:border-box}
section{position:fixed;padding:18px;border:1px solid #ffffff1c;border-radius:16px;background:#24252bf5;backdrop-filter:blur(24px);box-shadow:0 16px 48px #0005;max-height:calc(100dvh - 24px);overflow:auto;scrollbar-width:thin}
section[hidden],[hidden],.settings-open .downloads{display:none!important}
header{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;margin-bottom:16px;border-bottom:1px solid #ffffff10}.brand{display:flex;align-items:baseline;gap:9px}.brand strong{font-size:15px;font-weight:650;letter-spacing:.2px}.brand small{font-size:10px;color:#a7a8b3}
button{border:1px solid transparent;border-radius:10px;padding:10px 12px;background:#ffffff08;color:inherit;cursor:pointer;font:inherit;text-align:left}button:hover{background:#ffffff10}button:disabled{opacity:.42;cursor:default}button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid #ff7897;outline-offset:3px}
.close{display:grid;place-items:center;padding:0;width:28px;height:28px;background:transparent;font-size:22px;line-height:1;color:#b6b7c1}
.toggle{display:grid;place-items:center;width:44px;height:44px;padding:0;border-radius:12px;background:#272830ed;border:1px solid #ffffff26;color:#eeeef2;box-shadow:0 3px 12px #0003;transition:color .15s,background .15s,border-color .15s}.toggle:hover,.toggle:focus-visible{background:#353640;border-color:#ffffff55}.toggle[aria-expanded=true]{color:#ff7897;background:#303039;border-color:#ff789765}.toggle svg{display:block;pointer-events:none}
.creator-row{min-width:0}.creator{display:block;font-size:17px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.author-link{display:inline-flex;margin-top:3px;align-items:center;min-height:24px;font-size:11px;color:#a8a9b4}
a{color:#bcbcc7;text-decoration:none}a:hover{color:#fff}.actions{display:grid;gap:8px;margin:14px 0 8px}.actions button{display:flex;align-items:center;min-height:45px;border-color:#ffffff0b;background:#ffffff05;font-size:13px;font-weight:550}.actions button:before{content:"↓";width:24px;margin-right:9px;color:#c6c7d1;font-size:23px;line-height:1}.actions button:hover{background:#ffffff0d}.actions .primary{background:#ff50770d;border-color:#ff50773b}.actions .primary:hover{background:#ff507719}.actions .primary:before{color:#ff6a8c}
p{font-size:11px;color:#a7a8b3;margin:7px 0;overflow-wrap:anywhere}.followup{padding:12px;margin-top:15px;border:1px solid #ffffff0f;border-radius:11px;background:#ffffff03}.followup-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px;color:#c8c9d2;font-size:11px}.subscription-state{color:#a9aab4}.subscription-state.active{color:#ff8aa4}.followup-controls{display:flex;align-items:center;gap:8px}.followup-controls select{flex:1;min-width:0;width:auto;margin:0}.subscribe{display:grid;place-items:center;flex:none;width:37px;height:35px;padding:0;font-size:23px;line-height:1;color:#c1c2ce;background:#ffffff05;border-color:#ffffff12}.subscribe[aria-pressed=true]{color:#ff7897;border-color:#ff78973b;background:#ff50770b}.subscribe:hover{background:#ffffff10}
.footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:13px;padding-top:12px;border-top:1px solid #ffffff10;font-size:11px}.footer small{font-size:9px;letter-spacing:.5px;color:#9697a3}
details{margin-top:12px}summary{display:flex;align-items:center;justify-content:space-between;min-height:28px;cursor:pointer;color:#b4b5c0;font-size:11px;list-style:none}summary:after{content:"›";font-size:18px;line-height:1}details[open] summary:after{transform:rotate(90deg)}summary::-webkit-details-marker{display:none}summary:hover{color:#fff}
label{display:block;margin:12px 0 6px;color:#bfc0cb;font-size:11px}input,select{display:block;width:100%;margin-top:5px;border:1px solid #ffffff1b;background:#ffffff05;color:inherit;border-radius:8px;padding:7px 9px;font:inherit;outline:none}input:focus,select:focus{border-color:#ff789780}select option{background:#272830}form button{width:100%;margin-top:13px;text-align:center;background:#ffffff10}.status{color:#dddde5;font-size:11px}.status:empty{display:none}
@media(prefers-reduced-motion:reduce){.toggle{transition:none}}
  `;
  const panel = document.createElement('section'); panel.hidden = true; panel.setAttribute('aria-label', 'Cloudrift 下载面板');
  const toggle = document.createElement('button'); toggle.innerHTML = '<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>'; toggle.className = 'toggle'; toggle.title = 'Cloudrift · 下载到媒体库';
  toggle.setAttribute('aria-label', '打开媒体库发送菜单'); toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => { settings.open = false; togglePanel(panel, toggle); if(!panel.hidden){authors=null;subscriptionGeneration++;subscriptionFor='';}detect(); });
  const header = document.createElement('header');
  const title = document.createElement('strong'); title.textContent = 'Cloudrift';
  const brand = document.createElement('div'); brand.className = 'brand';
  const subtitle = document.createElement('small'); subtitle.textContent = '下载与归档'; brand.append(title, subtitle);
  const close = document.createElement('button'); close.textContent = '×'; close.className = 'close'; close.setAttribute('aria-label', '收起下载面板');
  close.addEventListener('click', () => { togglePanel(panel, toggle); toggle.focus(); }); header.append(brand, close);
  const creator = document.createElement('strong'); creator.className = 'creator';
  const creatorRow=document.createElement('div');creatorRow.className='creator-row';
  const frequency=document.createElement('select');frequency.setAttribute('aria-label','博主更新周期');
  for(const [value,text] of [['three_days','每3天更新'],['weekly','每7天更新'],['monthly','每月更新'],['quarterly','每季度更新'],['yearly','每年更新']]){const option=document.createElement('option');option.value=value;option.textContent=text;frequency.append(option);}frequency.value='quarterly';
  const subscribe=document.createElement('button');subscribe.className='subscribe';subscribe.textContent='♡';subscribe.setAttribute('aria-label','订阅博主');subscribe.setAttribute('aria-pressed','false');
  creatorRow.append(creator);
  const followup=document.createElement('div');followup.className='followup';
  const followupHeading=document.createElement('div');followupHeading.className='followup-heading';
  const followupLabel=document.createElement('span');followupLabel.textContent='后续追更';
  const subscriptionLabel=document.createElement('span');subscriptionLabel.className='subscription-state';subscriptionLabel.textContent='待核对';
  const followupControls=document.createElement('div');followupControls.className='followup-controls';followupControls.append(frequency,subscribe);
  followupHeading.append(followupLabel,subscriptionLabel);followup.append(followupHeading,followupControls);
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
  const version = document.createElement('small'); version.textContent = 'SENDER 1.7.0';
  const libraryLink = document.createElement('a'); libraryLink.textContent = '查看任务 ↗'; libraryLink.target = '_blank'; libraryLink.rel = 'noopener noreferrer'; libraryLink.hidden = true;
  const status = document.createElement('p'); status.className = 'status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const downloads = document.createElement('div'); downloads.className = 'downloads'; downloads.append(creatorRow, authorLink, actions, hint, followup);
  footer.append(version, libraryLink); panel.append(header, downloads, settings, status, footer); shadow.append(style, panel, toggle); document.body.append(host);
  host.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { togglePanel(panel, toggle); toggle.focus(); } });
  let targets = { detail: null, author: null }, sending = false, anchor = null;
  let subscription=null,subscriptionFor='',subscriptionBusy=false,subscriptionLoaded=false,authors=null,subscriptionGeneration=0;
  function subscriptionRequest(method,path,body){return new Promise((resolve,reject)=>{
    let server;try{server=normalizeServer(GM_getValue('library_server',''));}catch{reject(new Error('请先配置网站地址。'));return;}
    GM_xmlhttpRequest({method,url:server+path,timeout:15000,headers:{'Content-Type':'application/json',Authorization:`Bearer ${GM_getValue('library_token','')}`},...(body===undefined?{}:{data:JSON.stringify(body)}),
      onload(response){let data;try{data=JSON.parse(response.responseText);}catch{reject(new Error('网站返回异常，请检查连接。'));return;}if(response.status>=200&&response.status<300)resolve(data);else reject(new Error(typeof data.detail==='string'?data.detail:`订阅操作失败（${response.status}）`));},
      onerror(){reject(new Error('网站不可达，请检查 NAS 连接。'));},ontimeout(){reject(new Error('订阅请求超时，请重新打开面板核对状态。'));},onabort(){reject(new Error('订阅请求已中止。'));}});
  });}
  function paintSubscription(){
    const checked=subscriptionLoaded&&subscriptionFor===targets.author&&Boolean(subscription?.enabled);
    subscriptionLabel.textContent=!targets.author?'未识别博主':subscriptionBusy?'核对中…':subscriptionLoaded?checked?'追更已开启':'未订阅':'待核对';
    subscriptionLabel.classList.toggle('active',checked);
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
    const link=targets.author,selectedFrequency=frequency.value;
    if(!subscriptionLoaded||subscriptionFor!==link){subscriptionFor='';await loadSubscription();if(!subscriptionLoaded||targets.author!==link)return;}
    const turnOff=Boolean(subscription?.enabled)&&!changeFrequency,generation=subscriptionGeneration;subscriptionBusy=true;paintSubscription();
    if(!turnOff)frequency.value=selectedFrequency;
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
    const server = GM_getValue('library_server', '');
    try { normalizeServer(server); } catch { status.textContent = '网站地址无效，请重新配置。'; return; }
    const recentKey = JSON.stringify([server, link]);
    if (recent.has(recentKey)) { status.textContent = '这个页面的对象已发送，请到网站查看任务。'; return; }
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
          recent.add(recentKey); if (GM_getValue('library_server', '') === server) status.textContent = targets[kind] === link ? `网站已收到任务 #${data.id}。下载进度请到网站查看。` : '';
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
