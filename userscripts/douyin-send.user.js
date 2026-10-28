// ==UserScript==
// @name         Cloudrift Sender
// @name:zh      抖音收藏库助手
// @name:zh-CN   抖音收藏库助手
// @namespace    douyin-local-library
// @version      1.8.6
// @description  识别当前作品与博主，查看更新状态，按需下载并设置追更周期。
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
      if (modal && /^\d{19}$/.test(modal)) { result.detail = `https://www.douyin.com/video/${modal}`; break; }
      if (match) { result.detail = `https://www.douyin.com/${match[1]}/${match[2]}`; break; }
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
      || scope?.querySelector('[data-e2e="user-info"] a[href*="/user/"]');
    const card = standalone ? null : scope?.matches('[data-e2e-vid], [data-e2e-aweme-id]') ? scope : scope?.querySelector('[data-e2e-vid], [data-e2e-aweme-id]');
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

  function node(tag, className, text) {
    const value = document.createElement(tag); if (className) value.className = className;
    if (text !== undefined) value.textContent = text; return value;
  }
  const host = node('div'); host.id = 'douyin-library-sender'; host.hidden = true;
  host.style.cssText = 'position:fixed;width:44px;height:44px;z-index:2147483647';
  const shadow = host.attachShadow({mode:'closed'}), style = node('style');
  style.textContent = `
:host{font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#eeeef3;color-scheme:dark}*{box-sizing:border-box}[hidden],.settings-open .downloads{display:none!important}
section{position:fixed;width:304px;padding:17px;background:#24252bf7;border:1px solid #ffffff20;border-radius:15px;box-shadow:0 14px 44px #0005;max-height:calc(100dvh - 24px);overflow:auto;scrollbar-width:thin}
header,.identity,.status-heading,.status-times,.quick-actions,.footer{display:flex;align-items:center;gap:8px}header{justify-content:space-between;margin-bottom:13px}header strong{font-size:14px}header small{font-size:10px;color:#afb0bb;margin-left:8px}
button,input,select{font:inherit;color:inherit}button,a,input,select,summary{outline-offset:3px}button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid #ff8ba5}button{cursor:pointer;border:1px solid #ffffff1c;border-radius:9px;background:#ffffff06;padding:9px 11px;text-align:center}button:hover{background:#ffffff10}button:disabled{cursor:default;opacity:.48}
.close{width:28px;height:28px;padding:0;font-size:22px;line-height:1;border:0;background:transparent;color:#b9bac5}.toggle{display:grid;place-items:center;width:44px;height:44px;padding:0;border-radius:12px;color:#fff;background:#00000047;border-color:#ffffff30;box-shadow:none}.toggle:hover{background:#0006;border-color:#ffffff4d}.toggle[aria-expanded=true]{color:#fff;background:#00000073;border-color:#ffffff66}.toggle svg{pointer-events:none}
.identity{margin-bottom:12px;min-width:0}.creator{font-size:14px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.context-label{flex:none;font-size:10px;color:#aaaab6}.creator-status{padding:12px;border:1px solid #ffffff1d;border-radius:10px;background:#ffffff04;margin-bottom:12px;transition:background .15s,border-color .15s}.creator-status[data-state=submitted]{background:#ff507716;border-color:#ff78976b}.status-heading{justify-content:space-between;margin-bottom:9px}.subscription-state{font-weight:600;font-size:12px}.subscription-state:before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:7px;background:#9699ad}.creator-status[data-enabled=true] .subscription-state:before{background:#ff8ba5}.refresh-state{padding:0;background:transparent;border:0;font-size:10px;color:#c5c6d1}
.status-times{align-items:start;gap:10px}.status-times>div{flex:1;min-width:0}.status-times small{display:block;font-size:10px;color:#a8a9b5}.last-success,.next-check{display:block;font-size:11px;margin-top:2px;overflow-wrap:anywhere}.state-note{margin:8px 0 0;font-size:10px;color:#c2c3ce;overflow-wrap:anywhere}
.actions{display:grid;gap:8px}.actions>button{width:100%;min-height:39px}.quick-actions>*{flex:1;min-width:0}.quick-actions button,.quick-actions a{font-size:11px;min-height:37px}.primary{background:#ff507710;border-color:#ff789749;font-weight:600}.primary:hover{background:#ff50771c}a{color:#d4d5df;text-decoration:none}.archive-link{display:flex;align-items:center;justify-content:center;border:1px solid #ffffff1c;border-radius:9px;padding:8px}
.plan{display:grid;gap:7px;margin-top:13px}.plan label{font-size:11px;color:#c2c3ce}input,select{display:block;width:100%;min-width:0;background:#ffffff05;border:1px solid #ffffff24;border-radius:8px;padding:8px 9px;outline-color:#ff8ba5}select option{background:#272830}.submit-plan{width:100%;min-height:40px;border-color:#ff789749;background:#ff50770b}.actions button[data-state=submitted],.submit-plan[data-state=submitted]{background:#a73754;border-color:#d85b7b;color:white;font-weight:600;opacity:1}.actions button[data-state=submitting],.submit-plan[data-state=submitting]{background:#663142;border-color:#ad5b72;opacity:1}.hint{font-size:10px;line-height:1.6;color:#aeb0bd;margin:0}
.status{font-size:11px;color:#e1e1ea;overflow-wrap:anywhere;margin:11px 0 0}.status:empty{display:none}.status.error{color:#ffabbf}details{margin-top:13px;padding-top:11px;border-top:1px solid #ffffff14}summary{display:flex;justify-content:space-between;align-items:center;min-height:27px;color:#c4c5cf;cursor:pointer;list-style:none;font-size:11px}summary:after{content:"›";font-size:18px}details[open] summary:after{transform:rotate(90deg)}summary::-webkit-details-marker{display:none}form label{display:block;margin:10px 0;color:#bfc0cd;font-size:11px}form input,form select{margin-top:5px}form button{width:100%;margin-top:3px}.footer{justify-content:space-between;margin-top:10px;color:#9698a6;font-size:9px;letter-spacing:.3px}
@media(prefers-reduced-motion:reduce){.creator-status{transition:none}}
  `;
  const panel=node('section');panel.hidden=true;panel.setAttribute('aria-label','抖音收藏库下载面板');
  const toggle=node('button','toggle');toggle.title='抖音收藏库 · 下载到媒体库';
  toggle.innerHTML='<svg viewBox="0 0 28 28" width="26" height="26" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 19.5H7a4.5 4.5 0 0 1-.6-8.96 6.5 6.5 0 0 1 12.4-2.7A5 5 0 0 1 20 17.7h-.9" stroke="currentColor" stroke-width="2.3"/><path d="M14 12.5v11m-4-4 4 4 4-4" stroke="#111" stroke-opacity=".6" stroke-width="4.8"/><path d="M14 12.5v11m-4-4 4 4 4-4" stroke="currentColor" stroke-width="2.7"/></svg>';
  toggle.setAttribute('aria-label','打开媒体库发送菜单');toggle.setAttribute('aria-expanded','false');
  const header=node('header'), brand=node('div'), title=node('strong','','抖音收藏库'), subtitle=node('small','','下载与归档'),close=node('button','close','×');
  close.setAttribute('aria-label','收起下载面板');brand.append(title,subtitle);header.append(brand,close);
  const creator=node('strong','creator','正在识别博主'),contextLabel=node('span','context-label','· 当前作品'),identity=node('div','identity');identity.append(creator,contextLabel);
  const card=node('div','creator-status'),heading=node('div','status-heading'),subscriptionLabel=node('span','subscription-state','待核对'),refresh=node('button','refresh-state','刷新 ↻');
  heading.append(subscriptionLabel,refresh);
  const times=node('div','status-times'),lastColumn=node('div'),nextColumn=node('div'),lastSuccess=node('span','last-success','暂无记录'),nextCheck=node('span','next-check','未设计划');
  lastColumn.append(node('small','','最近成功更新'),lastSuccess);nextColumn.append(node('small','','下次计划更新'),nextCheck);times.append(lastColumn,nextColumn);
  const stateNote=node('p','state-note','已有内容自动跳过。');card.append(heading,times,stateNote);
  const detailButton=node('button','primary','下载当前作品'),authorButton=node('button','','下载全部作品'),libraryLink=node('a','archive-link','查看归档 ↗');libraryLink.target='_blank';libraryLink.rel='noopener noreferrer';
  const actions=node('div','actions'),quick=node('div','quick-actions');quick.append(authorButton,libraryLink);actions.append(detailButton,quick);
  const frequency=node('select');frequency.setAttribute('aria-label','博主更新周期');
  const labels={once:'仅下载一次',three_days:'每3天更新',weekly:'每7天更新',monthly:'每月更新',quarterly:'每季度更新',yearly:'每年更新'};
  for(const [value,text] of Object.entries(labels)){const option=node('option','',text);option.value=value;frequency.append(option);}frequency.value='once';
  const plan=node('div','plan'),submit=node('button','submit-plan','下载博主一次');plan.append(node('label','','订阅更新频率'),frequency,submit,node('p','hint','自动更新在北京时间 08:00–18:00 错峰开始；已开始的下载会继续完成。'));
  const downloads=node('div','downloads');downloads.append(identity,card,actions,plan);
  const status=node('p','status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const settings=node('details'),summary=node('summary','','连接与下载设置'),form=node('form');
  const serverInput=node('input');serverInput.type='url';serverInput.required=true;serverInput.placeholder='http://NAS地址:8090';serverInput.value=GM_getValue('library_server','');
  const tokenInput=node('input');tokenInput.type='password';tokenInput.autocomplete='new-password';tokenInput.placeholder='留空保留原密钥';
  const preference=node('select');for(const [value,text] of [['detail','突出当前作品'],['author','突出博主更新']]){const option=node('option','',text);option.value=value;preference.append(option);}preference.value=defaultKind(GM_getValue('library_default_kind','author'));
  function field(text,control){const label=node('label','',text);label.append(control);form.append(label);}
  field('网站地址',serverInput);field('管理员密钥',tokenInput);field('默认下载操作',preference);const save=node('button','','保存设置');save.type='submit';form.append(save);settings.append(summary,form);
  const footer=node('div','footer');footer.append(node('small','','助手 1.8.6'),node('span','','下载后在媒体库查看进度'));
  panel.append(header,downloads,status,settings,footer);shadow.append(style,panel,toggle);document.body.append(host);
  let targets={detail:null,author:null},anchor=null,authors=null,history=null,loading=null,generation=0,dataRevision=0,viewRevision=0,busy=false,frequencyDirty=false,settingsOverride=false,currentName='',stateAttempted=false;
  const recent=new Set(),feedback=new Map();
  const server=()=>GM_getValue('library_server','');
  const configured=()=>Boolean(server()&&GM_getValue('library_token',''));
  const contextKey=()=>JSON.stringify([server(),targets.author,targets.detail]);
  const actionKey=(action,link,period='')=>JSON.stringify([server(),action,link,period]);
  function message(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
  function request(method,path,body,connection){return new Promise((resolve,reject)=>{
    let origin;try{origin=normalizeServer(connection?.server??server());}catch{reject(new Error('请先配置网站地址。'));return;}
    GM_xmlhttpRequest({method,url:origin+path,timeout:method==='GET'?15000:20000,headers:{'Content-Type':'application/json',Authorization:`Bearer ${connection?.token??GM_getValue('library_token','')}`},...(body===undefined?{}:{data:JSON.stringify(body)}),
      onload(response){let value;try{value=JSON.parse(response.responseText);}catch{reject(new Error('网站返回异常，请检查连接。'));return;}if(response.status>=200&&response.status<300)resolve(value);else reject(new Error(typeof value.detail==='string'?value.detail:`请求失败（${response.status}）`));},
      onerror(){reject(new Error('网站不可达，请检查 NAS 连接。'));},ontimeout(){reject(new Error('网站响应超时，请先查看任务后重试。'));},onabort(){reject(new Error('请求已中止，可以重新尝试。'));}});
  });}
  function authorState(){return authors?subscriptionState(authors,targets.author):null;}
  function formatTime(value){const date=new Date(typeof value==='number'?value*1000:value);return value&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date):'暂无记录';}
  function paint(){
    const found=authorState(),author=found?.author;
    if(!frequencyDirty)frequency.value=author?author.enabled?found.frequency:'once':'once';
    subscriptionLabel.textContent=!configured()?'未连接':loading?'核对中…':!authors?'待核对':author?.enabled?`已订阅 · ${labels[found.frequency]}`:'未订阅';
    card.dataset.enabled=String(Boolean(author?.enabled));
    const tasks=targets.author?(history||[]).filter(t=>t.kind==='author'&&(t.author_id&&t.author_id===author?.id||t.link&&resolveTargets(t.link).author===targets.author)):[];
    const success=tasks.filter(t=>t.status==='completed').sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at))[0];
    lastSuccess.textContent=success?formatTime(success.updated_at):'暂无记录';
    nextCheck.textContent=author?.enabled?(author.next_check?formatTime(author.next_check):'等待安排'):author?'不自动更新':'未设计划';
    const active=tasks.find(t=>['queued','parsing','downloading','awaiting_confirmation'].includes(t.status));
    stateNote.textContent=active?(active.status==='downloading'?'博主作品正在下载。':'更新任务已在队列中。'):author?.last_error?'上次检查未完成，可重新提交。':author?.enabled?'按当前订阅检查新作品；已有内容自动跳过。':'首次下载会检查历史作品；已有内容自动跳过。';
    const buttons=[[detailButton,'detail',targets.detail,'下载当前作品'],[authorButton,'author',targets.author,author?.enabled?'更新当前订阅':'下载全部作品'],[submit,'plan',targets.author,frequency.value==='once'?'下载博主一次':'下载博主并订阅']];
    for(const [button,action,link,label] of buttons){const key=actionKey(action,link,action==='plan'?frequency.value:'');const state=feedback.get(key)||'';button.dataset.state=state;button.textContent=state==='submitted'?'已提交':state==='submitting'?'提交中…':label;button.disabled=busy||!link||state==='submitted';}
    card.dataset.state=buttons.some(([button])=>button.dataset.state==='submitted')?'submitted':'';
    frequency.disabled=busy||!targets.author;refresh.disabled=Boolean(loading)||busy||!targets.author;
    const preferred=defaultKind(GM_getValue('library_default_kind','author'));detailButton.classList.toggle('primary',preferred==='detail');authorButton.classList.toggle('primary',preferred==='author');
    try{libraryLink.href=normalizeServer(server())+'/#tasks';}catch{libraryLink.href='#';}
  }
  function clearState(){generation++;dataRevision++;authors=history=null;loading=null;frequencyDirty=false;stateAttempted=false;recent.clear();feedback.clear();}
  function loadState(force=false){
    if(panel.hidden||settings.open||!targets.author||!configured()){paint();return Promise.resolve();}
    if(!force&&authors&&history){paint();return Promise.resolve();}if(loading&&!force)return loading;
    if(!force&&stateAttempted){paint();return Promise.resolve();}stateAttempted=true;
    const revision=generation,dataVersion=++dataRevision;
    const job=Promise.all([request('GET','/api/authors'),request('GET','/api/tasks')]).then(([a,t])=>{if(!Array.isArray(a)||!Array.isArray(t))throw new Error('网站状态格式异常');if(revision===generation&&dataVersion===dataRevision){authors=a;history=t;paint();}}).catch(error=>{if(revision===generation&&dataVersion===dataRevision)message(error.message,true);throw error;}).finally(()=>{if(loading===job){loading=null;paint();}});
    loading=job;paint();return job;
  }
  function position(){const p=senderPosition(anchor,{width:innerWidth,height:innerHeight},panel.hidden?0:panel.offsetHeight);host.style.left=p.left+'px';host.style.top=p.top+'px';panel.style.left=p.panelLeft+'px';panel.style.top=p.panelTop+'px';panel.style.width=p.panelWidth+'px';}
  function visible(element){if(!element)return false;const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.left+r.width>0&&r.left<innerWidth;}
  function detect(){
    const page=resolveTargets(location.href),profile=!page.detail&&/^\/user\/[A-Za-z0-9_-]{6,128}\/?$/.test(location.pathname);
    const details=[...document.querySelectorAll('[data-e2e="video-detail"], [data-e2e="note-detail"]')].filter(visible);
    const dialog=[...document.querySelectorAll('[role="dialog"]')].reverse().find(d=>visible(d)&&d.querySelector('[data-e2e="video-detail"], [data-e2e="note-detail"]'));
    const feed=!profile&&[...document.querySelectorAll('[data-e2e="feed-active-video"]')].find(element=>{
      if(!visible(element))return false;
      const card=element.matches('[data-e2e-vid], [data-e2e-aweme-id]')?element:element.querySelector('[data-e2e-vid], [data-e2e-aweme-id]');
      return /^\d{19}$/.test(card?.getAttribute('data-e2e-vid')||card?.getAttribute('data-e2e-aweme-id')||'');
    });
    const allowed=Boolean(profile||page.detail||feed);
    const modal=new URL(location.href).searchParams.get('modal_id');
    let scope=profile?null:page.detail?(modal?(dialog?.querySelector('[data-e2e="video-detail"], [data-e2e="note-detail"]')||details[details.length-1]):details[0]):feed;
    if(page.detail){const id=page.detail.split('/').pop(),item=document.querySelector(`[data-e2e-vid="${id}"], [data-e2e-aweme-id="${id}"]`);if(visible(item))scope=item.closest('[data-e2e="video-detail"], [data-e2e="note-detail"], [data-e2e="feed-active-video"]')||item;}
    if(!scope&&!profile)scope=feed;
    const current=allowed?pageTargets(scope,location.href):{author:null,targets:{detail:null,author:null}};
    if(profile)current.targets.author=page.author;
    const changed=targets.detail!==current.targets.detail||targets.author!==current.targets.author;
    targets=current.targets;host.hidden=!settingsOverride&&(!allowed||!targets.detail&&!targets.author);
    if(host.hidden&&!panel.hidden)togglePanel(panel,toggle);
    if(changed){viewRevision++;frequencyDirty=false;message('');}
    const named=[...(scope?.querySelectorAll('[data-e2e="user-info"] a[href*="/user/"]')||[])].find(a=>resolveTargets(a.href).author===targets.author&&a.textContent.trim());
    currentName=(profile?document.querySelector('h1')?.textContent:'')||named?.textContent||scope?.querySelector('[data-e2e="feed-video-nickname"]')?.textContent||current.author?.textContent||'';
    creator.textContent=currentName.trim()||'正在识别博主';contextLabel.textContent=profile?'· 博主页':'· 当前作品';
    const rail=[...(scope?.querySelectorAll('[data-e2e="video-avatar"]')||[]),...(scope?.querySelectorAll('[data-e2e="user-info"] a[href*="/user/"]')||[])].find(el=>visible(el)&&(!targets.author||!el.href||resolveTargets(el.href).author===targets.author));
    if(profile||!allowed)anchor=null;else if(rail)anchor=rail.getBoundingClientRect();
    for(let n=rail?.parentElement;n&&scope.contains(n);n=n.parentElement){const r=n.getBoundingClientRect();if(r.width>140)break;if(anchor&&visible(n)&&n.querySelector('[data-e2e="video-player-digg"]'))anchor={left:anchor.left,width:anchor.width,top:r.top};}
    if(scope!==observedScope){layoutObserver.disconnect();if(scope)layoutObserver.observe(scope);observedScope=scope;}
    paint();position();if(!panel.hidden&&!settings.open)loadState().catch(()=>{});
  }
  function configure(){settingsOverride=true;host.hidden=false;if(panel.hidden)togglePanel(panel,toggle);settings.open=true;position();serverInput.focus();}
  async function run(action){
    detect();const link=action==='detail'?targets.detail:targets.author;if(!link||busy)return;
    if(!configured()){configure();message('请先配置网站，再提交下载。',true);return;}
    const period=frequency.value,key=actionKey(action,link,action==='plan'?period:''),view=contextKey(),name=currentName,session=generation,viewVersion=viewRevision;
    const sameView=()=>view===contextKey()&&session===generation&&viewVersion===viewRevision;
    const connection={server:server(),token:GM_getValue('library_token','')},call=(method,path,body)=>request(method,path,body,connection);
    if(recent.has(key)){feedback.set(key,'submitted');paint();return;}
    busy=true;feedback.set(key,'submitting');message('正在提交…');paint();let periodSaved=false;
    try{
      let task;
      if(action!=='detail'&&(!authors||!history)){await loadState(!loading);if(!sameView())return;}
      if(action!=='detail')dataRevision++;
      if(action==='plan'){
        const author=authorState()?.author;
        const saved=author?.id?await call('PATCH',`/api/authors/${encodeURIComponent(author.id)}`,{frequency:period}):await call('POST','/api/authors',{url:link,name:name.replace(/^@+/,'').trim().slice(0,100),frequency:period});
        if(!saved?.id)throw new Error('网站未返回博主记录，请刷新后重试。');periodSaved=true;
        if(sameView()&&authors)authors=[...authors.filter(a=>a.id!==saved.id),saved];
        task=await call('POST',`/api/authors/${encodeURIComponent(saved.id)}/check`);
      }else if(action==='author'&&authorState()?.author?.id){task=await call('POST',`/api/authors/${encodeURIComponent(authorState().author.id)}/check`);}
      else task=await call('POST','/api/tasks',{link,kind:action==='detail'?'detail':'author'});
      if(task?.id===undefined)throw new Error('网站未返回任务，请先查看归档再重试。');
      if(sameView()){recent.add(key);feedback.set(key,'submitted');history=[{...task,kind:action==='detail'?'detail':'author',link},...(history||[])];message(`已提交 ${action==='detail'?'当前作品':name||'当前博主'}，后台会继续处理。`);}
      if(sameView()&&action!=='detail'&&(action==='plan'||authorState()?.author?.id)){
        const revision=generation,dataVersion=++dataRevision;call('GET','/api/authors').then(values=>{if(revision===generation&&dataVersion===dataRevision&&Array.isArray(values)){authors=values;paint();}}).catch(()=>{});
      }
    }catch(error){feedback.delete(key);if(sameView())message((periodSaved?'更新方式已保存，但下载任务未提交。':'')+error.message,true);}
    finally{busy=false;if(feedback.get(key)==='submitting')feedback.delete(key);paint();}
  }
  toggle.addEventListener('click',()=>{settingsOverride=false;settings.open=false;togglePanel(panel,toggle);if(!panel.hidden){clearState();}detect();});
  close.addEventListener('click',()=>{settingsOverride=false;togglePanel(panel,toggle);toggle.focus();detect();});
  detailButton.addEventListener('click',()=>run('detail'));authorButton.addEventListener('click',()=>run('author'));submit.addEventListener('click',()=>run('plan'));
  frequency.addEventListener('change',()=>{frequencyDirty=true;paint();});
  refresh.addEventListener('click',()=>{recent.clear();feedback.clear();message('');loadState(true).catch(()=>{});});
  libraryLink.addEventListener('click',event=>{if(!configured()){event.preventDefault();configure();}});
  form.addEventListener('submit',event=>{event.preventDefault();let value;try{value=normalizeServer(serverInput.value);}catch(error){message(error.message,true);return;}const token=tokenInput.value.trim()||GM_getValue('library_token','');if(!token){message('请填写管理员密钥。',true);return;}GM_setValue('library_server',value);GM_setValue('library_token',token);GM_setValue('library_default_kind',defaultKind(preference.value));tokenInput.value='';settingsOverride=false;settings.open=false;clearState();message('设置已保存。');detect();});
  settings.addEventListener('toggle',()=>{panel.classList.toggle('settings-open',settings.open);title.textContent=settings.open?'连接与下载设置':'抖音收藏库';summary.textContent=settings.open?'‹ 返回下载':'连接与下载设置';position();});
  host.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){settingsOverride=false;togglePanel(panel,toggle);toggle.focus();detect();}});
  document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!host.contains(event.target)){settingsOverride=false;togglePanel(panel,toggle);}});
  let frame=0;function scheduleDetect(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;detect();});}
  let observedScope=null;const layoutObserver=new ResizeObserver(scheduleDetect);
  const relevant='[data-e2e="video-detail"],[data-e2e="note-detail"],[data-e2e="feed-active-video"],[data-e2e="user-info"],[data-e2e="video-avatar"],[data-e2e="feed-video-nickname"],[data-e2e-vid],[data-e2e-aweme-id],[role="dialog"],a[href*="/user/"],h1';
  new MutationObserver(records=>{if(records.some(r=>!host.contains(r.target)&&(r.target.matches?.(relevant)||[...(r.addedNodes||[]),...(r.removedNodes||[])].some(n=>n.nodeType===1&&(n.matches(relevant)||n.querySelector(relevant))))))scheduleDetect();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-e2e-vid','data-e2e-aweme-id','href','class','aria-hidden','style']});
  document.addEventListener('click',scheduleDetect,true);document.addEventListener('transitionend',scheduleDetect,true);
  addEventListener('popstate',scheduleDetect);addEventListener('hashchange',scheduleDetect);addEventListener('resize',scheduleDetect);
  globalThis.navigation?.addEventListener('navigatesuccess',scheduleDetect);
  new ResizeObserver(position).observe(panel);GM_registerMenuCommand('抖音收藏库 · 连接与下载设置',configure);setInterval(detect,1500);detect();
})();
