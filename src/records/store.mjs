import { mkdir, open, readFile,unlink } from 'node:fs/promises';
import path from 'node:path';

const modules = ['reading','listening','writing','speaking'];
const operationKey = operation => JSON.stringify(Object.fromEntries(Object.entries(operation).filter(([key])=>!['version','time'].includes(key)).sort(([a],[b])=>a.localeCompare(b))));
function validate(operation) {
  const allowed=['operationId','type','module',...(operation.type==='open'?['materialId']:operation.type==='undo'?['entryId','targetOperationId']:operation.type==='set_count'?['entryId','count','expectedLastOperationId']:['entryId'])];
  if(!modules.includes(operation.module)||!['forget','undo','open','set_count'].includes(operation.type)||
    Object.keys(operation).some(key=>!allowed.includes(key))||
    allowed.filter(key=>!['count','expectedLastOperationId'].includes(key)).some(key=>typeof operation[key]!=='string'||!operation[key].length||operation[key].length>128)||
    (operation.type==='set_count' && (!Number.isSafeInteger(operation.count)||operation.count<0||!(operation.expectedLastOperationId===null||typeof operation.expectedLastOperationId==='string')))||
    !/^[a-zA-Z0-9:._-]+$/.test(operation.operationId))throw new Error('记录操作格式无效。');
}
export async function openStudyRecords({directory,clock=()=>new Date(),append=async(handle,text)=>{await handle.writeFile(text);await handle.sync();}}) {
  if (!path.isAbsolute(directory)) throw new Error('记录目录必须是绝对路径。');
  await mkdir(directory,{recursive:true});
  const lockPath=path.join(directory,'writer.lock');
  let lock;
  try {lock=await open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid}));}
  catch(error){if(error.code==='EEXIST')throw new Error('记录目录被占用；请检查现有服务，保留异常锁以便诊断。');throw error;}
  let closed=false;
  let failed=false;
  const file=path.join(directory,'study-events.jsonl');
  let events=[];
  let queue=Promise.resolve();
  try {
    const content=await readFile(file,'utf8');
    if(content && !content.endsWith('\n'))throw new Error('记录尾行不完整，已保全文件。');
    for(const line of content ? content.slice(0,-1).split('\n'):[]) {
      let event;
      try {event=JSON.parse(line);}catch{throw new Error('记录JSON损坏，已保全文件。');}
      const {version,time,...operation}=event;
      if(version!==(operation.type==='set_count'?2:1)||typeof time!=='string'||!Number.isFinite(Date.parse(time)))throw new Error('记录版本或时间无效，已保全文件。');
      validate(operation);
      if(events.some(e=>e.operationId===operation.operationId))throw new Error('记录操作ID重复。');
      if(operation.type==='set_count' && (view().entryVersions[operation.module][operation.entryId]||null)!==operation.expectedLastOperationId)throw new Error('记录设数基准无效。');
      if(operation.type==='undo' && view().undoable[operation.module]?.[operation.entryId]!==operation.targetOperationId)throw new Error('记录撤销引用无效。');
      if(operation.type==='forget' && (view().counts[operation.module][operation.entryId]||0)>=Number.MAX_SAFE_INTEGER)throw new Error('记录次数达到安全上限。');
      events.push(event);
    }
  }
  catch(error) { if(error.code!=='ENOENT'){await lock.close();await unlink(lockPath);throw error;} }
  function view() {
    const counts=Object.fromEntries(modules.map(m=>[m,{}]));
    const undoable=Object.fromEntries(modules.map(m=>[m,{}]));
    const history=Object.fromEntries(modules.map(m=>[m,{}]));
    const entryVersions=Object.fromEntries(modules.map(m=>[m,{}]));
    const undone=new Set(events.filter(e=>e.type==='undo').map(e=>e.targetOperationId));
    for(const event of events) if(event.type==='forget') {
      counts[event.module][event.entryId]??=0;
      if(!undone.has(event.operationId)) {
        counts[event.module][event.entryId]++;
        undoable[event.module][event.entryId]=event.operationId;
      }
    } else if(event.type==='set_count') {
      counts[event.module][event.entryId]=event.count;
      delete undoable[event.module][event.entryId];
    }
    for(const event of events) if(event.type==='open') {
      const previous=history[event.module][event.materialId];
      history[event.module][event.materialId]={opens:(previous?.opens||0)+1,lastOpened:event.time};
    } else entryVersions[event.module][event.entryId]=event.operationId;
    return {revision:events.length,counts,undoable,history,entryVersions};
  }
  return {
    async read(){await queue;if(failed)throw new Error('写入状态不确定，请保全记录并重开诊断。');return view();},
    apply(operation){
      if(closed)return Promise.reject(new Error('记录已关闭。'));
      const result=queue.then(async()=>{
      if(failed)throw new Error('写入状态不确定，已停止追加；请关闭服务并保全记录后诊断。');
      validate(operation);
      const previous=events.find(e=>e.operationId===operation.operationId);
      if(previous){
        if(operationKey(previous)!==operationKey(operation))throw new Error('操作ID已用于不同内容。');
        return view();
      }
      if(operation.type==='set_count' && (view().entryVersions[operation.module][operation.entryId]||null)!==operation.expectedLastOperationId) {
        const conflict=new Error('次数已在其他操作中改变，请刷新当前次数后重新确认。');conflict.code='COUNT_CONFLICT';throw conflict;
      }
      if(operation.type==='undo' && view().undoable[operation.module]?.[operation.entryId]!==operation.targetOperationId)throw new Error('只能撤销该对象最近未撤销的增加。');
      if(operation.type==='forget' && (view().counts[operation.module][operation.entryId]||0)>=Number.MAX_SAFE_INTEGER)throw new Error('次数已达到安全整数上限。');
      const event={...operation,version:operation.type==='set_count'?2:1,time:clock().toISOString()};
      const handle=await open(file,'a');
      const initialSize=(await handle.stat()).size;
      try {await append(handle,JSON.stringify(event)+'\n');}
      catch(error){if((await handle.stat()).size!==initialSize)failed=true;throw error;}
      finally{await handle.close();}
      events.push(event);return view();
      });
      queue=result.catch(()=>{});return result;
    },
    async close(){if(closed)return;closed=true;await queue;await lock.close();await unlink(lockPath);},
    async export(){await queue;if(failed)throw new Error('写入状态不确定，请保全记录并重开诊断。');return {format:'ielts-study-records',version:events.some(e=>e.version===2)?2:1,events:structuredClone(events),view:view()};},
  };
}
