import {spawnSync,fork} from 'node:child_process';
import {mkdirSync,writeFileSync,appendFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),output=path.resolve(args[args.indexOf('--output')+1]);mkdirSync(output,{recursive:false});
const directory=path.join(output,'records-data');mkdirSync(directory);
const session=`ielts-l3-${Date.now()}`,cli=process.env.AGENT_BROWSER_EXE||'D:/NodeTools/npm-global/node_modules/agent-browser/bin/agent-browser-win32-x64.exe';
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
 await start();command('--executable-path',chrome,'open',url+'/#/listening');command('wait','#listening-audio');saved();
 command('wait','--fn','!document.querySelector("#check-listening").disabled');
 assert.equal(evaluate('document.querySelector("#practice-round").textContent'),'第1轮');assert.equal(evaluate('document.querySelector("#practice-summary").hidden'),true);
 check('首次页面无假成绩，仅提供核对、新轮和历史必要入口');
 writeFileSync(path.join(output,'snapshot.json'),JSON.stringify(command('snapshot','-i'),null,2));
 command('fill','[data-answer-for="word:1"]','1、2');command('click','#check-listening');command('wait','--fn','document.querySelector("#practice-summary").textContent.includes("50%")');
 let state=await (await fetch(url+'/api/listening/practice')).json();assert.equal(state.materials['listening:short'].rounds[0].first.result.percentage,50);capture('first.png');check('agent-browser填写后直接核对，保存完成后显示首次50%');
 command('fill','[data-answer-for="word:1"]','1');command('focus','#check-listening');command('press','Enter');command('wait','--fn','document.querySelector("#practice-summary").textContent.includes("第1次订正")');
 state=await (await fetch(url+'/api/listening/practice')).json();assert.equal(state.materials['listening:short'].rounds[0].first.result.percentage,50);assert.equal(state.materials['listening:short'].rounds[0].corrections[0].result.percentage,100);check('键盘核对订正不覆盖首次，服务端可读回');
 command('click','#listening-history');command('wait','#practice-history-dialog');assert.ok(evaluate('document.querySelector("#practice-history-dialog").textContent').includes('首次核对'));capture('history.png');command('press','Escape');assert.equal(evaluate('document.activeElement.id'),'listening-history');check('历史只读查看、Escape关闭及焦点返回');
 command('click','.reset-view');saved();assert.equal(evaluate('document.querySelector("#practice-round").textContent'),'第1轮');assert.ok(evaluate('document.querySelector("#practice-summary").textContent').includes('50%'));check('模块重置只改界面，不重开轮次或清结果');
 command('reload');saved();command('wait','--fn','document.querySelector("#practice-summary").textContent.includes("第1次订正")');assert.equal(evaluate('document.querySelector(".answer-input").value'),'1');check('刷新后当前草稿、首次及订正恢复');
 const errors=command('errors');assert.deepEqual(errors.errors,[]);
 writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',url,session,checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,output}));
}catch(error){writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'failed',url,session,checks,error:error.stack},null,2));try{capture('failure.png');}catch{}console.error(error);process.exitCode=1;}
finally{try{command('close');}catch{}if(child?.connected)await stop();}
