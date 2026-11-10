import {spawnSync,fork} from 'node:child_process';
import {mkdirSync,writeFileSync,appendFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),output=path.resolve(args[args.indexOf('--output')+1]);mkdirSync(output,{recursive:false});
const directory=path.join(output,'records-data');mkdirSync(directory);
const session=`ielts-l3-r1-${Date.now()}`,cli=process.env.AGENT_BROWSER_EXE||'D:/NodeTools/npm-global/node_modules/agent-browser/bin/agent-browser-win32-x64.exe';
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
 await start();command('--executable-path',chrome,'open',url+'/#/listening');command('wait','#listening-audio');saved();command('wait','--fn','!document.querySelector("#check-listening").disabled');
 command('fill','[data-answer-for="word:1"]','1、2');command('click','#check-listening');command('wait','--fn','document.querySelector("#practice-summary").textContent.includes("50%")');
 assert.equal(evaluate('document.querySelector("#practice-summary").textContent'),'首次核对：正确率 50% · 答对 1个 · 共7个');check('agent-browser实际填写核对，主摘要三项准确');
 command('click','#listening-history');assert.ok(evaluate('document.querySelector(".history-round summary").textContent').includes('答对 1个 · 共7个'));capture('history.png');command('press','Escape');check('历史同样精简，Escape关闭及原结果保持');
 command('click','[data-target-id="word:1"] .answer-feedback summary');command('focus','[data-sentence-target="word:1"]');command('press','Enter');command('wait','--fn','CSS.highlights.has("listening-sentence")');
 assert.ok(evaluate('[...CSS.highlights.get("listening-sentence")][0].toString()').startsWith('The aim is'));assert.equal(evaluate('document.querySelector("#article-scroll").hidden'),false);capture('sentence.png');check('真实CLI键盘原句入口展开定位整句');
 evaluate('document.querySelector("audio").currentTime=12');saved();command('click','[data-sentence-target="word:1"]');assert.ok(Math.abs(evaluate('document.querySelector("audio").currentTime')-12)<.05);assert.equal(evaluate('document.querySelector("audio").paused'),true);check('定位保持暂停进度，不改作答');
 command('select','#material-select','listening:long');saved();command('fill','[data-answer-for="word:4"]','16、19');command('click','#check-listening');command('wait','--fn','document.querySelector("#practice-summary").textContent.includes("共39个")');
 assert.equal(evaluate('document.querySelector("#practice-summary").textContent'),'首次核对：正确率 100% · 答对 2个 · 共39个');capture('long-total.png');check('长篇共39个包含重复事件，正确率仍按已填序号计算');
 const errors=command('errors');assert.deepEqual(errors.errors,[]);
 writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',url,session,checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,output}));
}catch(error){writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'failed',url,session,checks,error:error.stack},null,2));try{capture('failure.png');}catch{}console.error(error);process.exitCode=1;}
finally{try{command('close');}catch{}if(child?.connected)await stop();}
