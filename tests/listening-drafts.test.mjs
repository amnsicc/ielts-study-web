import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openListeningDrafts} from '../src/listening/drafts-store.mjs';
const materials=[{id:'short',version:'fixed-v1',targets:[{id:'word:1'}],voices:[{id:'us',duration:80}]}];
const operation={operationId:'draft-1',materialId:'short',version:'fixed-v1',expectedRevision:0,answers:{'word:1':'2、7 ? '},context:{voiceId:'us',position:3}};
test('草稿原字符串保留，公开重开和导出可读，旧基准冲突不覆盖且同ID重试幂等',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ielts-drafts-'));
  let store=await openListeningDrafts({directory,materials});
  try{
    await store.apply(operation);await store.apply(operation);
    assert.equal((await store.read()).drafts.short.answers['word:1'],'2、7 ? ');
    assert.equal((await store.read()).revision,1);
    await assert.rejects(store.apply({...operation,operationId:'stale',answers:{'word:1':'99'}}),e=>e.code==='DRAFT_CONFLICT');
    await store.close();store=await openListeningDrafts({directory,materials});
    assert.equal((await store.read()).drafts.short.revision,1);
    assert.equal((await store.export()).events.length,1);
  }finally{await store.close();}
});

test('写前失败原操作可重试，写中失败停止追加并保留尾行，坏记录拒绝重开',async()=>{
  for(const partial of [false,true]){
    const directory=await mkdtemp(path.join(os.tmpdir(),'ielts-draft-failure-'));
    let reject=true;
    const store=await openListeningDrafts({directory,materials,append:async(h,text)=>{if(reject){if(partial)await h.writeFile(text.slice(0,12));throw new Error('injected-write');}await h.writeFile(text);await h.sync();}});
    try{
      await assert.rejects(store.apply(operation),/injected/);reject=false;
      if(partial){await assert.rejects(store.read(),/不确定/);await assert.rejects(store.apply(operation),/不确定/);}
      else{assert.equal((await store.read()).revision,0);await store.apply(operation);assert.equal((await store.read()).revision,1);}
    }finally{await store.close();}
    if(partial){const file=path.join(directory,'listening-drafts.jsonl'),before=await readFile(file);await assert.rejects(openListeningDrafts({directory,materials}),/保全/);assert.deepEqual(await readFile(file),before);}
  }
});

test('不同材料不冲突，非法身份/上下文拒绝，同ID异内容不写入，关闭后拒绝写',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ielts-draft-valid-'));
  const store=await openListeningDrafts({directory,materials:[...materials,{...materials[0],id:'long'}]});
  try{
    await store.apply(operation);
    await store.apply({...operation,operationId:'long-op',materialId:'long'});
    for(const change of [{version:'other'},{answers:{unknown:'1'}},{context:{voiceId:'us',position:99}},{expectedRevision:-1},{answers:{'word:1':'x'.repeat(1001)}}])await assert.rejects(store.apply({...operation,operationId:'invalid',...change}));
    await assert.rejects(store.apply({...operation,answers:{'word:1':'changed'}}),/其他内容/);
    assert.equal((await store.read()).revision,2);
  }finally{await store.close();}
  await assert.rejects(store.apply(operation),/关闭/);
});
