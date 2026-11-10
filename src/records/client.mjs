export function createRecordsClient(module = 'reading') {
  let view=null,busy=false,error='',pending=[];
  let completedOperationId=null,failedOperationId=null,failureCode='';
  const listeners=new Set();
  const state=()=>({view,busy,error,pending:pending.length,completedOperationId,failedOperationId,failureCode});
  const notify=()=>listeners.forEach(listener=>listener(state()));
  async function request(url,options) {
    const response=await fetch(url,options);
    const result=await response.json();
    if(!response.ok){const failure=new Error(result.error||'记录请求失败。');failure.code=result.code;throw failure;}
    return result;
  }
  const accept=next=>{if(!view||next.revision>=view.revision)view=next;};
  async function run() {
    if(busy)return;
    busy=true;error='';failedOperationId=null;failureCode='';notify();
    try {
      while(pending.length){accept(await request('/api/records/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending[0])}));completedOperationId=pending.shift().operationId;notify();}
    }catch(failure){error=failure.message;failedOperationId=pending[0]?.operationId;failureCode=failure.code||'';if(failureCode==='COUNT_CONFLICT')pending.shift();}
    finally{busy=false;notify();if(pending.length&&!error)void run();}
  }
  async function refresh() {
    if(busy||pending.length)return;
    busy=true;error='';notify();
    try{accept(await request('/api/records'));}catch(failure){error=failure.message;}
    finally{busy=false;notify();if(pending.length&&!error)void run();}
  }
  return {
    subscribe(listener){listeners.add(listener);listener(state());return ()=>listeners.delete(listener);},
    refresh,
    mutate(operation){const next={operationId:crypto.randomUUID(),module,...operation};pending.push(next);void run();return next.operationId;},
    retry(){if(pending.length)void run();else void refresh();},
    async download(){
      if(busy||pending.length||error||!view)throw new Error('请先完成记录读取或保存重试。');
      await request('/api/records/export');
      const a=document.createElement('a');
      a.href='/api/records/export';a.download='ielts-study-records.json';a.click();
    },
  };
}
