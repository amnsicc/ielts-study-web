// Isolated verification only; failure switches are never product HTTP endpoints.
import {openStudyRecords} from '../src/records/store.mjs';
import {openListeningDrafts} from '../src/listening/drafts-store.mjs';
import {startStudyServer} from '../src/server.mjs';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
const directory=process.argv[2],exists=async name=>{try{await access(path.join(directory,name));return true;}catch{return false;}};
const materials=JSON.parse(await readFile(new URL('../data/listening-materials.json',import.meta.url),'utf8'));
const records=await openStudyRecords({directory,append:async(h,text)=>{
  if(await exists('count-fail-before'))throw new Error('测试次数写前失败');
  await h.writeFile(text);await h.sync();
}});
const drafts=await openListeningDrafts({directory,materials,append:async(h,text)=>{
  if(await exists('draft-fail-before'))throw new Error('测试草稿写前失败');
  await h.writeFile(text);await h.sync();
}});
const server=await startStudyServer({port:Number(process.argv[3]||0),directory,store:records,draftStore:{...drafts,async apply(op){
  while(await exists('draft-hold'))await new Promise(r=>setTimeout(r,20));
  const result=await drafts.apply(op);if(await exists('draft-lose-response'))throw new Error('测试草稿回执丢失');return result;
},async read(){if(await exists('draft-read-fail'))throw new Error('测试草稿读取失败');return drafts.read();}}});
process.send?.({url:server.url});
process.on('message',async message=>{if(message==='close'){await server.close();process.disconnect();}});
