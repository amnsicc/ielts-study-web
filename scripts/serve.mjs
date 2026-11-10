import {startStudyServer} from '../src/server.mjs';
const value=name=>process.argv[process.argv.indexOf(name)+1];
try {
  const port=process.argv.includes('--port')?Number(value('--port')):4178;
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('端口无效。');
  const server=await startStudyServer({port,host:process.argv.includes('--host')?value('--host'):'127.0.0.1',
    ...(process.argv.includes('--data-dir')?{directory:value('--data-dir')}: {})});
  console.log(`雅思学习区 L1-R1: ${server.url}`);
  let closing=false;
  async function shutdown(){
    if(closing)return;closing=true;
    try{await server.close();console.log('记录服务已正常关闭。');}
    catch(error){console.error(error.message);process.exitCode=1;}
    finally{process.stdin.destroy();}
  }
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void shutdown());
  process.stdin.setEncoding('utf8');let input='';
  process.stdin.on('data',chunk=>{input+=chunk;if(input.split(/\r?\n/).some(line=>line.trim()==='stop'))void shutdown();});
  console.log('停止：在此窗口输入 stop 后回车，等待正常关闭；或交互终端 Ctrl+C。');
}catch(error){console.error(`启动失败：${error.message}`);process.exitCode=1;}
