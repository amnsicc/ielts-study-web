// Only an isolated verification helper. No failure toggles exist in the product HTTP API.
import {startStudyServer} from '../src/server.mjs';
import {openStudyRecords} from '../src/records/store.mjs';
import {access} from 'node:fs/promises';
import path from 'node:path';
const directory=process.argv[2];
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
const store=await openStudyRecords({directory,append:async(handle,text)=>{
  if(await exists(path.join(directory,'fail-before')))throw new Error('测试目录写入失败');
  await handle.writeFile(text);await handle.sync();
}});
const server=await startStudyServer({port:Number(process.argv[3]||0),directory,store:{...store,async apply(operation){
  const result=await store.apply(operation);
  if(await exists(path.join(directory,'lose-response')))throw new Error('测试：写入成功但回执丢失');
  return result;
},async read(){
  while(await exists(path.join(directory,'hold-read')))await new Promise(resolve=>setTimeout(resolve,20));
  return store.read();
}}});
process.send?.({url:server.url});
process.on('message',async message=>{if(message==='close'){await server.close();process.disconnect();}});
