import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

test('HTTP真实写入/导出，服务关闭重开读回，非法身份和跨源拒绝',async()=>{
  const {startStudyServer}=await import('../src/server.mjs');
  const directory=await mkdtemp(path.join(os.tmpdir(),'ielts-http-'));
  let s=await startStudyServer({port:0,directory});
  const post=(body,origin=s.url)=>fetch(s.url+'/api/records/operations',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
  try {
    const op={operationId:'http-a',type:'forget',module:'reading',entryId:'word:1'};
    assert.equal((await post(op)).status,200);assert.equal((await post(op)).status,200);
    assert.equal((await (await fetch(s.url+'/api/records')).json()).counts.reading['word:1'],1);
    assert.equal((await post({...op,operationId:'bad',entryId:'word:999'})).status,400);
    assert.equal((await post({...op,operationId:'cross'},'https://untrusted.example')).status,403);
    assert.equal((await fetch(s.url+'/.local-data/study-events.jsonl')).status,404);
    assert.equal((await (await fetch(s.url+'/api/records/export')).json()).events.length,1);
    await s.close();s=await startStudyServer({port:0,directory});
    assert.equal((await (await fetch(s.url+'/api/records')).json()).counts.reading['word:1'],1);
  }finally{await s.close();}
});

test('新增API不阻断首页与模块资源，记录和服务器源码不作为公开资源',async()=>{
  const {startStudyServer}=await import('../src/server.mjs');
  const s=await startStudyServer({port:0,directory:await mkdtemp(path.join(os.tmpdir(),'ielts-static-'))});
  try{
    for(const relative of ['/','/src/app.mjs','/data/catalog.json'])assert.equal((await fetch(s.url+relative)).status,200);
    for(const relative of ['/.local-data/study-events.jsonl','/src/records/store.mjs','/src/server.mjs'])assert.equal((await fetch(s.url+relative)).status,404);
  }finally{await s.close();}
});

test('实际CLI输入stop正常关闭释放锁，同目录第二次启动成功',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'ielts-cli-'));
  for(let n=0;n<2;n++){
    const child=spawn(process.execPath,['scripts/serve.mjs','--port','4198','--data-dir',directory],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    let output='';
    const exit=new Promise(resolve=>child.once('exit',resolve));
    await new Promise((resolve,reject)=>{
      child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('http://'))resolve();});
      child.stderr.on('data',chunk=>{output+=chunk;});
      child.once('exit',()=>reject(new Error(output)));
    });
    child.stdin.end('stop\n');
    let timer;
    try{assert.equal(await Promise.race([exit,new Promise((_,reject)=>{timer=setTimeout(()=>{child.kill();reject(new Error('输入stop后服务未正常退出'));},1500);})]),0);}
    finally{clearTimeout(timer);}
  }
});
