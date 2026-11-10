import {mkdir,readFile,open,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const key=value=>JSON.stringify(value);
export async function openListeningDrafts({directory,materials,append=async(handle,text)=>{await handle.writeFile(text);await handle.sync();},clock=()=>new Date()}){
  if(!path.isAbsolute(directory))throw new Error('草稿目录必须是绝对路径。');
  await mkdir(directory,{recursive:true});
  const file=path.join(directory,'listening-drafts.jsonl');
  let queue=Promise.resolve(),closed=false,failed=false,events=[],drafts={};
  function normalize(o){
    if(!o||typeof o!=='object'||Object.keys(o).sort().join(',')!=='answers,context,expectedRevision,materialId,operationId,version')throw new Error('草稿操作字段无效。');
    if(typeof o.operationId!=='string'||!/^[a-zA-Z0-9:._-]{1,128}$/.test(o.operationId)||!Number.isSafeInteger(o.expectedRevision)||o.expectedRevision<0)throw new Error('草稿操作身份或修订号无效。');
    const m=materials.find(m=>m.id===o.materialId&&m.version===o.version);
    if(!m)throw new Error('草稿材料版本无效，已保留原数据。');
    const ids=m.targets.map(t=>t.id);
    if(!o.answers||Array.isArray(o.answers)||typeof o.answers!=='object'||Object.keys(o.answers).some(id=>!ids.includes(id))||Object.values(o.answers).some(s=>typeof s!=='string'||s.length>1000))throw new Error('草稿答案无效或超过1000字符。');
    const c=o.context,v=m.voices.find(v=>v.id===c?.voiceId);
    if(!c||Object.keys(c).sort().join(',')!=='position,voiceId'||!v||!Number.isFinite(c.position)||c.position<0||c.position>v.duration+0.1)throw new Error('草稿播放上下文无效。');
    return {operationId:o.operationId,materialId:m.id,version:m.version,expectedRevision:o.expectedRevision,
      answers:Object.fromEntries(ids.map(id=>[id,o.answers[id]||''])),context:{voiceId:c.voiceId,position:c.position}};
  }
  function adopt(o,time){drafts[o.materialId]={revision:(drafts[o.materialId]?.revision||0)+1,lastOperationId:o.operationId,version:o.version,answers:structuredClone(o.answers),context:{...o.context},updatedAt:time};}
  try{
    const raw=await readFile(file,'utf8');
    if(raw&&!raw.endsWith('\n'))throw new Error('草稿尾行不完整，已保全文件。');
    for(const line of raw?raw.slice(0,-1).split('\n'):[]){
      const event=JSON.parse(line),{formatVersion,time,...input}=event;
      if(formatVersion!==1||typeof time!=='string'||!Number.isFinite(Date.parse(time)))throw new Error('草稿记录版本或时间无效。');
      const o=normalize(input);
      if(events.some(e=>e.operationId===o.operationId)||o.expectedRevision!==(drafts[o.materialId]?.revision||0))throw new Error('草稿记录顺序或身份无效。');
      adopt(o,time);events.push({...o,formatVersion,time});
    }
  }catch(error){if(error.code!=='ENOENT')throw new Error('草稿读取失败，已保全文件：'+error.message);}
  const identityFile=path.join(directory,'data-store-id');let storeId;
  try{storeId=await readFile(identityFile,'utf8');if(!/^[a-z0-9-]{36}$/.test(storeId))throw new Error('数据目录身份无效。');}
  catch(error){if(error.code!=='ENOENT')throw error;storeId=randomUUID();await writeFile(identityFile,storeId,{flag:'wx'});}
  const view=()=>({storeId,revision:events.length,drafts:structuredClone(drafts)});
  const ready=()=>{if(failed)throw new Error('草稿写入状态不确定，请保全数据并重开诊断。');};
  return {
    async read(){await queue;ready();return view();},
    apply(input){
      if(closed)return Promise.reject(new Error('草稿已关闭。'));
      const result=queue.then(async()=>{
        ready();const o=normalize(input),previous=events.find(e=>e.operationId===o.operationId);
        if(previous){const {formatVersion,time,...original}=previous;if(key(o)!==key(original))throw new Error('草稿操作ID已用于其他内容。');return view();}
        if(o.expectedRevision!==(drafts[o.materialId]?.revision||0)){const e=new Error('草稿已在另一窗口改变，本地输入已保留，请比较远端草稿。');e.code='DRAFT_CONFLICT';throw e;}
        const time=clock().toISOString(),event={...o,formatVersion:1,time};
        const handle=await open(file,'a');const size=(await handle.stat()).size;
        try{await append(handle,JSON.stringify(event)+'\n');}catch(error){if((await handle.stat()).size!==size)failed=true;throw error;}finally{await handle.close();}
        adopt(o,time);events.push(event);return view();
      });queue=result.catch(()=>{});return result;
    },
    async export(){await queue;ready();return {format:'ielts-listening-drafts',version:1,events:structuredClone(events),view:view()};},
    async close(){closed=true;await queue;},
  };
}
