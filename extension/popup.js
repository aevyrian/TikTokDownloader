const $ = id => document.getElementById(id);
const show = message => {$('status').textContent=message;};
const client = globalThis.DouyinClient;
async function init(){const config=await chrome.storage.local.get(['server','token']);$('server').value=config.server||'http://127.0.0.1:8787';$('token').value=config.token||'';}
$('save').onclick=async()=>{
  try{
    const server=client.server($('server').value.trim()),token=$('token').value.trim();
    if(token.length<16)throw new Error('请填写有效访问令牌');
    // Request only the chosen server. The broad optional manifest pattern grants nothing by itself.
    const granted=await chrome.permissions.request({origins:[new URL(server).origin+'/*']});
    if(!granted)throw new Error('未获得后台地址访问权限');
    await client.request(server,token,'/status');
    await chrome.storage.local.set({server,token});show('连接成功，配置已保存');
  }catch(e){show(e.message);}
};
async function send(text){
  try{const config=await chrome.storage.local.get(['server','token']);if(!config.server||!config.token)throw new Error('请先保存连接配置');const data=await client.request(config.server,config.token,'/tasks',{text});show(`处理 ${data.items.length} 条，重复 ${data.items.filter(i=>i.duplicate).length} 条`);}catch(e){show(e.message);}
}
$('current').onclick=async()=>{try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!client.supported(tab.url))throw new Error('当前页面不是抖音页面');await send(tab.url);}catch(e){show(e.message);}};
$('collect').onclick=async()=>{try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!client.supported(tab.url))throw new Error('请在抖音页面收集链接');
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>[...new Set([...document.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>/^https:\/\/(www\.)?douyin\.com\/(video|note)\/\d+/.test(h)))].slice(0,500)});
  const urls=results[0]?.result||[];$('links').value=urls.join('\n');show(`收集 ${urls.length} 条当前已加载的作品链接；检查后点击提交`);
}catch(e){show(e.message);}};
$('send').onclick=()=>send($('links').value);
init().catch(e=>show(e.message));
