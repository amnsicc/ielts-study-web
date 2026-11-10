import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {startStudyServer} from '../src/server.mjs';
test('固定音频支持真实Range及HEAD，草稿API保存重开，私有文件不公开',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ielts-listening-http-'));
  let s=await startStudyServer({port:0,directory});
  try{
    const m=(await (await fetch(s.url+'/data/listening-materials.json')).json())[0];
    const audio=await fetch(s.url+m.voices[0].url,{headers:{Range:'bytes=0-15'}});
    assert.equal(audio.status,206);assert.equal(audio.headers.get('content-type'),'audio/mpeg');
    const original=await readFile(new URL('..'+m.voices[0].url,import.meta.url));
    assert.deepEqual(Buffer.from(await audio.arrayBuffer()),original.subarray(0,16));
    const suffix=await fetch(s.url+m.voices[0].url,{headers:{Range:'bytes=-9'}});
    assert.equal(suffix.status,206);assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),original.subarray(-9));
    assert.equal((await fetch(s.url+m.voices[0].url,{method:'HEAD'})).headers.get('content-length'),String(original.length));
    assert.equal((await fetch(s.url+m.voices[0].url,{headers:{Range:'bytes=99999999-'}})).status,416);
    const draftView=await (await fetch(s.url+'/api/listening/drafts')).json();
    const operation={operationId:'http-draft',materialId:m.id,version:m.version,expectedRevision:0,answers:{'word:1':' 1，? '},context:{voiceId:m.voices[0].id,position:5}};
    const headers={origin:s.url,'content-type':'application/json','x-data-store-id':draftView.storeId};
    const wrong=await fetch(s.url+'/api/listening/drafts/operations',{method:'POST',headers:{...headers,'x-data-store-id':'other-directory'},body:JSON.stringify(operation)});
    assert.equal(wrong.status,409);
    const response=await fetch(s.url+'/api/listening/drafts/operations',{method:'POST',headers,body:JSON.stringify(operation)});
    assert.equal(response.status,200);
    await s.close();s=await startStudyServer({port:0,directory});
    assert.equal((await (await fetch(s.url+'/api/listening/drafts')).json()).drafts[m.id].answers['word:1'],' 1，? ');
    for(const name of ['/src/listening/drafts-store.mjs','/.local-data/listening-drafts.jsonl','/audio/no.mp3'])assert.equal((await fetch(s.url+name)).status,404);
  }finally{await s.close();}
});

test('草稿文件损坏导致服务启动失败时释放本次记录锁，源文件和旧计数保持',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ielts-draft-startup-'));
  const file=path.join(directory,'listening-drafts.jsonl');await writeFile(file,'partial-original');
  await assert.rejects(startStudyServer({port:0,directory}),/草稿读取失败/);
  assert.equal(await readFile(file,'utf8'),'partial-original');
  await assert.rejects(access(path.join(directory,'writer.lock')));
});
