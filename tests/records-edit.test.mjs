import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openStudyRecords} from '../src/records/store.mjs';
const directory=()=>mkdtemp(path.join(os.tmpdir(),'ielts-edit-'));
const forget=id=>({operationId:id,type:'forget',module:'reading',entryId:'word:1'});
const setCount=(id,count,expectedLastOperationId,entryId='word:1')=>({operationId:id,type:'set_count',module:'reading',entryId,count,expectedLastOperationId});

test('直接设总次数并重开读回，保留原v1事件与其他对象/模块，设0隐藏所需原值为0',async()=>{
  const dir=await directory();let s=await openStudyRecords({directory:dir});
  await s.apply(forget('a'));await s.apply(forget('b'));
  const original=await readFile(path.join(dir,'study-events.jsonl'),'utf8');
  await s.apply(setCount('set1',10,'b'));await s.apply(setCount('set2',3,null,'extra:1-A'));
  assert.equal((await s.read()).counts.reading['word:1'],10);
  assert.equal((await s.read()).counts.reading['extra:1-A'],3);
  assert.deepEqual((await s.read()).counts.listening,{});
  await s.close();s=await openStudyRecords({directory:dir});
  assert.equal((await s.read()).counts.reading['word:1'],10);
  await s.apply(setCount('zero',0,'set1'));assert.equal((await s.read()).counts.reading['word:1'],0);
  const exported=await s.export();assert.equal(exported.version,2);assert.equal(exported.events[0].version,1);
  assert.equal(exported.events.find(e=>e.operationId==='set1').version,2);
  assert.ok((await readFile(path.join(dir,'study-events.jsonl'),'utf8')).startsWith(original));await s.close();
});

test('设数只校验该对象最新操作，旧窗口冲突拒绝，幂等重试先于冲突校验',async()=>{
  const s=await openStudyRecords({directory:await directory()});
  await s.apply(forget('a'));
  assert.equal((await s.read()).entryVersions.reading['word:1'],'a');
  await s.apply({...forget('other'),entryId:'word:2'});
  await s.apply(setCount('edit',10,'a'));
  await s.apply(setCount('edit',10,'a'));
  assert.equal((await s.read()).counts.reading['word:1'],10);
  await assert.rejects(s.apply(setCount('stale',3,'a')),error=>error.code==='COUNT_CONFLICT');
  await assert.rejects(s.apply(setCount('edit',11,'a')),/操作ID/);
  assert.equal((await s.read()).counts.reading['word:1'],10);
  await s.apply(setCount('confirmed',3,'edit'));
  assert.equal((await s.read()).entryVersions.reading['word:1'],'confirmed');await s.close();
});

test('设数后撤销不跨基准，后续加一可撤销并重开还原',async()=>{
  const dir=await directory();let s=await openStudyRecords({directory:dir});
  await s.apply(forget('a'));await s.apply(setCount('base',10,'a'));
  assert.equal((await s.read()).undoable.reading['word:1'],undefined);
  await assert.rejects(s.apply({operationId:'bad-undo',type:'undo',module:'reading',entryId:'word:1',targetOperationId:'a'}),/撤销/);
  await s.apply(forget('new'));await s.apply({operationId:'u',type:'undo',module:'reading',entryId:'word:1',targetOperationId:'new'});
  assert.equal((await s.read()).counts.reading['word:1'],10);
  await s.close();s=await openStudyRecords({directory:dir});
  assert.equal((await s.read()).counts.reading['word:1'],10);await s.close();
});

test('非法设数拒绝且不改记录，写前失败/回执丢失重试保留同操作的总数',async()=>{
  let fail=true;const s=await openStudyRecords({directory:await directory(),append:async(handle,text)=>{if(fail)throw new Error('测试写前失败');await handle.writeFile(text);await handle.sync();}});
  for(const count of [-1,0.1,'2',null,Number.MAX_SAFE_INTEGER+1])await assert.rejects(s.apply(setCount('bad',count,null)));
  assert.equal((await s.read()).revision,0);
  const op=setCount('edit',10,null);
  await assert.rejects(s.apply(op),/测试写前/);assert.equal((await s.read()).revision,0);
  fail=false;await s.apply(op);await s.apply(op);
  assert.equal((await s.read()).counts.reading['word:1'],10);assert.equal((await s.read()).revision,1);await s.close();
});

test('达到最大安全整数后拒绝加一，保持已保存设数和事件不变',async()=>{
  const s=await openStudyRecords({directory:await directory()});
  await s.apply(setCount('maximum',Number.MAX_SAFE_INTEGER,null));
  await assert.rejects(s.apply(forget('overflow')),/上限/);
  assert.equal((await s.read()).counts.reading['word:1'],Number.MAX_SAFE_INTEGER);
  assert.equal((await s.read()).revision,1);await s.close();
});
