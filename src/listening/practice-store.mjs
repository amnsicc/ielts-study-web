import {readFile,open} from 'node:fs/promises';
import path from 'node:path';
import {checkAnswers} from './check.mjs';
import {createHash} from 'node:crypto';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const conflict=()=>Object.assign(new Error('练习已在另一窗口改变，本地输入已保留；请查看远端再处理。'),{code:'PRACTICE_CONFLICT'});
export async function openListeningPractice({directory,materials,definitions,legacy,append=async(h,text)=>{await h.writeFile(text);await h.sync();},clock=()=>new Date()}){
  const file=path.join(directory,'listening-practice.jsonl');let queue=Promise.resolve(),events=[],failed=false,closed=false;
  const state=Object.fromEntries(materials.map(m=>[m.id,{revision:0,currentRoundId:`initial:${m.id}`,rounds:[{id:`initial:${m.id}`,createdAt:null,first:null,corrections:[],draft:null}]}]));
  const current=id=>state[id].rounds.find(r=>r.id===state[id].currentRoundId);
  function validDefinition(d,m){
    if(!d||d.materialId!==m.id||d.materialVersion!==m.version||d.ruleVersion!=='filled-events-v1'||typeof d.answerVersion!=='string'||!d.answerVersion||!Array.isArray(d.targets)||!same(d.targets.map(t=>t.id),m.targets.map(t=>t.id)))throw new Error('练习答案版本无效。');
    const numbers=d.targets.flatMap(t=>t.correctNumbers||[]).sort((a,b)=>a-b);
    if(numbers.some((n,i)=>n!==i+1)||!numbers.length)throw new Error('目标事件序号不连续或重复。');
    if(createHash('sha256').update(JSON.stringify(d.targets)).digest('hex')!==d.answerVersion)throw new Error('答案内容与版本摘要不符。');
  }
  materials.forEach(m=>validDefinition(definitions.find(d=>d.materialId===m.id),m));
  function normalize(o){
    if(!o||Object.keys(o).sort().join(',')!=='expectedDraftRevision,expectedRevision,materialId,operationId,roundId,type'||!['first','correction','newRound'].includes(o.type)||typeof o.operationId!=='string'||!/^[a-zA-Z0-9:._-]{1,128}$/.test(o.operationId)||!state[o.materialId]||typeof o.roundId!=='string'||![o.expectedRevision,o.expectedDraftRevision].every(n=>Number.isSafeInteger(n)&&n>=0))throw new Error('练习操作字段无效。');
    return {type:o.type,operationId:o.operationId,materialId:o.materialId,roundId:o.roundId,expectedRevision:o.expectedRevision,expectedDraftRevision:o.expectedDraftRevision};
  }
  const ready=()=>{if(failed)throw new Error('练习写入状态不确定，请保全数据并重开诊断。');};
  function adopt(event){
    const s=state[event.operation.materialId],r=current(event.operation.materialId);
    if(event.operation.type==='draft')r.draft=event.draft;
    else{
      if(event.operation.type==='newRound'){
        r.draft=event.previousDraft;s.currentRoundId=`round:${event.operation.operationId}`;
        s.rounds.push({id:s.currentRoundId,createdAt:event.time,first:null,corrections:[],draft:event.draft});
      }else if(event.operation.type==='first')r.first=event.snapshot;else r.corrections.push(event.snapshot);
      s.revision++;
    }
    events.push(event);
  }
  async function commit(event){
    const handle=await open(file,'a'),size=(await handle.stat()).size;
    try{await append(handle,JSON.stringify(event)+'\n');}catch(e){if((await handle.stat()).size!==size)failed=true;throw e;}finally{await handle.close();}
    adopt(event);
  }
  function normalizeDraft(o){
    const m=materials.find(m=>m.id===o?.materialId),v=m?.voices.find(v=>v.id===o?.context?.voiceId);
    if(!m||Object.keys(o).sort().join(',')!=='answers,context,expectedRevision,materialId,operationId,version'||o.version!==m.version||typeof o.operationId!=='string'||!/^[a-zA-Z0-9:._-]{1,128}$/.test(o.operationId)||!Number.isSafeInteger(o.expectedRevision)||o.expectedRevision<0||!o.answers||Array.isArray(o.answers)||typeof o.answers!=='object'||Object.entries(o.answers).some(([id,s])=>!m.targets.some(t=>t.id===id)||typeof s!=='string'||s.length>1000)||!v||!Number.isFinite(o.context.position)||o.context.position<0||o.context.position>v.duration+.1||Object.keys(o.context).sort().join(',')!=='position,voiceId')throw new Error('轮次草稿字段无效。');
    return {operationId:o.operationId,materialId:m.id,version:m.version,expectedRevision:o.expectedRevision,answers:Object.fromEntries(m.targets.map(t=>[t.id,o.answers[t.id]||''])),context:{voiceId:v.id,position:o.context.position}};
  }
  function draftValue(o,roundId){return {version:o.version,revision:o.expectedRevision+1,answers:structuredClone(o.answers),context:{...o.context},lastOperationId:o.operationId,roundId};}
  function validateSavedDraft(d,m,roundId){
    if(!d||d.version!==m.version||d.roundId!==roundId||!Number.isSafeInteger(d.revision)||d.revision<0||!same(Object.keys(d.answers||{}),m.targets.map(t=>t.id)))throw new Error('保存草稿身份或目标无效');
    normalizeDraft({operationId:'validate',materialId:m.id,version:m.version,expectedRevision:d.revision,answers:d.answers,context:d.context});
  }
  try{
    const raw=await readFile(file,'utf8');if(raw&&!raw.endsWith('\n'))throw new Error('尾行不完整');
    for(const line of raw?raw.slice(0,-1).split('\n'):[]){
      const e=JSON.parse(line),o=e.operation.type==='draft'?e.operation:normalize(e.operation),s=state[o.materialId];
      if(e.formatVersion!==1||!Number.isFinite(Date.parse(e.time))||!s||o.roundId!==s.currentRoundId||events.some(x=>x.operation.operationId===o.operationId))throw new Error('快照或顺序无效');
      if(o.type==='draft'){
        const d=normalizeDraft(e.input),r=current(o.materialId);
        if(o.operationId!==d.operationId||o.materialId!==d.materialId||!r.draft||d.expectedRevision!==r.draft.revision||!same(draftValue(d,o.roundId),e.draft))throw new Error('轮次草稿顺序无效');
      }else{
        if(o.expectedRevision!==s.revision)throw new Error('练习修订无效');
        if(o.type==='newRound'){
          const m=materials.find(m=>m.id===o.materialId),d=e.previousDraft;
          validateSavedDraft(d,m,o.roundId);validateSavedDraft(e.draft,m,`round:${o.operationId}`);
          if(d.revision!==o.expectedDraftRevision||current(o.materialId).draft&&!same(d,current(o.materialId).draft)||e.draft.revision!==d.revision+1||Object.values(e.draft.answers).some(Boolean)||e.draft.lastOperationId!==o.operationId||e.draft.context.position!==0||e.draft.context.voiceId!==d.context.voiceId)throw new Error('新轮草稿无效');
        }else{
          const snap=e.snapshot,m=materials.find(m=>m.id===o.materialId);validDefinition(snap.definition,m);
          normalizeDraft({operationId:o.operationId,materialId:m.id,version:m.version,expectedRevision:o.expectedDraftRevision,answers:snap.answers,context:snap.context});
          if(!same(Object.keys(snap.answers),m.targets.map(t=>t.id)))throw new Error('结果快照目标不完整');
          if(current(o.materialId).draft&&(!same(snap.answers,current(o.materialId).draft.answers)||!same(snap.context,current(o.materialId).draft.context)||snap.draftRevision!==current(o.materialId).draft.revision))throw new Error('结果快照与轮次草稿不同');
          if(snap.operationId!==o.operationId||snap.checkedAt!==e.time||snap.draftRevision!==o.expectedDraftRevision||!same(snap.voice,m.voices.find(v=>v.id===snap.context.voiceId))||(o.type==='first'?!!current(o.materialId).first:!current(o.materialId).first)||!same(checkAnswers(snap.definition,snap.answers),snap.result)||current(o.materialId).first&&!same(snap.definition,current(o.materialId).first.definition))throw new Error('核对快照无效');
        }
      }
      adopt(e);
    }
  }catch(e){if(e.code!=='ENOENT')throw new Error('练习读取失败，已保全文件：'+e.message);}
  async function readDrafts(){const v=await legacy.read();return {...v,revision:v.revision+events.filter(e=>e.operation.type==='draft'||e.operation.type==='newRound').length,drafts:Object.fromEntries(materials.map(m=>[m.id,{...(current(m.id).draft||v.drafts[m.id]||{version:m.version,revision:0,answers:Object.fromEntries(m.targets.map(t=>[t.id,''])),context:{voiceId:m.voices[0].id,position:0}}),roundId:state[m.id].currentRoundId}]))};}
  async function view(){const d=await readDrafts(),s=structuredClone(state);for(const m of materials)s[m.id].rounds.find(r=>r.id===s[m.id].currentRoundId).draft=d.drafts[m.id];return {storeId:d.storeId,revision:events.length,materials:s};}
  return {
    async read(){await queue;ready();return view();},
    async readDrafts(){await queue;ready();return readDrafts();},
    saveDraft(input,roundId){
      if(closed)return Promise.reject(new Error('练习已关闭。'));
      const result=queue.then(async()=>{
        ready();const s=state[input.materialId];
        if(!s||roundId&&roundId!==s.currentRoundId||!roundId&&s.revision>0)throw Object.assign(new Error('草稿所属轮次已改变，请保留输入并采用远端练习。'),{code:'DRAFT_CONFLICT'});
        if(current(input.materialId).draft){
          const o=normalizeDraft(input),previous=events.find(e=>e.operation.operationId===o.operationId);
          if(previous){if(!same(previous.input,o))throw new Error('练习操作ID已用于其他内容。');return readDrafts();}
          if(o.expectedRevision!==current(o.materialId).draft.revision)throw Object.assign(conflict(),{code:'DRAFT_CONFLICT'});
          await commit({formatVersion:1,time:clock().toISOString(),operation:{type:'draft',operationId:o.operationId,materialId:o.materialId,roundId},input:o,draft:draftValue(o,roundId)});
        }else await legacy.apply(input);
        return readDrafts();
      });queue=result.catch(()=>{});return result;
    },
    apply(input){
      if(closed)return Promise.reject(new Error('练习已关闭。'));
      const result=queue.then(async()=>{
        ready();const o=normalize(input),old=events.find(e=>e.operation.operationId===o.operationId);
        if(old){if(!same(old.operation,o))throw new Error('练习操作ID已用于其他内容。');return view();}
        const s=state[o.materialId],r=current(o.materialId),d=(await readDrafts()).drafts[o.materialId];
        if(o.expectedRevision!==s.revision||o.roundId!==s.currentRoundId||o.expectedDraftRevision!==d.revision)throw conflict();
        if(o.type==='newRound'){
          const m=materials.find(m=>m.id===o.materialId),time=clock().toISOString();
          await commit({formatVersion:1,time,operation:o,previousDraft:structuredClone(d),draft:{version:m.version,revision:d.revision+1,answers:Object.fromEntries(m.targets.map(t=>[t.id,''])),context:{voiceId:d.context.voiceId,position:0},lastOperationId:o.operationId,roundId:`round:${o.operationId}`}});
          return view();
        }
        if(o.type==='first'?!!r.first:!r.first)throw conflict();
        const definition=structuredClone(r.first?.definition||definitions.find(d=>d.materialId===o.materialId)),m=materials.find(m=>m.id===o.materialId),voice=m.voices.find(v=>v.id===d.context.voiceId),time=clock().toISOString();
        const snapshot={operationId:o.operationId,checkedAt:time,definition,answers:structuredClone(d.answers),context:{...d.context},voice:structuredClone(voice),draftRevision:d.revision,result:checkAnswers(definition,d.answers)};
        const event={formatVersion:1,time,operation:o,snapshot};await commit(event);return view();
      });queue=result.catch(()=>{});return result;
    },
    async export(){await queue;ready();return {format:'ielts-listening-practice',version:1,events:structuredClone(events),view:await view()};},
    async close(){closed=true;await queue;}
  };
}
