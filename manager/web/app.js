const $ = id => document.getElementById(id);
const names = {partial:'部分完成',queued:'排队中',running:'下载中',retry_wait:'等待重试',failed:'失败',completed:'已完成',skipped:'已跳过'};
let token = sessionStorage.getItem('douyin-token') || '', page = 1, total = 0, connected = false, busy = false, rendered = "";
$('token').value = token;
function message(text, error=false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
async function api(path, options={}) {
  const response = await fetch('/api'+path, {...options,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json',...options.headers}});
  if (!response.ok) { const data = await response.json(); throw new Error(typeof data.detail==='string' ? data.detail : '参数无效，请检查输入'); }
  return response.json();
}
function element(tag, text, className) { const node=document.createElement(tag); if(text!==undefined)node.textContent=text; if(className)node.className=className; return node; }
async function refresh() {
  if (!connected || busy) return;
  busy = true;
  try {
    const [data,status] = await Promise.all([api(`/tasks?page=${page}&state=${encodeURIComponent($('filter').value)}`),api('/status')]);
    const signature=JSON.stringify([data,status.counts]); if(signature===rendered)return; rendered=signature;
    total=data.total; $('tasks').replaceChildren(); $('stats').replaceChildren();
    for(const [label,number] of [['下载中',status.counts.running||0],['等待处理',(status.counts.queued||0)+(status.counts.retry_wait||0)],['已完成',status.counts.completed||0],['失败',status.counts.failed||0]]) { const box=element('div',undefined,'stat');box.append(element('b',number),element('span',label));$('stats').append(box); }
    if(!data.items.length)$('tasks').append(element('p','这里还没有任务。粘贴一条链接开始保存。'));
    for(const task of data.items){
      const row=element('article',undefined,'task'), info=element('div',undefined,'info');
      info.append(element('div',task.title || task.url,'task-title'),element('small',`#${task.id} · 尝试 ${task.attempts} 次 · ${new Date(task.created*1000).toLocaleString()}`));
      if(task.state==='running'){const meter=element('progress');meter.max=task.total||1; if(task.total)meter.value=task.progress;info.append(meter,element('small',`${(task.progress/1048576).toFixed(1)} MB`));}
      if(task.error)info.append(element('small',task.error,'error'));
      const actions=element('div',undefined,'task-actions');
      if(['failed','retry_wait','partial'].includes(task.state)){const retry=element('button','重试');retry.onclick=async()=>{try{await api(`/tasks/${task.id}/retry`,{method:'POST'});await refresh();}catch(e){message(e.message,true);}};actions.append(retry);}
      task.files.forEach((file,index)=>{const b=element('button',`保存文件 ${index+1}`);b.onclick=async()=>{try{const response=await fetch(`/api/files/${task.id}/${index}`,{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw new Error('文件不存在或连接失败');const blob=await response.blob(),url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download=file.split(/[\\/]/).pop();a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){message(e.message,true);}};actions.append(b);});
      info.append(actions);row.append(info,element('span',names[task.state]||task.state,'pill'));$('tasks').append(row);
    }
    $('page').textContent=`第 ${page} 页 · 共 ${total} 条`;$('previous').disabled=page===1;$('next').disabled=page*20>=total;$('connection').textContent='后台已连接';
  } catch(e) { message(e.message,true);$('connection').textContent='连接异常'; } finally {busy=false;}
}
$('connect').onclick=async()=>{ token=$('token').value.trim();try{await api('/status');sessionStorage.setItem('douyin-token',token);connected=true;const c=await api('/settings');$('workers').value=c.workers;$('retries').value=c.retries;$('max-pages').value=c.max_pages;$('category').value=c.category;$('cookie-state').textContent=c.has_cookie?'已保存 Cookie；留空保留。':'未设置 Cookie，部分作品可能无法解析。';message('连接成功');await refresh();}catch(e){connected=false;message(e.message,true);} };
$('submit').onclick=async()=>{if(!connected)return message('请先连接后台',true);$('submit').disabled=true;try{const data=await api('/tasks',{method:'POST',body:JSON.stringify({text:$('links').value})});message(`已处理 ${data.items.length} 条，其中 ${data.items.filter(i=>i.duplicate).length} 条已存在。`);$('links').value='';page=1;await refresh();}catch(e){message(e.message,true);}finally{$('submit').disabled=false;}};
$('filter').onchange=()=>{page=1;refresh();};$('previous').onclick=()=>{if(page>1){page--;refresh();}};$('next').onclick=()=>{if(page*20<total){page++;refresh();}};
$('settings').onsubmit=async event=>{event.preventDefault();const body={workers:Number($('workers').value),retries:Number($('retries').value),max_pages:Number($('max-pages').value),category:$('category').value};if($('clear-cookie').checked)body.cookie='';else if($('cookie').value)body.cookie=$('cookie').value;try{const result=await api('/settings',{method:'PUT',body:JSON.stringify(body)});$('cookie').value='';$('clear-cookie').checked=false;message(result.message);}catch(e){message(e.message,true);}};
$('import').onclick=async()=>{try{const result=await api('/history/import',{method:'POST'});message(`导入 ${result.imported} 条历史记录`);}catch(e){message(e.message,true);}};
setInterval(refresh,2000);if(token)$('connect').click();
