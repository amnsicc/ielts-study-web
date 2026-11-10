import {spawnSync,fork} from 'node:child_process';
import {mkdirSync,writeFileSync,appendFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),output=path.resolve(args[args.indexOf('--output')+1]);mkdirSync(output,{recursive:false});
const directory=path.join(output,'records-data');mkdirSync(directory);
const session=`ielts-l2-${Date.now()}`,cli=process.env.AGENT_BROWSER_EXE||'D:/NodeTools/npm-global/node_modules/agent-browser/bin/agent-browser-win32-x64.exe';
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
let child,url;const checks=[];
function command(...a){const full=['--session',session,'--json',...a],r=spawnSync(cli,full,{encoding:'utf8',windowsHide:true,timeout:30000});
 appendFileSync(path.join(output,'commands.jsonl'),JSON.stringify({at:new Date().toISOString(),command:[cli,...full],exit:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.message})+'\n');
 assert.equal(r.status,0,r.stderr||r.stdout||r.error?.message);const j=JSON.parse(r.stdout);assert.equal(j.success,true,JSON.stringify(j));return j.data;}
const evaluate=s=>command('eval','-b',Buffer.from(s).toString('base64')).result;
const check=(name,detail)=>{checks.push({name,passed:true,detail});console.log(name);};
const capture=name=>command('screenshot',path.join(output,name));
const saved=()=>command('wait','--fn',`document.querySelector('#draft-status').textContent==='草稿已保存（本机）'`);
async function start(){child=fork(new URL('./listening-test-server.mjs',import.meta.url),[directory,'0'],{silent:true});
 child.stdout.on('data',d=>appendFileSync(path.join(output,'server.log'),d));child.stderr.on('data',d=>appendFileSync(path.join(output,'server.log'),d));
 url=(await new Promise((r,j)=>{child.once('message',r);child.once('error',j);})).url;}
async function stop(){const done=new Promise(r=>child.once('exit',r));child.send('close');await done;}
try{
 await start();command('--executable-path',chrome,'open',url+'/#/listening');command('wait','#listening-audio');
 command('wait','--fn','document.querySelector("#clip-availability").textContent.includes("可播放一次")');saved();
 const snapshot=command('snapshot','-i');writeFileSync(path.join(output,'snapshot-initial.json'),JSON.stringify(snapshot,null,2));
 assert.equal(evaluate('document.querySelector("#clip-controls").hidden'),true);check('初始不显示选段管理条，L1-R1精简界面保持');
 command('click','#toggle-transcript');
 evaluate(`(()=>{const p=document.querySelector('.article-paragraph');p.focus();getSelection().collapse(p.firstChild,0);})()`);
 command('press','Shift+ArrowRight');command('press','Shift+ArrowRight');
 assert.equal(evaluate('document.querySelector("#clip-selection").textContent'),'Before');
 command('focus','#clip-once');command('press','Enter');command('wait','--fn','document.querySelector("#clip-status").textContent==="选段播放结束"');
 assert.equal(evaluate('document.querySelector("audio").paused'),true);check('agent-browser真实方向键选择、Enter执行单播及末词停止');
 command('click','#clip-loop');command('wait','--fn','!document.querySelector("audio").paused');
 assert.equal(evaluate('document.querySelector("#clip-status").textContent'),'循环播放中');command('click','#clip-exit');
 assert.equal(evaluate('document.querySelector("audio").paused'),true);assert.equal(evaluate('document.activeElement.id'),'toggle-transcript');check('循环及退出和焦点返回可操作');
 for(const [width,height] of [[1440,1000],[1042,811],[900,700],[497,811]]){
  command('set','viewport',String(width),String(height));
  evaluate(`(()=>{const p=document.querySelector('.article-paragraph');p.focus();getSelection().collapse(p.firstChild,0);})()`);command('press','Shift+ArrowRight');
  command('scrollintoview','#clip-controls');
  assert.ok(evaluate('document.querySelector("#article-scroll").clientHeight')>=120);
  capture('clip-'+width+'.png');check(width+'选段和正文均保留可交互区域');
 }
 const errors=command('errors');assert.deepEqual(errors.errors,[]);
 writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',url,session,checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,output}));
}catch(error){writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'failed',url,session,checks,error:error.stack},null,2));try{capture('failure.png');}catch{}console.error(error);process.exitCode=1;}
finally{try{command('close');}catch{}if(child?.connected)await stop();}
