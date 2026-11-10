export function createRecordsClient() {
  let view=null,busy=false,error='',pending=[];
  const listeners=new Set();
  const notify=()=>listeners.forEach(listener=>listener({view,busy,error,pending:pending.length}));
  async function request(url,options) {
    const response=await fetch(url,options);
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'记录请求失败。');
    return result;
  }
  const accept=next=>{if(!view||next.revision>=view.revision)view=next;};
  async function run() {
    if(busy)return;
    busy=true;error='';notify();
    try {
      while(pending.length){accept(await request('/api/records/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending[0])}));pending.shift();notify();}
    }catch(failure){error=failure.message;}
    finally{busy=false;notify();if(pending.length&&!error)void run();}
  }
  async function refresh() {
    if(busy||pending.length)return;
    busy=true;error='';notify();
    try{accept(await request('/api/records'));}catch(failure){error=failure.message;}
    finally{busy=false;notify();if(pending.length&&!error)void run();}
  }
  return {
    subscribe(listener){listeners.add(listener);listener({view,busy,error,pending:pending.length});return ()=>listeners.delete(listener);},
    refresh,
    mutate(operation){pending.push({operationId:crypto.randomUUID(),module:'reading',...operation});void run();},
    retry(){if(pending.length)void run();else void refresh();},
    async download(){
      if(busy||pending.length||error||!view)throw new Error('请先完成记录读取或保存重试。');
      await request('/api/records/export');
      const a=document.createElement('a');
      a.href='/api/records/export';a.download='ielts-study-records.json';a.click();
    },
  };
}
