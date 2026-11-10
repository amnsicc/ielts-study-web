// Browser persistence is an outbox, never an optimistic server acknowledgement.
export function createDraftsClient(materials){
  let view=null,busy=false,resolving=false,error='',storageError='',recoveryError='',items={},timer;
  const listeners=new Set(),pageId=crypto.randomUUID(),sessionKey='ielts-listening-outbox-v1';
  let backupKey=null,recovery=[];
  const state=()=>({view,busy,resolving,error,storageError:storageError||recoveryError,items:structuredClone(items),recovery:structuredClone(recovery)});
  const notify=()=>listeners.forEach(f=>f(state()));
  function persist(){
    if(!view||recoveryError)return;
    const snapshot={storeId:view.storeId,items};
    try{
      sessionStorage.setItem(sessionKey,JSON.stringify(snapshot));
      const pending=Object.values(items).some(x=>x.dirty||x.pending||x.conflict);
      if(pending){backupKey||= `ielts-listening-recovery:${view.storeId}:${pageId}`;localStorage.setItem(backupKey,JSON.stringify(snapshot));}
      else if(backupKey){localStorage.removeItem(backupKey);backupKey=null;}
      storageError='';
    }catch(failure){storageError='浏览器待办保全失败：'+failure.message+'。请保持页面打开，确认自动保存成功后再离开。';}
  }
  async function request(url,options){const response=await fetch(url,options),result=await response.json();if(!response.ok){const failure=new Error(result.error||'草稿请求失败');failure.code=result.code;throw failure;}return result;}
  const material=id=>materials.find(m=>m.id===id);
  function fresh(id){const m=material(id),saved=view?.drafts[id];return {version:m.version,roundId:saved?.roundId||`initial:${id}`,revision:saved?.revision||0,answers:{...Object.fromEntries(m.targets.map(t=>[t.id,''])),...saved?.answers},context:saved?.context||{voiceId:m.voices[0].id,position:0},dirty:false,pending:null,conflict:false};}
  function validSnapshot(saved){
    return saved?.storeId===view.storeId&&saved.items&&typeof saved.items==='object'&&Object.entries(saved.items).every(([id,x])=>{
      const m=material(id);return m&&x&&x.version===m.version&&x.answers&&typeof x.answers==='object'&&!Array.isArray(x.answers)&&Object.entries(x.answers).every(([entry,text])=>m.targets.some(t=>t.id===entry)&&typeof text==='string'&&text.length<=1000)&&Number.isSafeInteger(x.revision)&&x.revision>=0&&(!x.pending||x.pending.version===m.version);
    });
  }
  async function refresh(){
    if(busy)return;busy=true;error='';notify();
    try{
      const next=await request('/api/listening/drafts');
      if(view&&view.storeId!==next.storeId)throw new Error('数据目录已更换。请保留本窗口输入并确认当前数据位置，未完成内容不会跨目录写入。');
      const first=!view;view=next;
      if(first){
        for(const m of materials)items[m.id]=fresh(m.id);
        try{
          const raw=sessionStorage.getItem(sessionKey);
          if(raw){const saved=JSON.parse(raw);if(saved.storeId===view.storeId){if(!validSnapshot(saved))throw new Error('待办格式或材料版本不匹配');
            for(const [id,x] of Object.entries(saved.items))if(x.dirty||x.pending||x.conflict)items[id]={...x,roundId:x.roundId||`initial:${id}`};
          }}
          for(let i=0;i<localStorage.length;i++){
            const key=localStorage.key(i);if(!key.startsWith(`ielts-listening-recovery:${view.storeId}:`))continue;
            const snapshot=JSON.parse(localStorage.getItem(key));if(validSnapshot(snapshot))recovery.push({key,snapshot});
          }
        }catch(failure){recoveryError='本地待办读取失败，未覆盖：'+failure.message;}
      }else for(const m of materials){const x=items[m.id];if(!x?.dirty&&!x?.pending&&!x?.conflict)items[m.id]=fresh(m.id);}
      persist();
    }catch(failure){error=failure.message;}
    finally{busy=false;notify();}
  }
  async function flush(){
    clearTimeout(timer);if(!view||busy||recoveryError)return;
    busy=true;error='';notify();
    try{
      for(const m of materials){
        const x=items[m.id];if(x.conflict)continue;
        while(x.pending||x.dirty){
          if(!x.pending){x.pending={operationId:crypto.randomUUID(),materialId:m.id,version:m.version,expectedRevision:x.revision,answers:structuredClone(x.answers),context:{...x.context}};x.pendingRound=x.roundId;x.dirty=false;persist();}
          const op=x.pending;notify();
          try{
            const result=await request('/api/listening/drafts/operations',{method:'POST',headers:{'Content-Type':'application/json','X-Data-Store-Id':view.storeId,'X-Practice-Round-Id':x.pendingRound||x.roundId||`initial:${m.id}`},body:JSON.stringify(op)});
            if(result.storeId!==view.storeId)throw new Error('数据目录身份变化，待办保留。');
            view=result;
            const latest=result.drafts[m.id];
            if(latest.lastOperationId!==op.operationId){
              x.pending=null;
              if(x.dirty){x.conflict=true;error='草稿冲突：旧操作已确认，但远端之后又有更新。本地新输入已保留。';persist();notify();break;}
              items[m.id]=fresh(m.id);persist();notify();break;
            }
            x.revision=latest.revision;x.pending=null;persist();notify();
          }catch(failure){
            if(failure.code==='DRAFT_CONFLICT'){x.conflict=true;error=failure.message;persist();break;}
            throw failure;
          }
        }
      }
    }catch(failure){error=failure.message;}
    finally{busy=false;persist();notify();if(!error&&Object.values(items).some(x=>!x.conflict&&(x.dirty||x.pending)))schedule();}
  }
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>void flush(),350);};
  const downloadLocal=()=>{
    const blob=new Blob([JSON.stringify({format:'ielts-listening-local-backup',view,items},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ielts-listening-local-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  };
  window.addEventListener('beforeunload',event=>{persist();if(Object.values(items).some(x=>x.dirty||x.pending||x.conflict)||storageError){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>persist());
  window.addEventListener('focus',()=>{if(view&&!busy&&!document.activeElement?.matches('[data-answer-for]')&&!Object.values(items).some(x=>x.dirty||x.pending||x.conflict))void refresh();});
  return {
    subscribe(fn){listeners.add(fn);fn(state());return()=>listeners.delete(fn);},refresh,flush,
    snapshot:state,
    async settle(id){
      while(busy)await new Promise(resolve=>{const fn=()=>{if(!busy){listeners.delete(fn);resolve();}};listeners.add(fn);});
      if(error||storageError||recoveryError||items[id]?.conflict)throw new Error('请先处理草稿保存失败或冲突，再核对答案。');
      await flush();const x=items[id];
      if(!view||busy||error||storageError||recoveryError||!x||x.dirty||x.pending||x.conflict)throw new Error('草稿尚未确认保存，请先处理后再核对。');
      return {storeId:view.storeId,...structuredClone(x)};
    },
    edit(id,entry,text){const x=items[id];if(!view||!x||typeof text!=='string'||text.length>1000)throw new Error('草稿尚未读取或输入超过1000字符');x.answers[entry]=text;x.dirty=true;persist();notify();schedule();},
    context(id,context){const x=items[id];if(!x||!view||JSON.stringify(x.context)===JSON.stringify(context))return;x.context={...context};x.dirty=true;persist();notify();schedule();},
    async compare(id){const next=await request('/api/listening/drafts');if(next.storeId!==view.storeId)throw new Error('数据目录身份变化');view=next;notify();return next.drafts[id]||fresh(id);},
    async useRemote(id){
      if(busy||!confirm('采用远端草稿将替换本窗口该材料的未保存输入。请先比较远端内容；如需保留本地输入，请取消。确定继续？'))return false;
      busy=true;resolving=true;notify();
      try{await this.compare(id);items[id]=fresh(id);if(!Object.values(items).some(x=>x.pending||x.conflict))error='';}
      finally{busy=false;resolving=false;persist();notify();}
      return true;
    },
    recover(key){const backup=recovery.find(r=>r.key===key);if(!backup)return;for(const [id,x] of Object.entries(backup.snapshot.items)){
      if(!(x.dirty||x.pending||x.conflict))continue;
      if(items[id].dirty||items[id].pending||items[id].conflict)throw new Error('当前材料已有未完成输入，请先完成保存或处理冲突，不能直接覆盖。');items[id]={...structuredClone(x),roundId:x.roundId||`initial:${id}`};
    }persist();notify();},
    downloadLocal,
    async download(){const data=await request('/api/listening/drafts/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ielts-listening-drafts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);},
  };
}
