export function createPracticeClient(drafts){
  let view=null,busy=false,pending=null,error='',code='',issues=[],storageError='',recovery=[],initialized=false,backupKey=null;
  const listeners=new Set(),sessionKey='ielts-practice-outbox-v1',pageId=crypto.randomUUID();
  const state=()=>({view,busy,pending:structuredClone(pending),error,code,issues,storageError,recovery});
  const notify=()=>listeners.forEach(f=>f(state()));
  const valid=x=>x?.storeId&&x.operation&&typeof x.operation.operationId==='string'&&['first','correction','newRound'].includes(x.operation.type);
  function persist(){
    try{
      if(pending){sessionStorage.setItem(sessionKey,JSON.stringify(pending));backupKey??=`ielts-practice-recovery:${pending.storeId}:${pageId}`;localStorage.setItem(backupKey,JSON.stringify(pending));}
      else{sessionStorage.removeItem(sessionKey);if(backupKey)localStorage.removeItem(backupKey);backupKey=null;}
      storageError='';
    }catch(e){storageError='核对待办保全失败，请保持页面打开，确认保存成功后再离开。';}
  }
  async function request(url,options){const response=await fetch(url,options),value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error||'练习读取失败'),{code:value.code,issues:value.issues||[]});return value;}
  async function refresh(){
    const value=await request('/api/listening/practice');
    if(view&&view.storeId!==value.storeId)throw new Error('数据目录身份改变，核对待办已保留。');view=value;
    if(!initialized){
      initialized=true;
      try{
        const saved=JSON.parse(sessionStorage.getItem(sessionKey)||'null');if(saved){if(!valid(saved)||saved.storeId!==view.storeId)throw new Error('核对待办来自不同目录或格式错误，未重放。');pending=saved;}
        for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key.startsWith(`ielts-practice-recovery:${view.storeId}:`))continue;const x=JSON.parse(localStorage.getItem(key));if(valid(x)&&x.storeId===view.storeId)recovery.push({key,snapshot:x});}
      }catch(e){storageError=e.message;}
    }
    notify();return value;
  }
  async function send(){
    if(!pending)return;
    const next=await request('/api/listening/practice/operations',{method:'POST',headers:{'Content-Type':'application/json','X-Data-Store-Id':pending.storeId},body:JSON.stringify(pending.operation)});
    if(next.storeId!==pending.storeId)throw new Error('数据目录身份改变，核对待办已保留。');
    const acknowledged=pending;
    view=next;pending=null;persist();
    try{
      for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(!key.startsWith(`ielts-practice-recovery:${acknowledged.storeId}:`))continue;const x=JSON.parse(localStorage.getItem(key));if(x?.operation?.operationId===acknowledged.operation.operationId)localStorage.removeItem(key);}
      recovery=recovery.filter(x=>x.snapshot.operation.operationId!==acknowledged.operation.operationId);
    }catch(e){storageError='已保存核对，但本地待办备份清理失败，请保持页面打开。';}
    await drafts.refresh();error='';code='';issues=[];
  }
  async function attempt(action){
    if(busy)return;busy=true;error='';code='';issues=[];notify();
    try{await action();}
    catch(e){error=e.message;code=e.code||'';issues=e.issues||[];if(['INVALID_ANSWER','EMPTY_ANSWER'].includes(code)){pending=null;persist();}}
    finally{busy=false;notify();}
  }
  window.addEventListener('beforeunload',e=>{if(pending||storageError){e.preventDefault();e.returnValue='';}});
  window.addEventListener('pagehide',()=>{if(initialized)persist();});
  return {
    subscribe(fn){listeners.add(fn);fn(state());return()=>listeners.delete(fn);},snapshot:state,
    refresh:()=>attempt(()=>refresh()),
    perform(type,id){return attempt(async()=>{
      if(pending||storageError)throw new Error('请先处理未完成的核对操作或保全错误。');
      if(!view)throw new Error('练习尚未读取，请重试。');const base=view.materials[id];
      const saved=await drafts.settle(id);
      if(saved.storeId!==view.storeId||saved.roundId!==base.currentRoundId)throw Object.assign(new Error('轮次已改变，请先查看并采用远端练习。'),{code:'PRACTICE_CONFLICT'});
      pending={storeId:view.storeId,operation:{type,operationId:crypto.randomUUID(),materialId:id,roundId:saved.roundId,expectedRevision:base.revision,expectedDraftRevision:saved.revision}};
      persist();if(storageError)throw new Error(storageError);notify();await send();
    });},
    retry:()=>attempt(async()=>{if(pending){if(pending.storeId!==view?.storeId)throw new Error('目录身份不符，禁止重放。');persist();if(storageError)throw new Error(storageError);await send();}else await refresh();}),
    compare(){const previous={error,code};return attempt(async()=>{await refresh();if(pending){error=previous.error;code=previous.code;}});},
    adopt(id){const previous={error,code};return attempt(async()=>{
      if(await drafts.useRemote(id)){await refresh();pending=null;error='';code='';persist();}
      else{error=previous.error;code=previous.code;}
    });},
    recover(key){const x=recovery.find(x=>x.key===key);if(!x||pending||busy)return;pending=structuredClone(x.snapshot);persist();notify();},
  };
}
