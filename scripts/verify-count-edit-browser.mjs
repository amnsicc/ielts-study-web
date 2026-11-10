import {createRequire} from 'node:module';
import { spawnSync, fork } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync, unlinkSync, readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
if (!args.includes('--output')) throw new Error('需要 --output <尚不存在的证据目录>');
const output = path.resolve(value('--output'));
mkdirSync(output, { recursive: false });
const session = args.includes('--session') ? value('--session') : `ielts-d2b-r1-${Date.now()}`;
const cli = process.env.AGENT_BROWSER_EXE || 'D:/NodeTools/npm-global/node_modules/agent-browser/bin/agent-browser-win32-x64.exe';
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let url;
const checks = [];
function command(...commandArgs) {
  const full = ['--session', session, '--json', ...commandArgs];
  const result = spawnSync(cli, full, { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  appendFileSync(path.join(output, 'commands.jsonl'), JSON.stringify({ at: new Date().toISOString(), command: [cli, ...full], exit: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message }) + '\n');
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  const json = JSON.parse(result.stdout);
  assert.equal(json.success, true, JSON.stringify(json));
  return json.data;
}
const evaluate = script => command('eval', '-b', Buffer.from(script).toString('base64')).result;
const capture = name => command('screenshot', path.join(output, name));
const check = (name, detail) => checks.push({ name, passed: true, detail });
const metrics = () => evaluate(`(() => {
  const word = document.querySelector('#word-scroll'), article = document.querySelector('#article-scroll');
  const w = word.getBoundingClientRect(), a = article.getBoundingClientRect(), s = document.querySelector('[role=separator]').getBoundingClientRect();
  return {wordHeight:w.height,articleHeight:a.height,wordTop:word.scrollTop,articleTop:article.scrollTop,
    wordMax:word.scrollHeight-word.clientHeight,articleMax:article.scrollHeight-article.clientHeight,
    split:{x:s.x+s.width/2,y:s.y+s.height/2},font:getComputedStyle(document.querySelector('.word-english')).fontSize,
    pageWidth:document.documentElement.scrollWidth,viewport:innerWidth};
})()`);
const dataDirectory=path.join(output,'records-data');
mkdirSync(dataDirectory);
let child;
async function start(port=0){
  child=fork(new URL('./records-test-server.mjs',import.meta.url),[dataDirectory,String(port)],{silent:true});
  child.stdout.on('data',data=>appendFileSync(path.join(output,'server.log'),data));
  child.stderr.on('data',data=>appendFileSync(path.join(output,'server.log'),data));
  const ready=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error(`测试服务退出${code}`)));});
  url=ready.url;
}
async function stop(){const done=new Promise(resolve=>child.once('exit',resolve));child.send('close');await done;}
const saved=()=>command('wait','--fn',`document.querySelector('#record-status')?.textContent==='记录已保存（本机）'`);
const count=id=>evaluate(`Number(document.querySelector('[data-entry-id="${id}"] .forget-count').textContent.replace('次',''))`);
const add=id=>{command('click',`[data-forget="${id}"]`);saved();};
const publicRead=async()=>{const r=await fetch(url+'/api/records');assert.equal(r.status,200);return r.json();};
const openEdit=(id)=>{command('scrollintoview',`[data-edit-count="${id}"]`);command('click',`[data-edit-count="${id}"]`);command('wait','#count-edit-dialog[open]');};
const saveEdit=value=>{command('fill','#count-edit-value',String(value));command('click','#save-count-edit');};
const editClosed=()=>command('wait','--fn',`!document.querySelector('#count-edit-dialog').open`);
const threshold=()=>evaluate('document.querySelector("#count-threshold").value');
try{
  if(args.includes('--url'))url=value('--url');else await start();
  command('--executable-path',chrome,'open',url+'/#/reading');command('set','viewport','1440','1000');command('wait','#count-threshold');saved();
  assert.equal(threshold(),'0');check('新页面阈值默认0且比较条件仍不限');
  assert.equal(evaluate('document.querySelector("#count-operator").value'),'off');
  openEdit('word:1');assert.equal(evaluate('document.querySelector("#count-edit-value").value'),'0');
  command('fill','#count-edit-value','10');command('click','#cancel-count-edit');
  assert.equal(count('word:1'),0);assert.equal((await publicRead()).revision,0);
  assert.equal(evaluate('document.activeElement.dataset.editCount'),'word:1');
  openEdit('word:1');command('fill','#count-edit-value','3');command('press','Escape');assert.equal((await publicRead()).revision,0);
  assert.equal(evaluate('document.activeElement.dataset.editCount'),'word:1');
  check('弹窗预填、取消与Escape不写入，焦点回编辑入口');
  openEdit('word:1');
  for(const invalid of ['-1','0.5','','9007199254740992']){
    command('fill','#count-edit-value',invalid);command('click','#save-count-edit');
    assert.equal(evaluate('document.querySelector("#count-edit-dialog").open'),true);
    assert.equal((await publicRead()).revision,0);
  }
  command('fill','#count-edit-value','10');command('press','Enter');editClosed();saved();assert.equal(count('word:1'),10);
  assert.equal(evaluate('document.activeElement.dataset.editCount'),'word:1');
  capture('01-edit-ten.png');check('非法数值拒绝，直接设10成功且只写一个调整事件');
  openEdit('word:1');assert.equal(evaluate('document.querySelector("#count-edit-value").value'),'10');
  command('click','#save-count-edit');editClosed();assert.equal((await publicRead()).revision,1);
  assert.equal(evaluate('document.querySelector("[data-undo=\\\"word:1\\\"]").disabled'),true);
  add('word:1');assert.equal(count('word:1'),11);command('click','[data-undo="word:1"]');saved();assert.equal(count('word:1'),10);
  assert.equal(evaluate('document.querySelector("[data-undo=\\\"word:1\\\"]").disabled'),true);
  check('未改值不写事件；设数为新基准，之后加一撤销回10');
  command('click','[data-expand="word:1"]');openEdit('extra:1-A');saveEdit(3);editClosed();saved();
  assert.equal(count('extra:1-A'),3);assert.equal(count('word:1'),10);
  openEdit('word:1');saveEdit(0);editClosed();saved();assert.equal(count('word:1'),0);
  assert.equal(evaluate('document.querySelector("[data-entry-id=\\\"word:1\\\"] .forget-count").hidden'),true);
  check('母词与拓展独立，设0保留记录但隐藏数字');
  command('fill','#count-threshold','2');command('select','#count-operator','>');
  command('fill','#word-query','ATM');command('select','#word-grade','0');
  assert.deepEqual(evaluate('Array.from(document.querySelectorAll(".main-row"),r=>Number(r.dataset.number))'),[1]);
  check('编辑值参与次数/关键词/P档的跨对象组交集');
  command('fill','#count-threshold','7');command('click','#clear-word-query');assert.equal(threshold(),'7');
  command('click','.back-link');command('back');command('wait','#count-threshold');assert.equal(threshold(),'7');
  command('select','#material-select','reading:2');saved();assert.equal(threshold(),'0');
  command('fill','#count-threshold','7');command('fill','#article-query','Class Visit');command('click','[data-search-hit="reading:1:title"]');saved();assert.equal(threshold(),'0');
  command('fill','#count-threshold','7');command('click','.reset-view');assert.equal(threshold(),'0');
  command('fill','#word-query','zzzz');command('select','#count-operator','>');command('fill','#count-threshold','7');
  command('click','.search-empty .quiet-button');assert.equal(threshold(),'0');
  check('清关键词/页内导航保留阈值，换篇/跨篇/重置/清筛选恢复0');
  openEdit('word:1');writeFileSync(path.join(dataDirectory,'fail-before'),'isolated');saveEdit(8);
  command('wait','--fn',`document.querySelector('#count-edit-status').textContent.includes('测试目录写入失败')`);
  assert.equal(count('word:1'),0);assert.equal(evaluate('document.querySelector("#count-edit-value").value'),'8');capture('02-edit-failure.png');
  command('click','#cancel-count-edit');editClosed();
  const failedCloseFocus=evaluate('({tag:document.activeElement.tagName,id:document.activeElement.id,entryDisabled:document.querySelector("[data-edit-count=\\\"word:1\\\"]").disabled})');
  writeFileSync(path.join(output,'failed-close-focus.json'),JSON.stringify(failedCloseFocus,null,2));
  assert.equal(failedCloseFocus.id,'retry-records');assert.equal(failedCloseFocus.entryDisabled,true);
  assert.equal(evaluate('document.querySelector("#retry-records").disabled'),false);
  assert.equal(evaluate('(() => {const r=document.querySelector("#retry-records").getBoundingClientRect(),s=document.querySelector("#word-scroll").getBoundingClientRect();return r.top>=s.top&&r.bottom<=s.bottom;})()'),true);
  capture('05-f01-retry-focused.png');
  const failedRevision=(await publicRead()).revision;
  unlinkSync(path.join(dataDirectory,'fail-before'));command('press','Enter');saved();assert.equal(count('word:1'),8);
  assert.equal((await publicRead()).revision,failedRevision+1);
  check('F01写前失败关闭焦点到可用重试，编辑仍禁用，Enter仅保存一次');
  openEdit('word:1');writeFileSync(path.join(dataDirectory,'lose-response'),'isolated');saveEdit(9);
  command('wait','--fn',`document.querySelector('#count-edit-status').textContent.includes('回执丢失')`);
  assert.equal(count('word:1'),8);assert.equal((await publicRead()).counts.reading['word:1'],9);
  command('click','#cancel-count-edit');editClosed();
  assert.equal(evaluate('document.activeElement.id'),'retry-records');
  assert.equal(evaluate('document.querySelector("[data-edit-count=\\\"word:1\\\"]").disabled'),true);
  const lostRevision=(await publicRead()).revision;
  unlinkSync(path.join(dataDirectory,'lose-response'));command('press','Enter');saved();assert.equal(count('word:1'),9);
  assert.equal((await publicRead()).revision,lostRevision);
  check('回执丢失关闭焦点到重试，Enter仅确认既有事件');
  check('保存失败保留输入，预写失败/已写回执丢失都可原操作重试');
  openEdit('word:1');command('fill','#count-edit-value','4');
  command('tab','new',url+'/#/reading');command('wait','#record-status');saved();add('word:1');assert.equal(count('word:1'),10);
  command('tab','t1');command('click','#save-count-edit');
  command('wait','--fn',`!document.querySelector('#refresh-count-edit').hidden`);
  assert.equal((await publicRead()).counts.reading['word:1'],10);capture('03-edit-conflict.png');
  command('click','#cancel-count-edit');editClosed();assert.equal(evaluate('document.activeElement.id'),'retry-records');
  command('press','Enter');saved();openEdit('word:1');
  assert.equal(evaluate('document.querySelector("#count-edit-value").value'),'10');
  check('冲突关闭回可用刷新重试入口，不直接开放新编辑');
  // 原有窗口内刷新确认路径仍单独覆盖一次。
  command('tab','t2');add('word:1');command('tab','t1');saveEdit(3);
  command('wait','--fn',`!document.querySelector('#refresh-count-edit').hidden`);
  command('click','#refresh-count-edit');command('wait','--fn',`!document.querySelector('#save-count-edit').disabled`);
  assert.equal(evaluate('document.querySelector("#count-edit-value").value'),'11');
  saveEdit(4);editClosed();saved();assert.equal(count('word:1'),4);
  command('tab','t2');command('tab','close');
  check('双标签同对象冲突不覆盖，刷新最新值后可重新确认');
  command('select','#global-display','none');openEdit('word:1');
  const ax=command('snapshot','-s','#count-edit-dialog');
  assert.ok(!ax.snapshot.includes('atmosphere'));assert.ok(!ax.snapshot.includes('气氛'));
  writeFileSync(path.join(output,'edit-masked-ax.json'),JSON.stringify(ax,null,2));command('press','Escape');
  check('编辑窗只显示编号/次数，不泄露被遮中英文');
  command('fill','#count-threshold','3');command('select','#count-operator','>');
  openEdit('word:1');saveEdit(0);editClosed();saved();
  assert.equal(evaluate('document.querySelectorAll("[data-entry-id=\\\"word:1\\\"]").length'),0);
  assert.equal(evaluate('document.activeElement.id'),'word-query');
  command('click','.reset-view');openEdit('word:1');saveEdit(4);editClosed();saved();
  check('保存后原行被次数条件筛除，回退可用搜索入口而非BODY');
  const port=Number(new URL(url).port);await stop();await start(port);
  command('reload');command('wait','#count-threshold');saved();assert.equal(count('word:1'),4);assert.equal(threshold(),'0');
  assert.equal((await publicRead()).counts.reading['extra:1-A'],3);
  check('真实服务进程重开读回编辑数，阈值新会话为0');
  for(const [width,height] of [[1440,1000],[900,700],[560,740],[497,811]]){
    command('set','viewport',String(width),String(height));openEdit('word:1');
    const b=evaluate('(() => {const r=document.querySelector("#count-edit-dialog").getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom}})()');
    assert.ok(b.left>=0&&b.right<=width&&b.bottom<=height);
    assert.ok(evaluate('document.documentElement.scrollWidth')<=width);
    capture(`04-edit-${width}.png`);command('press','Escape');check(`${width}×${height}弹窗和编号控件可达，无横向溢出`);
  }
  const errors=command('errors');assert.deepEqual(errors.errors,[]);
  writeFileSync(path.join(output,'browser-errors.json'),JSON.stringify(errors,null,2));
  writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',session,url,checks},null,2));
  console.log(JSON.stringify({status:'passed',checks:checks.length,output}));
}catch(error){
  writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'failed',session,url,checks,error:error.stack},null,2));
  try{capture('failure.png');}catch{}
  console.error(error);process.exitCode=1;
}finally{
  try{command('close');}catch{}
  if(child?.connected)await stop();
}
