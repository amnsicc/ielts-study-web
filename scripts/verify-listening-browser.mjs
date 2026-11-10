import {spawnSync,fork} from 'node:child_process';
import {mkdirSync,writeFileSync,appendFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),value=n=>args[args.indexOf(n)+1];
if(!args.includes('--output'))throw new Error('需要新的--output证据目录');
const output=path.resolve(value('--output'));mkdirSync(output,{recursive:false});
const directory=path.join(output,'records-data');mkdirSync(directory);
const session=`ielts-l1-${Date.now()}`,cli=process.env.AGENT_BROWSER_EXE||'D:/NodeTools/npm-global/node_modules/agent-browser/bin/agent-browser-win32-x64.exe';
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
let child,url;const checks=[];
function command(...a){const full=['--session',session,'--json',...a],r=spawnSync(cli,full,{encoding:'utf8',windowsHide:true,timeout:30000});
  appendFileSync(path.join(output,'commands.jsonl'),JSON.stringify({at:new Date().toISOString(),command:[cli,...full],exit:r.status,stdout:r.stdout,stderr:r.stderr,error:r.error?.message})+'\n');
  assert.equal(r.status,0,r.stderr||r.stdout||r.error?.message);const j=JSON.parse(r.stdout);assert.equal(j.success,true,JSON.stringify(j));return j.data;}
const evaluate=s=>command('eval','-b',Buffer.from(s).toString('base64')).result;
const check=(name,detail)=>{checks.push({name,passed:true,detail});console.log(name);};
const capture=name=>command('screenshot',path.join(output,name));
const selected=id=>evaluate(`document.querySelector(${JSON.stringify(id)}).value`);
const saved=()=>command('wait','--fn',`document.querySelector('#draft-status').textContent==='草稿已保存（本机）'`);
const loaded=()=>command('wait','--fn','document.querySelector("audio").readyState>=2&&!document.querySelector("#rewind-audio").disabled');
const read=async()=> (await fetch(url+'/api/listening/drafts')).json();
const answer=(id='word:1')=>`[data-answer-for="${id}"]`;
async function start(port=0){child=fork(new URL('./listening-test-server.mjs',import.meta.url),[directory,String(port)],{silent:true});
 child.stdout.on('data',d=>appendFileSync(path.join(output,'server.log'),d));child.stderr.on('data',d=>appendFileSync(path.join(output,'server.log'),d));
 url=(await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',c=>reject(new Error(`测试服务退出${c}`)));})).url;}
async function stop(){const done=new Promise(r=>child.once('exit',r));child.send('close');await done;}
try{
 await start();command('--executable-path',chrome,'open',url);command('set','viewport','1440','1000');command('click','.module-listening');command('wait','#listening-audio');loaded();saved();
 assert.equal(evaluate('document.querySelectorAll(".answer-row").length'),7);
 assert.equal(selected('#rewind-step'),'5');assert.equal(selected('#listening-voice'),'en-US-JennyNeural');
 assert.equal(evaluate('document.querySelector("#article-scroll").hidden'),true);capture('01-default.png');
 check('首页进入真实听力，7目标/默认美音/原稿收起/5秒回退');
 for(const n of [1,3,5,10]){
  command('select','#rewind-step',String(n));evaluate('document.querySelector("audio").currentTime=20');command('wait','--fn','Math.abs(document.querySelector("audio").currentTime-20)<.1');
  command('click','#rewind-audio');assert.ok(Math.abs(evaluate('document.querySelector("audio").currentTime')-(20-n))<.1);
 }
 evaluate('document.querySelector("audio").currentTime=2');command('select','#rewind-step','10');command('click','#rewind-audio');assert.ok(evaluate('document.querySelector("audio").currentTime')<.1);
 command('select','#listening-speed','1.25');assert.equal(evaluate('document.querySelector("audio").playbackRate'),1.25);
 evaluate('document.querySelector("audio").play()');command('wait','--fn','document.querySelector("audio").currentTime>0.4');
 assert.equal(evaluate('document.querySelector("audio").paused'),false);
 command('click','#restart-audio');command('wait','--fn','!document.querySelector("audio").paused');assert.ok(evaluate('document.querySelector("audio").currentTime')<1);evaluate('document.querySelector("audio").pause()');
 check('真实音频进度四档回退及到0边界、倍速和播放前进/从头重听正确');
 command('fill',answer(),'2、7 ? ');saved();assert.equal((await read()).drafts['listening:short'].answers['word:1'],'2、7 ? ');
 assert.equal(evaluate('document.activeElement.dataset.answerFor'),'word:1');
 command('check','#question-meanings');assert.equal(evaluate('document.querySelector(".question-meaning").open'),true);
 command('select','#global-display','none');assert.equal(evaluate('document.querySelector(".answer-word").textContent.includes("atmosphere")'),true);
 check('多号/问号原字符串保存，保存回执保持输入焦点，左右显隐互不影响');
 command('select','#listening-voice','en-US-GuyNeural');loaded();saved();assert.equal(selected(answer()),'2、7 ? ');
 assert.ok(Math.abs(evaluate('document.querySelector("audio").duration')-80.736)<.2);
 assert.equal(evaluate('document.querySelector("audio").paused'),true);
 command('select','#material-select','listening:long');loaded();saved();
 assert.equal(evaluate('document.querySelectorAll(".answer-row").length'),34);assert.equal(selected('#listening-voice'),'en-GB-SoniaNeural');
 command('fill',answer(),'34');saved();command('select','#material-select','listening:short');loaded();saved();assert.equal(selected(answer()),'2、7 ? ');
 check('同稿换声音保留答案，长篇34目标/已有英音，材料间草稿独立恢复');
 command('click','#toggle-transcript');assert.equal(evaluate('document.querySelector("#article-scroll").hidden'),false);
 assert.equal(evaluate('document.querySelectorAll(".article-target").length'),7);command('uncheck','#target-highlight');
 assert.equal(evaluate('getComputedStyle(document.querySelector(".article-target")).backgroundColor'),'rgba(0, 0, 0, 0)');
 capture('02-transcript.png');check('原稿展开、高亮关闭及实际目标登记正确');
 command('click','.reset-view');loaded();saved();assert.equal(selected('#rewind-step'),'5');assert.equal(selected(answer()),'2、7 ? ');
 command('click','[data-forget="word:1"]');command('wait','--fn','document.querySelector("#record-status").textContent==="记录已保存（本机）"');
 const counts=await (await fetch(url+'/api/records')).json();assert.equal(counts.counts.listening['word:1'],1);assert.equal(counts.counts.reading['word:1']||0,0);
 command('click','[data-edit-count="word:1"]');command('fill','#count-edit-value','8');command('click','#save-count-edit');command('wait','--fn','!document.querySelector("#count-edit-dialog").open');
 assert.equal((await (await fetch(url+'/api/records')).json()).counts.listening['word:1'],8);
 check('界面重置不清草稿，听力次数增加/直接编辑不影响阅读');
 evaluate('document.querySelector("audio").play()');command('wait','--fn','document.querySelector("audio").currentTime>.4');
 command('click','.back-link');assert.equal(evaluate('document.querySelector("audio")===null'),true);
 command('click','.module-listening');command('wait','#listening-audio');assert.equal(evaluate('document.querySelector("audio").paused'),true);saved();assert.equal(selected(answer()),'2、7 ? ');
 check('返回首页停止旧原音，重进保留当前草稿且不自动播放');
 writeFileSync(path.join(directory,'draft-hold'),'isolated');command('fill',answer(),'1');command('wait','--fn','document.querySelector("#draft-status").textContent.includes("正在保存")');
 command('fill',answer(),'1、2、3?');unlinkSync(path.join(directory,'draft-hold'));saved();
 assert.equal(selected(answer()),'1、2、3?');assert.equal((await read()).drafts['listening:short'].answers['word:1'],'1、2、3?');
 check('旧保存回执不覆盖输入中更新，最新草稿最终保存');
 writeFileSync(path.join(directory,'draft-fail-before'),'isolated');command('fill',answer(),'9 ?');command('wait','--fn','document.querySelector("#draft-status").textContent.includes("写前失败")');
 assert.equal(selected(answer()),'9 ?');capture('03-write-failure.png');
 assert.equal(selected(answer()),'9 ?');unlinkSync(path.join(directory,'draft-fail-before'));command('click','#retry-drafts');saved();assert.equal((await read()).drafts['listening:short'].answers['word:1'],'9 ?');
 command('reload');command('wait','#listening-audio');loaded();saved();assert.equal(selected(answer()),'9 ?');
 check('写前失败保留输入与本地待办，原操作重试成功，已存稿刷新恢复');
 const revisionBefore=(await read()).revision;writeFileSync(path.join(directory,'draft-lose-response'),'isolated');command('fill',answer(),'11');command('wait','--fn','document.querySelector("#draft-status").textContent.includes("回执丢失")');
 const revisionWritten=(await read()).revision;assert.equal(revisionWritten,revisionBefore+1);unlinkSync(path.join(directory,'draft-lose-response'));command('click','#retry-drafts');saved();assert.equal((await read()).revision,revisionWritten);
 check('已写回执丢失重试幂等，不重复追加');
 writeFileSync(path.join(directory,'draft-fail-before'),'isolated');command('fill',answer(),'22');command('wait','--fn','document.querySelector("#draft-status").textContent.includes("写前失败")');unlinkSync(path.join(directory,'draft-fail-before'));
 command('tab','new',url+'/#/listening');command('wait','#listening-audio');loaded();saved();command('fill',answer(),'21');saved();
 command('tab','t1');command('click','#retry-drafts');command('wait','--fn','document.querySelector("#draft-status").textContent.includes("冲突")');
 assert.equal(selected(answer()),'22');assert.equal((await read()).drafts['listening:short'].answers['word:1'],'21');command('click','#compare-drafts');command('wait','--fn','!document.querySelector("#remote-draft").hidden');assert.ok(evaluate('document.querySelector("#remote-draft").textContent').includes('21'));
 capture('04-conflict.png');command('click','#use-remote-drafts');command('dialog','accept');saved();assert.equal(selected(answer()),'21');
 command('tab','t2');command('tab','close');check('双标签旧稿拒绝覆盖，本地/远端可比较，明确采用远端后恢复');
 const port=Number(new URL(url).port);await stop();await start(port);command('reload');command('wait','#listening-audio');loaded();saved();assert.equal(selected(answer()),'21');
 check('真实服务正常关闭重开后草稿和身份保持');
 for(const [width,height] of [[1440,1000],[1280,720],[900,700],[497,811]]){
  command('set','viewport',String(width),String(height));
  assert.ok(evaluate('document.documentElement.scrollWidth')<=width);
  assert.ok(evaluate('document.querySelector(".listening-layout").scrollWidth<=document.querySelector(".listening-layout").clientWidth'));
  capture(`05-layout-${width}.png`);check(`${width}×${height}听力布局与控件可达，无横向溢出`);
 }
 const errors=command('errors');assert.deepEqual(errors.errors,[]);writeFileSync(path.join(output,'browser-errors.json'),JSON.stringify(errors,null,2));
 writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',url,session,checks},null,2));
 console.log(JSON.stringify({status:'passed',checks:checks.length,output}));
}catch(error){writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'failed',url,session,checks,error:error.stack},null,2));try{capture('failure.png');}catch{}console.error(error);process.exitCode=1;}
finally{try{command('close');}catch{}if(child?.connected)await stop();}
