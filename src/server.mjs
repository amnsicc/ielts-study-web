import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {openStudyRecords} from './records/store.mjs';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const types={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.json':'application/json'};
export async function startStudyServer({port=4178,host='127.0.0.1',directory=path.join(root,'.local-data'),store}) {
  if(host!=='127.0.0.1')throw new Error('仅允许本机127.0.0.1。');
  const catalog=JSON.parse(await readFile(path.join(root,'data/catalog.json'),'utf8'));
  const materials=JSON.parse(await readFile(path.join(root,'data/materials.json'),'utf8'));
  const entryIds=new Set(catalog.flatMap(g=>[g.id,...(g.extras||[]).map(e=>e.id)]));
  const materialIds=new Set(materials.map(m=>m.id));
  const records=store||await openStudyRecords({directory});
  let url;
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try {
      const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
      if(name.startsWith('/api/')) {
        if(req.headers.host!==new URL(url).host || (req.headers.origin && req.headers.origin!==url) || req.headers['sec-fetch-site']==='cross-site') {json(403,{error:'拒绝跨源记录请求。'});return;}
        if(req.method==='GET' && name==='/api/records'){json(200,await records.read());return;}
        if(req.method==='GET' && name==='/api/records/export') {
          res.setHeader('Content-Disposition','attachment; filename="ielts-study-records.json"');
          json(200,await records.export());return;
        }
        if(req.method==='POST' && name==='/api/records/operations') {
          if(req.headers.origin!==url || req.headers['content-type']?.split(';')[0]!=='application/json') {json(403,{error:'写入需要同源JSON请求。'});return;}
          let text='';
          for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>8192){json(413,{error:'请求过大。'});return;}}
          let operation;
          try {operation=JSON.parse(text);}catch{json(400,{error:'无效JSON。'});return;}
          if(!operation||typeof operation!=='object'||!['reading','listening','writing','speaking'].includes(operation.module)||
            (operation.type==='open'?!materialIds.has(operation.materialId):!entryIds.has(operation.entryId))) {json(400,{error:'记录对象无效。'});return;}
          try {json(200,await records.apply(operation));}catch(error){json(400,{error:error.message});}return;
        }
        json(404,{error:'接口不存在。'});return;
      }
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      const relative=name==='/'?'index.html':name.slice(1);
      if(['src/records/store.mjs','src/server.mjs'].includes(relative)){res.writeHead(404);res.end();return;}
      if(relative!=='index.html' && !relative.startsWith('src/') && !relative.startsWith('data/')){res.writeHead(404);res.end();return;}
      const target=path.resolve(root,relative);
      if(!target.startsWith(root+path.sep)||!types[path.extname(target)]){res.writeHead(404);res.end();return;}
      const bytes=await readFile(target);res.writeHead(200,{'Content-Type':`${types[path.extname(target)]}; charset=utf-8`});res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){json(503,{error:`记录或资源不可用：${error.message}`});}
  });
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});}
  catch(error){await records.close();throw error;}
  url=`http://${host}:${server.address().port}`;
  return {url,async close(){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await records.close();}};
}
