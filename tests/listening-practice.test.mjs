import test from 'node:test';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {openListeningDrafts} from '../src/listening/drafts-store.mjs';import {openListeningPractice} from '../src/listening/practice-store.mjs';
const materials=[{id:'sample',version:'v1',targets:[{id:'a'},{id:'b'}],voices:[{id:'us',duration:80,sha256:'a'.repeat(64)}]}];
const definitions=[{materialId:'sample',materialVersion:'v1',answerVersion:'b2092a32409636e3f6afbc7f0d5ad369d0ca8eb51bdaecef5dc5754b30b89f49',ruleVersion:'filled-events-v1',targets:[{id:'a',correctNumbers:[1,3],occurrences:[]},{id:'b',correctNumbers:[2],occurrences:[]}]}];
async function setup(append){const directory=await mkdtemp(path.join(os.tmpdir(),'ielts-practice-'));const legacy=await openListeningDrafts({directory,materials});const store=await openListeningPractice({directory,materials,definitions,legacy,...(append?{append}: {})});return {directory,legacy,store};}
const draft=(id='d1',revision=0,answers={a:'1、2',b:''})=>({operationId:id,materialId:'sample',version:'v1',expectedRevision:revision,answers,context:{voiceId:'us',position:2}});
const action=(type,operationId,roundId,expectedRevision,expectedDraftRevision)=>({type,operationId,materialId:'sample',roundId,expectedRevision,expectedDraftRevision});
test('已有草稿作为初始轮，首次快照冻结、重试幂等、重开保持，旧草稿事件不重写',async()=>{
 const {directory,legacy,store}=await setup();let next;
 try{
  await legacy.apply(draft());const before=await readFile(path.join(directory,'listening-drafts.jsonl'),'utf8');
  const round=(await store.read()).materials.sample.currentRoundId;
  const op=action('first','f1',round,0,1);await store.apply(op);await store.apply(op);
  let r=(await store.read()).materials.sample.rounds[0];assert.equal(r.first.result.percentage,50);assert.deepEqual(r.first.answers,{a:'1、2',b:''});assert.equal(r.first.voice.sha256,'a'.repeat(64));
  assert.equal(await readFile(path.join(directory,'listening-drafts.jsonl'),'utf8'),before);
  await store.close();next=await openListeningPractice({directory,materials,definitions,legacy});r=(await next.read()).materials.sample.rounds[0];assert.equal(r.first.operationId,'f1');assert.equal(r.first.definition.answerVersion,'b2092a32409636e3f6afbc7f0d5ad369d0ca8eb51bdaecef5dc5754b30b89f49');
 }finally{await next?.close();await store.close();await legacy.close();}
});
export {setup,draft,action,materials,definitions};

test('订正另存且不改首次，旧窗口不能再冻结首次，带轮草稿保存串行判基准',async()=>{
 const {legacy,store}=await setup();try{
  const round=(await store.read()).materials.sample.currentRoundId;await store.saveDraft(draft(),round);await store.apply(action('first','f1',round,0,1));
  await assert.rejects(store.apply(action('first','stale-first',round,1,1)),e=>e.code==='PRACTICE_CONFLICT');
  await assert.rejects(store.saveDraft(draft('old',1)),e=>e.code==='DRAFT_CONFLICT');
  await store.saveDraft(draft('d2',1,{a:'1、3',b:'2'}),round);await store.apply(action('correction','c1',round,1,2));
  const r=(await store.read()).materials.sample.rounds[0];assert.equal(r.first.result.percentage,50);assert.equal(r.corrections.length,1);assert.equal(r.corrections[0].result.percentage,100);
 }finally{await store.close();await legacy.close();}
});

test('新轮真实隔离草稿并留未核对的旧稿，旧轮待办不能串入，重开仍保持',async()=>{
 const {directory,legacy,store}=await setup();let next;try{
  let v=await store.read(),round=v.materials.sample.currentRoundId;await store.saveDraft(draft(),round);
  const op=action('newRound','new1',round,0,1);await store.apply(op);await store.apply(op);
  v=await store.read();const s=v.materials.sample,active=s.currentRoundId;assert.notEqual(active,round);assert.equal(s.rounds.length,2);assert.equal(s.rounds[0].draft.answers.a,'1、2');assert.equal(s.rounds[1].draft.answers.a,'');
  await assert.rejects(store.saveDraft(draft('stale',1),round),e=>e.code==='DRAFT_CONFLICT');
  const revision=(await store.readDrafts()).drafts.sample.revision;await store.saveDraft(draft('newdraft',revision,{a:'3',b:''}),active);
  await store.apply(action('first','newfirst',active,1,revision+1));
  assert.equal((await store.read()).materials.sample.rounds[1].first.result.percentage,100);
  await store.close();next=await openListeningPractice({directory,materials,definitions,legacy});v=await next.read();assert.equal(v.materials.sample.currentRoundId,active);assert.equal(v.materials.sample.rounds[0].draft.answers.a,'1、2');assert.equal(v.materials.sample.rounds[1].first.answers.a,'3');
 }finally{await next?.close();await store.close();await legacy.close();}
});

test('首次写前失败可同ID重试，部分写失败锁定且保留坏尾行，重开拒绝伪造快照',async()=>{
 for(const partial of [false,true]){
  let fail=true;const {directory,legacy,store}=await setup(async(h,text)=>{if(fail){if(partial)await h.writeFile(text.slice(0,30));throw new Error('injected');}await h.writeFile(text);await h.sync();});
  const round=(await store.read()).materials.sample.currentRoundId;await store.saveDraft(draft(),round);const op=action('first','f1',round,0,1);
  await assert.rejects(store.apply(op),/injected/);fail=false;
  if(partial){await assert.rejects(store.read(),/不确定/);await store.close();const f=path.join(directory,'listening-practice.jsonl'),raw=await readFile(f);await assert.rejects(openListeningPractice({directory,materials,definitions,legacy}),/保全/);assert.deepEqual(await readFile(f),raw);}
  else{await store.apply(op);await store.apply(op);assert.equal((await store.export()).events.length,1);await store.close();}
  await legacy.close();
 }
 for(const change of [e=>e.snapshot.definition.answerVersion='forged',e=>e.snapshot.operationId='forged',e=>e.snapshot.voice.sha256='c'.repeat(64),e=>e.snapshot.definition.materialVersion='wrong',e=>e.snapshot.draftRevision=999,e=>e.snapshot.result.percentage=99,e=>e.formatVersion=99]){
  const {directory,legacy,store}=await setup();const round=(await store.read()).materials.sample.currentRoundId;await store.saveDraft(draft(),round);await store.apply(action('first','f1',round,0,1));await store.close();
  const f=path.join(directory,'listening-practice.jsonl'),e=JSON.parse((await readFile(f,'utf8')).trim());change(e);const raw=JSON.stringify(e)+'\n';await writeFile(f,raw);await assert.rejects(openListeningPractice({directory,materials,definitions,legacy}),/保全/);assert.equal(await readFile(f,'utf8'),raw);await legacy.close();
 }
});

test('新轮事件的归档与空稿必须完整，损坏轮次/草稿链拒绝且不修改文件',async()=>{
 for(const mutate of [e=>e.previousDraft.roundId='wrong',e=>e.previousDraft.answers={unknown:'1'},e=>e.draft.lastOperationId='wrong',e=>e.draft.context.voiceId='wrong',e=>delete e.draft.answers.b]){
  const {directory,legacy,store}=await setup();const round=(await store.read()).materials.sample.currentRoundId;await store.saveDraft(draft(),round);await store.apply(action('newRound','new1',round,0,1));await store.close();
  const file=path.join(directory,'listening-practice.jsonl'),event=JSON.parse((await readFile(file,'utf8')).trim());mutate(event);const raw=JSON.stringify(event)+'\n';await writeFile(file,raw);
  await assert.rejects(openListeningPractice({directory,materials,definitions,legacy}),/保全/);assert.equal(await readFile(file,'utf8'),raw);await legacy.close();
 }
});

test('同时首次只保存一个；升级答案定义后旧首次及订正仍用固定版本',async()=>{
 const {directory,legacy,store}=await setup();let next;try{
  const round=(await store.read()).materials.sample.currentRoundId;await store.saveDraft(draft(),round);
  const results=await Promise.allSettled([store.apply(action('first','f1',round,0,1)),store.apply(action('first','f2',round,0,1))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'PRACTICE_CONFLICT');await store.close();
  const newer=structuredClone(definitions);newer[0].targets[0].correctNumbers=[2,3];newer[0].targets[1].correctNumbers=[1];newer[0].answerVersion=createHash('sha256').update(JSON.stringify(newer[0].targets)).digest('hex');
  next=await openListeningPractice({directory,materials,definitions:newer,legacy});await next.saveDraft(draft('d2',1,{a:'1',b:''}),round);await next.apply(action('correction','c1',round,1,2));
  const r=(await next.read()).materials.sample.rounds[0];assert.equal(r.first.result.percentage,50);assert.equal(r.corrections[0].result.percentage,100);assert.equal(r.corrections[0].definition.answerVersion,definitions[0].answerVersion);
 }finally{await next?.close();await store.close();await legacy.close();}
});
