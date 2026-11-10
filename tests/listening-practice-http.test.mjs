import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,access,writeFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {startStudyServer} from '../src/server.mjs';
test('真实HTTP首次/订正/新轮与草稿绑定，旧标签不串写，私有源码不公开，重开保留',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ielts-practice-http-'));let s=await startStudyServer({port:0,directory});
 try{
  const read=async endpoint=>(await (await fetch(s.url+endpoint)).json());const v=await read('/api/listening/practice');assert.ok(v.materials);
  const m=(await read('/data/listening-materials.json'))[0],round=v.materials[m.id].currentRoundId;
  const headers={origin:s.url,'content-type':'application/json','x-data-store-id':v.storeId,'x-practice-round-id':round};
  const post=(endpoint,body,h=headers)=>fetch(s.url+endpoint,{method:'POST',headers:h,body:JSON.stringify(body)});
  assert.equal((await post('/api/listening/drafts/operations',{operationId:'d1',materialId:m.id,version:m.version,expectedRevision:0,answers:{'word:1':'1'},context:{voiceId:m.voices[0].id,position:0}})).status,200);
  const first={type:'first',operationId:'f1',materialId:m.id,roundId:round,expectedRevision:0,expectedDraftRevision:1};
  assert.equal((await post('/api/listening/practice/operations',first,{...headers,'x-data-store-id':'wrong'})).status,409);
  assert.equal((await post('/api/listening/practice/operations',first)).status,200);assert.equal((await post('/api/listening/practice/operations',first)).status,200);
  const result=await read('/api/listening/practice');assert.equal(result.materials[m.id].rounds[0].first.result.percentage,100);
  const fresh={...first,type:'newRound',operationId:'n1',expectedRevision:1};assert.equal((await post('/api/listening/practice/operations',fresh)).status,200);
  const next=(await read('/api/listening/drafts')).drafts[m.id];assert.notEqual(next.roundId,round);assert.equal(next.answers['word:1'],'');
  const old=await post('/api/listening/drafts/operations',{operationId:'late',materialId:m.id,version:m.version,expectedRevision:1,answers:{'word:1':'9'},context:{voiceId:m.voices[0].id,position:0}});assert.equal(old.status,409);
  for(const url of ['/src/listening/practice-store.mjs','/src/listening/check.mjs','/listening-practice.jsonl'])assert.equal((await fetch(s.url+url)).status,404);
  assert.equal((await read('/api/listening/practice/export')).events.length,2);
  await s.close();s=await startStudyServer({port:0,directory});assert.equal((await read('/api/listening/practice')).materials[m.id].rounds[0].first.answers['word:1'],'1');
 }finally{await s.close();}
});

test('练习坏尾行导致启动失败会释放占用且保全文件，不改旧草稿',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ielts-practice-startup-'));const file=path.join(directory,'listening-practice.jsonl');await writeFile(file,'broken-tail');
 await assert.rejects(startStudyServer({port:0,directory}),/练习读取失败/);assert.equal(await readFile(file,'utf8'),'broken-tail');await assert.rejects(access(path.join(directory,'writer.lock')));
});
