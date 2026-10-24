import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
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
console.log('PASS: 作品/作者识别、精确 ID、恶意地址拒绝、媒体凭据边界、视图暂停、图集边界');
