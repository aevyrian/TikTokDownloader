// Run against a live manager: node tests/extension-integration.cjs URL TOKEN_FILE
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
vm.runInThisContext(fs.readFileSync(require('node:path').join(__dirname,'../extension/client.js'),'utf8'));
(async()=>{
  const client=globalThis.DouyinClient, server=process.argv[2], token=fs.readFileSync(process.argv[3],'utf8').trim();
  assert(client.supported('https://www.douyin.com/video/7123456789012345678'));
  assert(!client.supported('https://www.douyin.com.evil.test/'));
  assert.throws(()=>client.server('http://user:password@localhost:8787'));
  const status=await client.request(server,token,'/status');assert(status.parser);
  const submitted=await client.request(server,token,'/tasks',{text:'https://www.douyin.com/video/7123456789012345678'});
  assert.equal(submitted.items.length,1);
  const repeat=await client.request(server,token,'/tasks',{text:'https://www.douyin.com/video/7123456789012345678'});
  assert(repeat.items[0].duplicate);
  await assert.rejects(client.request(server,'invalid','/status'));
  console.log('PASS: extension shared client -> live backend; auth, submit, duplicate, URL checks');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
