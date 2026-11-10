import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const makeDirectory = () => mkdtemp(path.join(os.tmpdir(),'ielts-d2b-'));
const forget = (operationId,entryId='word:1',module='reading') => ({operationId,type:'forget',module,entryId});

test('母词/拓展及四用途分别累计，关闭后从真实目录重开仍可公开读回', async () => {
  const {openStudyRecords}=await import('../src/records/store.mjs');
  const directory=await makeDirectory();
  const s=await openStudyRecords({directory});
  await s.apply(forget('a'));await s.apply(forget('b'));await s.apply(forget('c','extra:1-A'));
  assert.equal((await s.read()).counts.reading['word:1'],2);
  assert.equal((await s.read()).counts.reading['extra:1-A'],1);
  assert.deepEqual((await s.read()).counts.listening,{});
  await s.close();
  const reopened=await openStudyRecords({directory});
  assert.equal((await reopened.read()).counts.reading['word:1'],2);
  await reopened.close();
});

test('同ID重试幂等且异内容拒绝，并发独立操作都保留', async () => {
  const {openStudyRecords}=await import('../src/records/store.mjs');
  const directory=await makeDirectory();const s=await openStudyRecords({directory});
  await Promise.all([s.apply(forget('a')),s.apply(forget('a')),s.apply(forget('b'))]);
  assert.equal((await s.read()).counts.reading['word:1'],2);
  await assert.rejects(s.apply(forget('a','word:2')),/操作ID/);
  assert.equal((await s.read()).revision,2);
  await s.close();
  const reopened=await openStudyRecords({directory});
  await reopened.apply(forget('a'));
  assert.equal((await reopened.read()).counts.reading['word:1'],2);await reopened.close();
});

test('撤销绑定最近未撤销增加，可幂等重试但不能跨对象或重复扣减', async () => {
  const {openStudyRecords}=await import('../src/records/store.mjs');
  const s=await openStudyRecords({directory:await makeDirectory()});
  await s.apply(forget('a'));await s.apply(forget('b'));
  const undo={operationId:'u',type:'undo',module:'reading',entryId:'word:1',targetOperationId:'b'};
  assert.equal((await s.read()).undoable.reading['word:1'],'b');
  await s.apply(undo);await s.apply(undo);
  assert.equal((await s.read()).counts.reading['word:1'],1);
  await assert.rejects(s.apply({...undo,operationId:'u2'}),/撤销/);
  await assert.rejects(s.apply({...undo,operationId:'u3',entryId:'word:2',targetOperationId:'a'}),/撤销/);
  await s.apply({...undo,operationId:'u4',targetOperationId:'a'});
  assert.equal((await s.read()).counts.reading['word:1'],0);
  assert.equal((await s.read()).undoable.reading['word:1'],undefined);await s.close();
});

test('材料历史按模块和材料记录，重试不虚增，导出含原事件和公开视图', async () => {
  const {openStudyRecords}=await import('../src/records/store.mjs');
  const directory=await makeDirectory();const s=await openStudyRecords({directory,clock:()=>new Date('2026-11-10T01:00:00Z')});
  const op={operationId:'open1',type:'open',module:'reading',materialId:'A'};
  await s.apply(op);await s.apply(op);await s.apply({...op,operationId:'open2'});
  await s.apply(forget('a'));
  assert.deepEqual((await s.read()).history.reading.A,{opens:2,lastOpened:'2026-11-10T01:00:00.000Z'});
  const exported=await s.export();assert.equal(exported.version,1);
  assert.equal(exported.events.length,3);assert.deepEqual(exported.view,await s.read());
  assert.equal((await s.read()).revision,3);await s.close();
  const r=await openStudyRecords({directory});assert.equal((await r.read()).history.reading.A.opens,2);await r.close();
});

test('非法事件、未来版本和不完整尾行拒绝打开，原始坏文件保持字节不变', async () => {
  const {openStudyRecords}=await import('../src/records/store.mjs');
  for(const content of ['{"version":99}\n','{"version":1,"type":"forget"}\n','{bad}\n','{"version":1}',JSON.stringify({...forget('a'),version:1,time:'bad'})+'\n']) {
    const directory=await makeDirectory();const file=path.join(directory,'study-events.jsonl');
    await writeFile(file,content);
    await assert.rejects(openStudyRecords({directory}),/记录/);
    assert.equal(await readFile(file,'utf8'),content);
  }
  const s=await openStudyRecords({directory:await makeDirectory()});
  for(const operation of [{...forget('a'),module:'bad'},{...forget('a'),type:'bad'},forget(''),{...forget('a'),extra:'bad'}]) await assert.rejects(s.apply(operation));
  assert.equal((await s.read()).revision,0);await s.close();
});

test('同目录只允许一个写者，关闭释放占用，已关闭对象拒绝写入', async () => {
  const {openStudyRecords}=await import('../src/records/store.mjs');
  const directory=await makeDirectory();const s=await openStudyRecords({directory});
  await assert.rejects(openStudyRecords({directory}),/占用/);
  await s.close();await assert.rejects(s.apply(forget('closed')),/关闭/);
  const r=await openStudyRecords({directory});await r.apply(forget('a'));await r.close();
});

test('写入失败不能确认，预写失败可重试；部分写失败停止追加并保全尾行', async () => {
  const {openStudyRecords}=await import('../src/records/store.mjs');
  let fail=true;
  const s=await openStudyRecords({directory:await makeDirectory(),append:async(handle,text)=>{
    if(fail)throw new Error('模拟磁盘失败');await handle.writeFile(text);await handle.sync();
  }});
  await assert.rejects(s.apply(forget('a')),/模拟/);
  assert.equal((await s.read()).revision,0);
  fail=false;await s.apply(forget('a'));await s.apply(forget('a'));
  assert.equal((await s.read()).counts.reading['word:1'],1);await s.close();
  const directory=await makeDirectory();
  const broken=await openStudyRecords({directory,append:async(handle,text)=>{await handle.writeFile(text.slice(0,12));throw new Error('部分写失败');}});
  await assert.rejects(broken.apply(forget('b')),/部分写/);
  await assert.rejects(broken.read(),/保全/);
  await assert.rejects(broken.export(),/保全/);
  await assert.rejects(broken.apply(forget('c')),/保全/);
  await broken.close();await assert.rejects(openStudyRecords({directory}),/记录/);
});
