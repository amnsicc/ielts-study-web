import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {startStudyServer} from '../src/server.mjs';

test('扩容服务保持人造旧版v1/v2记录，新末词与拓展可设数加一撤销并重开导出',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ielts-r200-upgrade-'));
  const oldEvents=[
    {version:1,time:'2026-11-01T01:00:00.000Z',operationId:'old-add',type:'forget',module:'reading',entryId:'word:1'},
    {version:2,time:'2026-11-01T01:01:00.000Z',operationId:'old-set',type:'set_count',module:'reading',entryId:'word:1',count:7,expectedLastOperationId:'old-add'},
    {version:1,time:'2026-11-01T01:02:00.000Z',operationId:'old-open',type:'open',module:'reading',materialId:'reading:2'},
  ];
  await writeFile(path.join(directory,'study-events.jsonl'),oldEvents.map(e=>JSON.stringify(e)).join('\n')+'\n');
  let server=await startStudyServer({port:0,directory});
  const read=async()=> (await fetch(server.url+'/api/records')).json();
  const post=async operation=>{
    const response=await fetch(server.url+'/api/records/operations',{method:'POST',headers:{origin:server.url,'content-type':'application/json'},body:JSON.stringify({module:'reading',...operation})});
    assert.equal(response.status,200);return response.json();
  };
  try{
    assert.equal((await read()).counts.reading['word:1'],7);
    assert.equal((await read()).history.reading['reading:2'].opens,1);
    await post({operationId:'new-set',type:'set_count',entryId:'word:200',count:9,expectedLastOperationId:null});
    await post({operationId:'new-add',type:'forget',entryId:'word:200'});
    assert.equal((await read()).counts.reading['word:200'],10);
    await post({operationId:'new-undo',type:'undo',entryId:'word:200',targetOperationId:'new-add'});
    await post({operationId:'new-extra',type:'set_count',entryId:'extra:157-B',count:5,expectedLastOperationId:null});
    await post({operationId:'new-open',type:'open',materialId:'reading:10'});
    await server.close();server=await startStudyServer({port:0,directory});
    const view=await read();
    assert.equal(view.counts.reading['word:1'],7);
    assert.equal(view.counts.reading['word:200'],9);
    assert.equal(view.counts.reading['extra:157-B'],5);
    assert.equal(view.history.reading['reading:10'].opens,1);
    const exported=await (await fetch(server.url+'/api/records/export')).json();
    assert.equal(exported.version,2);
    assert.deepEqual(exported.events.slice(0,3),oldEvents);
    assert.equal(exported.events.length,8);
  }finally{await server.close();}
});
