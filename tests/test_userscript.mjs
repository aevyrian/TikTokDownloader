import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const script = new URL('../userscripts/douyin-send.user.js', import.meta.url);
const web = new URL('../app/static/app.js', import.meta.url);
assert.ok(existsSync(script), '发送脚本尚未实现');
const { resolveTargets, normalizeServer, togglePanel, defaultKind, senderPosition, pageTargets, subscriptionState } = require(fileURLToPath(script));
const subscribedURL='https://www.douyin.com/user/MS4wLjABAAAA_subscriber';
for(const [minutes,frequency] of [[4320,'three_days'],[10080,'weekly'],[43200,'monthly'],[129600,'quarterly'],[525600,'yearly']]){const found=subscriptionState([{id:'creator',url:subscribedURL,enabled:true,interval_minutes:minutes}],subscribedURL);assert.equal(found.enabled,true);assert.equal(found.frequency,frequency);}
assert.equal(subscriptionState([{url:subscribedURL,enabled:false}],subscribedURL).enabled,false);
assert.equal(subscriptionState([{url:subscribedURL,enabled:true}],'https://www.douyin.com/user/MS4wLjABAAAA_someone_else').author,null,'切换博主后不能沿用上一个红心');
assert.equal(defaultKind(undefined),'author','首次默认下载博主全部作品');
assert.equal(defaultKind('weekly'),'author','不从旧值启用订阅或不明模式');
assert.equal(defaultKind('detail'),'detail','默认按钮可在设置中改为当前作品');
let placement=senderPosition({left:1200,top:300,width:50},{width:1600,height:900},380);
assert.equal(placement.left,1207,'入口与操作栏中心对齐');
assert.equal(placement.top,252,'入口位于操作栏上方');
assert.ok(placement.panelLeft+placement.panelWidth<placement.left,'面板向左展开');
assert.ok(placement.panelTop>=12 && placement.panelTop+380<=888);
placement=senderPosition({left:18,top:50,width:42},{width:390,height:640},600);
assert.ok(placement.panelLeft>=12 && placement.panelLeft+placement.panelWidth<=378,'窄窗口面板不溢出');
assert.ok(placement.top>=12 && placement.panelTop>=12 && placement.panelTop+600<=628);
placement=senderPosition(null,{width:390,height:640},350);
assert.ok(placement.left>=12 && placement.left+36<=378,'没有操作栏的博主页保留入口');
const panel = { hidden: true }, attributes = {};
const toggle = { setAttribute(name, value) { attributes[name] = value; } };
togglePanel(panel, toggle);
assert.equal(panel.hidden, false, '三点按钮打开发送菜单');
assert.equal(attributes['aria-expanded'], 'true');
togglePanel(panel, toggle);
assert.equal(panel.hidden, true, '再次点击收起菜单');
assert.equal(attributes['aria-expanded'], 'false');
const sample = '7421234567890123456';
const creator = {href:'https://www.douyin.com/user/MS4wLjABAAAA_actual'};
const detailScope = {
  matches: selector => selector === '[data-e2e="video-detail"], [data-e2e="note-detail"]',
  querySelector: selector => selector === '[data-e2e="user-info"] a[href*="/user/"]' ? creator
    : selector === 'a[href*="/user/"]' ? {href:'https://www.douyin.com/user/MS4wLjABAAAA_recommendation'}
    : selector === 'a[href*="/video/"], a[href*="/note/"]' ? {href:'https://www.douyin.com/video/7421234567890123457'}
    : selector === '[data-e2e-vid], [data-e2e-aweme-id]' ? {getAttribute:()=> '7421234567890123457'} : null,
};
assert.deepEqual(pageTargets(detailScope, `https://www.douyin.com/video/${sample}`).targets,
  {detail:`https://www.douyin.com/video/${sample}`,author:creator.href}, '独立作品页识别本人，不能抓到推荐作品或作者');
assert.deepEqual(pageTargets(detailScope, `https://www.douyin.com/note/${sample}`).targets,
  {detail:`https://www.douyin.com/note/${sample}`,author:creator.href}, '独立图集页保留当前图集链接与博主');
assert.deepEqual(pageTargets(null,creator.href).targets,{detail:null,author:creator.href},'博主页没有播放器时也能发送');
assert.deepEqual(resolveTargets(`https://www.douyin.com/video/${sample}`), {
  detail: `https://www.douyin.com/video/${sample}`, author: null,
});
assert.equal(resolveTargets(`https://www.douyin.com/?modal_id=${sample}`).detail, `https://www.douyin.com/video/${sample}`);
assert.equal(resolveTargets('https://www.douyin.com/', `https://www.douyin.com/note/${sample}`).detail, `https://www.douyin.com/note/${sample}`);
assert.equal(resolveTargets('https://www.douyin.com/user/MS4wLjABAAAA_abc123').author, 'https://www.douyin.com/user/MS4wLjABAAAA_abc123');
for (const invalid of ['https://www.douyin.com.evil.test/video/' + sample, 'https://evil.test/video/' + sample, 'https://www.douyin.com/video/123', 'https://www.douyin.com/video/' + sample + '0', 'javascript:alert(1)']) {
  assert.equal(resolveTargets(invalid).detail, null, invalid);
}
assert.equal(resolveTargets('https://www.douyin.com/', null, 'https://evil.test/user/abc123').author, null);
assert.equal(resolveTargets(`https://www.douyin.com/video/${sample}`, 'https://www.douyin.com/video/7421234567890123457').detail, 'https://www.douyin.com/video/7421234567890123457', '当前弹层作品优先于旧地址');
assert.equal(resolveTargets('https://www.douyin.com/jingxuan/search/风景', null, null, '7644073196636392666').detail, 'https://www.douyin.com/video/7644073196636392666', '没有作品链接的图集弹层仍能从当前作品标识发送');
assert.equal(resolveTargets(`https://www.douyin.com/video/${sample}`, null, null, '7644073196636392666').detail, 'https://www.douyin.com/video/7644073196636392666', '当前卡片标识优先于旧页面地址');
assert.equal(resolveTargets('https://www.douyin.com/', null, null, '76440731966363926660').detail, null);
assert.equal(normalizeServer('http://nas.example:8765/'), 'http://nas.example:8765');
assert.throws(() => normalizeServer('https://user:password@example.com/'));
assert.throws(() => normalizeServer('javascript:alert(1)'));
assert.ok(existsSync(web), '网页尚未实现');
const { mediaURL, switchView, moveGallery, isVideoFile, authorInitial, keyError, taskTitle, playVisible, applySound, releasePlayback, preloadVideos } = require(fileURLToPath(web));
const neighbors=[null,{id:'one'},{id:'two'},{id:'far'}].map(video=>({querySelector:()=>video}));
assert.deepEqual(preloadVideos(neighbors,0),[{id:'one'},{id:'two'}],'只预备后两条，远处视频不能持续占用缓冲');
assert.deepEqual(preloadVideos(neighbors,3),[],'末页不越界');
assert.deepEqual(preloadVideos([neighbors[1],neighbors[0],neighbors[2]],0),[{id:'two'}],'图片页不建立视频准备任务');
assert.equal(taskTitle({kind:'author',id:'random-task-id',preview:[{nickname:'真实博主'}]}),'真实博主');
assert.equal(taskTitle({kind:'author',preview:[]}),'正在识别博主');
assert.equal(taskTitle({kind:'detail',preview:[{desc:'作品标题'}]}),'作品标题');
const playing={plays:0,pauses:0,play(){this.plays++;return Promise.resolve()},pause(){this.pauses++}};
await playVisible(playing,true);playVisible(playing,false);
assert.equal(playing.plays,1);assert.equal(playing.pauses,1);assert.equal(playing.preload,'auto');
await playVisible({play:()=>Promise.reject(new Error('浏览器阻止自动播放'))},true);
const preparing={calls:0,pauses:0,preparePlayback(){this.calls++;return Promise.resolve()},pause(){this.pauses++}};
playVisible(preparing,false);assert.equal(preparing.calls,0);
await playVisible(preparing,true);assert.equal(preparing.calls,1);assert.equal(preparing.playbackActive,true);
const live={playbackStreaming:true,playbackReady:true,paused:0,cleared:0,reloaded:0,pause(){this.paused++},getAttribute(){return 'stream'},removeAttribute(name){assert.equal(name,'src');this.cleared++},load(){this.reloaded++}};
playVisible(live,false);assert.equal(live.paused,1);assert.equal(live.cleared,0);assert.equal(live.playbackReady,true,'邻近视频切走保留缓冲，不反复准备');
releasePlayback(live);assert.equal(live.cleared,1);assert.equal(live.reloaded,1);assert.equal(live.playbackReady,false,'远离画面才释放连接');
const videos=[{muted:true},{muted:true}];applySound(videos,false);assert.ok(videos.every(v=>v.muted===false));applySound(videos,true);assert.ok(videos.every(v=>v.muted===true));
const manuallyPaused={userPaused:true,paused:true,plays:0,play(){this.plays++;return Promise.resolve()},pause(){}};playVisible(manuallyPaused,true);assert.equal(manuallyPaused.plays,0,'手动暂停后，切标签返回保持暂停');manuallyPaused.userPaused=false;await playVisible(manuallyPaused,true);assert.equal(manuallyPaused.plays,1,'本人点播放后才继续');
let blocked=false;await playVisible({play:()=>Promise.reject(new Error()),onAutoplayBlocked(){blocked=true}},true);assert.ok(blocked,'浏览器禁止有声自动播放时提示点击，不擅自改回静音');
assert.equal(mediaURL('/api/media/a/0?compatible=true','secret','http://nas:8765'),'http://nas:8765/api/media/a/0?compatible=true&token=secret');
assert.equal(switchView('favorites',[]),'favorites');
assert.equal(keyError('My-admin-key-123', 'My-admin-key-123'), '');
assert.match(keyError('My-admin-key-123', 'different-key'), /不一致/);
for (const invalid of ['short', 'contains space', '中文管理员密钥', 'newline\nkey', 'trailing-newline\n']) assert.ok(keyError(invalid, invalid));
assert.equal(authorInitial('𝓢𝓲𝓵𝓮𝓷𝓽'), '𝓢', '头像不拆开 Unicode 字符');
assert.equal(authorInitial('@山野'), '山');
assert.equal(isVideoFile({ name: 'live_1.mp4', url: '/api/media/work/0' }), true, '实况动态页使用播放器');
assert.equal(isVideoFile({ name: 'live_2.jpeg', url: '/api/media/work/1' }), false, '实况静态页使用图片');
assert.equal(isVideoFile({ name: 'live_3.MOV' }), true);
assert.equal(mediaURL('/api/media/a/0', 'a&b', 'http://nas:8765'), 'http://nas:8765/api/media/a/0?token=a%26b');
assert.throws(() => mediaURL('https://evil.test/api/media/a/0', 'secret', 'http://nas:8765'));
assert.throws(() => mediaURL('/api/settings', 'secret', 'http://nas:8765'));
const a = { pauses: 0, pause() { this.pauses++; } };
const b = { pauses: 0, pause() { this.pauses++; } };
assert.equal(switchView('tasks', [a, b]), 'tasks');
assert.equal(a.pauses, 1);
assert.equal(a.playbackActive,false);
assert.equal(b.pauses, 1);
assert.equal(switchView('unknown', []), 'library');
assert.equal(moveGallery(0, -1, 3), 0);
assert.equal(moveGallery(1, 1, 3), 2);
assert.equal(moveGallery(2, 1, 3), 2);
assert.equal(moveGallery(0, 1, 0), 0);
// Execute the Sender with a small browser stub so request counts and response ordering are observable.
const elements=[];
function element(tag) {
  const listeners={};
  const el={tag,style:{},classList:{toggle(){}},children:[],hidden:false,open:false,textContent:'',value:'',
    append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items},
    setAttribute(){},addEventListener(name,fn){listeners[name]=fn},focus(){},contains(){return false},
    querySelector(){return null},querySelectorAll(){return []},getBoundingClientRect(){return {width:0,height:0}},
    attachShadow(){return element('shadow')},click(){listeners.click?.({})},submit(){listeners.submit?.({preventDefault(){}})}};
  elements.push(el);return el;
}
const requests=[], callbacks={}, storage={library_server:'http://nas.example:8090',library_token:'test-token'};
const page={href:subscribedURL,pathname:new URL(subscribedURL).pathname};
const doc={body:element('body'),createElement:element,querySelector(selector){return selector==='h1'?{textContent:'博主'}:null},querySelectorAll(){return []},addEventListener(){}};
runInNewContext(readFileSync(script,'utf8'),{URL,document:doc,location:page,innerWidth:1200,innerHeight:800,
  GM_getValue(key,fallback){return storage[key]??fallback},
  GM_setValue(key,value){storage[key]=value},GM_registerMenuCommand(){},GM_xmlhttpRequest(request){requests.push(request)},
  ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}},addEventListener(){},
  setInterval(fn){callbacks.detect=fn},setTimeout(){},clearTimeout(){}});
const toggleSender=elements.find(el=>el.title==='Cloudrift · 下载到媒体库');
const subscriptionButton=elements.find(el=>el.className==='subscribe');
const authorB='https://www.douyin.com/user/MS4wLjABAAAA_someone_else';
toggleSender.click();
assert.equal(requests.length,1,'打开面板只请求一次订阅列表');
page.href=authorB;page.pathname=new URL(authorB).pathname;callbacks.detect();
requests[0].onload({status:200,responseText:JSON.stringify([{id:'b',url:authorB,enabled:true}])});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(requests.length,1,'切换博主应复用在途列表请求');
assert.equal(subscriptionButton.textContent,'♥','在途请求完成后立即显示当前博主状态');
page.href=subscribedURL;page.pathname=new URL(subscribedURL).pathname;callbacks.detect();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(requests.length,1,'切换博主复用已加载的列表');
toggleSender.click();toggleSender.click();
assert.equal(requests.length,2,'重新打开面板时刷新订阅列表');
requests[1].onload({status:401,responseText:JSON.stringify({detail:'密钥错误'})});
await new Promise(resolve=>setImmediate(resolve));
assert.ok(elements.some(el=>el.textContent==='密钥错误'),'认证失败保留网站提示');
callbacks.detect();callbacks.detect();
assert.equal(requests.length,2,'认证失败后不能反复自动请求');
subscriptionButton.click();
assert.equal(requests.length,3,'用户点击订阅时可重新尝试');
assert.equal(requests[2].timeout,15000);
page.href=authorB;page.pathname=new URL(authorB).pathname;callbacks.detect();
requests[2].onload({status:200,responseText:JSON.stringify([{id:'b',url:authorB,enabled:true}])});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(requests.length,3,'重试期间切换作者不得替新作者提交订阅');
assert.equal(subscriptionButton.textContent,'♥');
toggleSender.click();toggleSender.click();
assert.equal(requests.length,4);
toggleSender.click();toggleSender.click();
requests[3].onload({status:200,responseText:'[]'});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(requests.length,5,'重新打开面板后忽略旧请求并重新读取');
requests[4].onload({status:200,responseText:JSON.stringify([{id:'b',url:authorB,enabled:true}])});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(subscriptionButton.textContent,'♥','旧响应不能覆盖重新打开后的状态');
elements.find(el=>el.textContent==='下载博主全部作品').click();
assert.equal(requests.length,6);
assert.equal(requests[5].timeout,20000,'慢速提交保留原有等待时间');
requests[5].onload({status:200,responseText:JSON.stringify({id:'123'})});
assert.ok(elements.some(el=>el.textContent==='网站已收到任务 #123。下载进度请到网站查看。'),'收到任务不等于下载完成');
elements.find(el=>el.textContent==='下载博主全部作品').click();
assert.equal(requests.filter(request=>request.url.endsWith('/api/tasks')).length,1,'同一网站仍阻止重复发送');
toggleSender.click();toggleSender.click();
requests.at(-1).onerror();
await new Promise(resolve=>setImmediate(resolve));
const frequency=elements.find(el=>el.tag==='select'&&el.children.some(child=>child.value==='weekly'));
frequency.value='weekly';subscriptionButton.click();
requests.at(-1).onload({status:200,responseText:'[]'});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(JSON.parse(requests.at(-1).data).frequency,'weekly','查询失败后重试应保留用户选择的周期');
frequency.selectedOptions=[{textContent:'每7天更新'}];
requests.at(-1).onload({status:200,responseText:JSON.stringify({id:'b',url:authorB,enabled:true,interval_minutes:10080})});
await new Promise(resolve=>setImmediate(resolve));
const serverInput=elements.find(el=>el.type==='url'), settingsForm=elements.find(el=>el.tag==='form');
const authorButton=elements.find(el=>el.textContent==='下载博主全部作品');
serverInput.value='https://other.example';settingsForm.submit();
authorButton.click();
assert.equal(requests.filter(request=>request.url.endsWith('/api/tasks')).length,2,'切换网站后同一博主仍可发送');
assert.equal(requests.at(-1).url,'https://other.example/api/tasks');
serverInput.value='https://third.example';settingsForm.submit();
const status=elements.find(el=>el.className==='status');
const statusAfterSwitch=status.textContent;
requests.at(-1).onload({status:200,responseText:JSON.stringify({id:'456'})});
assert.equal(status.textContent,statusAfterSwitch,'旧网站的成功回调不能冒充当前网站的任务');
authorButton.click();
assert.equal(requests.filter(request=>request.url.endsWith('/api/tasks')).length,3,'旧网站请求完成后不能拦截新网站');
assert.equal(requests.at(-1).url,'https://third.example/api/tasks');
page.href=subscribedURL;page.pathname=new URL(subscribedURL).pathname;callbacks.detect();
requests.at(-1).onload({status:200,responseText:JSON.stringify({id:'789'})});
assert.equal(status.textContent,'','切换博主后旧任务成功不能显示为当前博主的任务');
console.log('PASS: 作品/作者识别、订阅请求复用与失败重试、媒体凭据边界、视图暂停、图集边界');
