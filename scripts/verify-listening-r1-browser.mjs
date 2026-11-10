import {spawnSync,fork} from 'node:child_process';
import {mkdirSync,writeFileSync,appendFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),output=path.resolve(args[args.indexOf('--output')+1]);mkdirSync(output,{recursive:false});
const directory=path.join(output,'records-data');mkdirSync(directory);
const session=`ielts-l1-r1-${Date.now()}`,cli=process.env.AGENT_BROWSER_EXE||'D:/NodeTools/npm-global/node_modules/agent-browser/bin/agent-browser-win32-x64.exe';
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
 await start();command('--executable-path',chrome,'open',url+'/#/listening');command('set','viewport','1440','1000');
 command('wait','--fn','document.querySelector("audio")?.readyState>=2');saved();
 // One user action seam: change the integrated rewind step, then use that action.
 assert.equal(evaluate('document.querySelector("#rewind-control")?.getAttribute("role")'),'group');
 for(const n of [1,3,5,10]){
  evaluate('document.querySelector("audio").currentTime=20');command('wait','--fn','Math.abs(document.querySelector("audio").currentTime-20)<.1');
  command('select','#rewind-step',String(n));assert.equal(evaluate('document.querySelector("#rewind-audio").textContent'),`回退${n}秒`);
  assert.ok(Math.abs(evaluate('document.querySelector("audio").currentTime')-20)<.1);
  command('click','#rewind-audio');assert.ok(Math.abs(evaluate('document.querySelector("audio").currentTime')-(20-n))<.1);
 }
 check('整体回退控件四档文案、选档不跳进度、点击按当前步长真实回退');
 const removed=['refresh-records','export-records','refresh-drafts','export-local-drafts','export-drafts'];
 assert.deepEqual(evaluate(`(${JSON.stringify(removed)}).filter(id=>document.getElementById(id))`),[]);
 const ax=command('snapshot','-i');writeFileSync(path.join(output,'normal-snapshot.json'),JSON.stringify(ax,null,2));
 for(const text of ['刷新记录','导出记录','刷新草稿','导出本地稿','导出已存草稿'])assert.equal(ax.snapshot.includes(text),false);
 assert.equal(evaluate('document.querySelector(".draft-actions").hidden'),true);
 assert.equal(evaluate('document.querySelector("#record-status").closest(".word-toolbar")!==null'),true);
 assert.equal(evaluate('document.querySelector("#draft-status").closest(".panel-toolbar")!==null'),true);
 check('五个常规入口从DOM及无障碍树移除，正常无空白按钮栏，状态合入标题');
 command('fill','[data-answer-for="word:1"]','2、7 ?');saved();
 assert.equal((await (await fetch(url+'/api/listening/drafts')).json()).drafts['listening:short'].answers['word:1'],'2、7 ?');
 command('click','[data-forget="word:1"]');command('wait','--fn','document.querySelector("#record-status").textContent==="记录已保存（本机）"');
 assert.equal((await (await fetch(url+'/api/records')).json()).counts.listening['word:1'],1);
 check('去掉常规按钮后草稿自动保存和次数自动写入仍可用');
 command('focus','#rewind-step');command('press','Home');command('press','Enter');
 assert.equal(evaluate('document.querySelector("#rewind-step").value'),'1');
 command('focus','#rewind-audio');command('press','Enter');
 command('click','.reset-view');command('wait','--fn','document.querySelector("audio").readyState>=2');saved();
 assert.equal(evaluate('document.querySelector("#rewind-audio").textContent'),'回退5秒');
 check('原生选档与主按钮可用键盘操作，重置恢复回退5秒');
 for(const [width,height] of [[1440,1000],[1042,811],[900,700],[497,811]]){
  command('set','viewport',String(width),String(height));
  const bounds=evaluate(`(() => {const g=document.querySelector('#rewind-control').getBoundingClientRect(),b=document.querySelector('#rewind-audio').getBoundingClientRect(),s=document.querySelector('#rewind-step').getBoundingClientRect();return {group:{x:g.x,right:g.right,top:g.top,bottom:g.bottom},button:{right:b.right,top:b.top,bottom:b.bottom},select:{left:s.left,top:s.top,bottom:s.bottom},page:document.documentElement.scrollWidth,width:innerWidth};})()`);
  assert.ok(Math.abs(bounds.button.right-bounds.select.left)<3);
  assert.ok(Math.abs(bounds.button.top-bounds.select.top)<3&&Math.abs(bounds.button.bottom-bounds.select.bottom)<3);
  assert.ok(bounds.page<=width&&bounds.group.x>=0&&bounds.group.right<=width);capture(`r1-${width}.png`);
  check(`${width}×${height}回退整组相连且不被换行拆散，页面无横向溢出`,bounds);
 }
 command('set','viewport','1440','1000');
 command('scrollintoview','[data-edit-count="word:1"]');command('click','[data-edit-count="word:1"]');
 writeFileSync(path.join(directory,'count-fail-before'),'isolated');command('fill','#count-edit-value','17');command('click','#save-count-edit');
 command('wait','--fn','document.querySelector("#count-edit-status").textContent.includes("次数写前失败")');
 command('click','#cancel-count-edit');
 const failureFocus=evaluate('({id:document.activeElement.id,disabled:document.querySelector("[data-edit-count=\\"word:1\\"]").disabled,retryVisible:!document.querySelector("#retry-records").hidden})');
 assert.equal(failureFocus.id,'retry-records');assert.equal(failureFocus.disabled,true);assert.equal(failureFocus.retryVisible,true);
 assert.equal((await (await fetch(url+'/api/records')).json()).counts.listening['word:1'],1);
 capture('r1-count-failure.png');unlinkSync(path.join(directory,'count-fail-before'));command('press','Enter');
 command('wait','--fn','document.querySelector("#record-status").textContent==="记录已保存（本机）"');
 assert.equal((await (await fetch(url+'/api/records')).json()).counts.listening['word:1'],17);
 assert.equal(evaluate('document.querySelector(".record-bar").hidden'),true);
 check('移除词表常规按钮后失败关闭仍聚焦可用重试，原编辑禁用，恢复后状态收起',failureFocus);
 writeFileSync(path.join(directory,'draft-fail-before'),'isolated');command('fill','[data-answer-for="word:1"]','9 ?');
 command('wait','--fn','document.querySelector("#draft-status").textContent.includes("写前失败")');
 assert.equal(evaluate('document.querySelector(".draft-actions").hidden'),false);
 assert.equal(evaluate('document.querySelector("[data-answer-for=\\"word:1\\"]").value'),'9 ?');
 capture('r1-draft-failure.png');unlinkSync(path.join(directory,'draft-fail-before'));command('click','#retry-drafts');saved();
 assert.equal(evaluate('document.querySelector(".draft-actions").hidden'),true);
 check('草稿写前失败才出现重试，输入保留，成功后处理栏收起');
 writeFileSync(path.join(directory,'draft-read-fail'),'isolated');
 command('tab','new',url+'/#/listening');command('wait','--fn','document.querySelector("#draft-status")?.textContent.includes("读取失败")');
 assert.equal(evaluate('document.querySelector("[data-answer-for=\\"word:1\\"]").disabled'),true);
 assert.equal(evaluate('document.querySelector("#retry-drafts").hidden'),false);
 unlinkSync(path.join(directory,'draft-read-fail'));command('click','#retry-drafts');saved();
 assert.equal(evaluate('document.querySelector("[data-answer-for=\\"word:1\\"]").value'),'9 ?');
 assert.equal(evaluate('document.querySelector("[data-answer-for=\\"word:1\\"]").disabled'),false);
 command('tab','close');check('取消手动刷新后首次读取失败仍可明确重试，不冒充空草稿');
 const errors=command('errors');assert.deepEqual(errors.errors,[]);
 writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',url,session,checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,output}));
}catch(error){writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'failed',url,session,checks,error:error.stack},null,2));try{capture('failure.png');}catch{}console.error(error);process.exitCode=1;}
finally{try{command('close');}catch{}if(child?.connected)await stop();}
