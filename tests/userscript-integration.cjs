// Production userscript helpers + a GM transport adapter; optional live-backend round trip.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {Backend,serverURL,mediaID,collectLinks,currentLink}=require('../userscript/douyin-download-manager.user.js');
const ID='7696820220854052965', URL='https://www.douyin.com/video/'+ID;
async function main(){
  assert.equal(mediaID(URL),ID);
  assert.equal(mediaID('https://www.douyin.com/jingxuan?modal_id='+ID),ID);
  assert.equal(mediaID('https://www.douyin.com/search/x?aweme_id='+ID),ID);
  assert.equal(mediaID('https://www.douyin.com.evil.test/video/'+ID),'');
  assert.throws(()=>serverURL('http://user:password@localhost:8787'));
  const doc={querySelectorAll:()=>[{href:URL},{href:URL},{href:'https://evil.test/video/'+ID}]};
  assert.deepEqual(collectLinks(doc),[URL]);
  assert.equal(currentLink(new globalThis.URL(URL),doc),URL);
  assert.equal(currentLink(new globalThis.URL('https://www.douyin.com/user/test'),{querySelectorAll:()=>[]}), 'https://www.douyin.com/user/test');
  global.GM_xmlhttpRequest=options=>{
    assert(options.anonymous);
    assert.equal(options.headers.Authorization,'Bearer test-token-at-least-16');
    options.onload({status:200,responseText:JSON.stringify({ok:true})});
  };
  assert((await new Backend('http://localhost:8787','test-token-at-least-16').request('/status')).ok);
  global.GM_xmlhttpRequest=options=>options.onload({status:401,responseText:'{"detail":"认证失败"}'});
  await assert.rejects(new Backend('http://localhost:8787','test-token-at-least-16').request('/status'),/认证失败/);
  console.log('PASS: userscript URL detection, collection, GM request, authentication errors');
  if(process.argv[2]){
    const server=process.argv[2],token=fs.readFileSync(process.argv[3],'utf8').trim();
    global.GM_xmlhttpRequest=options=>fetch(options.url,{method:options.method,headers:options.headers,body:options.data,signal:AbortSignal.timeout(options.timeout)}).then(async response=>options.onload({status:response.status,responseText:await response.text()})).catch(options.onerror);
    const backend=new Backend(server,token);
    assert((await backend.request('/status')).parser);
    const submitted=await backend.request('/tasks',{text:URL});assert.equal(submitted.items.length,1);
    assert((await backend.request('/tasks',{text:URL})).items[0].duplicate);
    const history=await backend.request('/history/check',{ids:[ID]});assert(history.items[ID]);
    console.log('PASS: production userscript GM client -> live backend submit, deduplication and history');
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
