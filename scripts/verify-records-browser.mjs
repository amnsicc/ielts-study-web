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
const session = args.includes('--session') ? value('--session') : `ielts-d2b-records-${Date.now()}`;
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
try{
  await start();
  command('--executable-path',chrome,'open',url);
  command('set','viewport','1440','1000');
  command('click','.module-reading');command('wait','#record-status');saved();
  assert.equal(count('word:1'),0);
  assert.equal(evaluate('document.querySelector("[data-entry-id=\\\"word:1\\\"] .forget-count").hidden'),true);
  assert.equal((await publicRead()).history.reading['reading:1'].opens,1);
  capture('01-records-default.png');check('初始0不显示，首页主动进入只登记一次历史');
  add('word:1');add('word:1');assert.equal(count('word:1'),2);
  command('click','[data-expand="word:1"]');add('extra:1-A');assert.equal(count('extra:1-A'),1);assert.equal(count('word:1'),2);
  command('click','[data-undo="extra:1-A"]');saved();assert.equal(count('extra:1-A'),0);
  assert.equal(evaluate('document.querySelector("[data-undo=\\\"extra:1-A\\\"]").disabled'),true);
  capture('02-counts.png');check('母词拓展分别保存，0隐藏，撤销后不可重复扣减');
  command('fill','#count-threshold','1');command('select','#count-operator','>');
  assert.deepEqual(evaluate('Array.from(document.querySelectorAll(".main-row"),r=>Number(r.dataset.number))'),[1]);
  command('fill','#word-query','ATM');command('select','#word-grade','1');
  assert.equal(evaluate('document.querySelectorAll(".main-row").length'),1);
  command('select','#count-operator','=');command('fill','#count-threshold','0');
  assert.equal(evaluate('document.querySelectorAll(".main-row").length'),1); // extra is 0, parent satisfies keyword and grade
  check('次数/P档/关键词按组交集，0和拓展可各自命中');
  command('click','.reset-view');assert.equal(count('word:1'),2);
  assert.equal(evaluate('document.querySelector("#count-operator").value'),'off');
  assert.equal(evaluate('document.querySelector("#global-display").value'),'english');
  const firstHistory=(await publicRead()).history.reading['reading:1'].opens;
  command('reload');command('wait','#record-status');saved();assert.equal(count('word:1'),2);
  assert.equal((await publicRead()).history.reading['reading:1'].opens,firstHistory);
  check('重置仅清界面，刷新读回记录，不虚增历史');
  command('select','#material-select','reading:2');saved();
  assert.equal((await publicRead()).history.reading['reading:2'].opens,1);
  command('select','#material-select','reading:1');saved();assert.equal(count('word:1'),2);
  command('fill','#article-query','Class Visit');
  command('click','[data-search-hit="reading:1:title"]');
  const beforeSame=(await publicRead()).history.reading['reading:1'].opens;
  command('click','.back-link');command('back');command('wait','#record-status');saved();
  assert.equal((await publicRead()).history.reading['reading:1'].opens,beforeSame);
  command('fill','#article-query','Grandad');command('click','[data-search-hit="reading:2:title"]');saved();
  assert.equal((await publicRead()).history.reading['reading:2'].opens,2);
  check('主动切篇/跨篇结果记历史，同篇定位和浏览器后退不记');
  command('click','.reset-view');command('scrollintoview','#export-records');
  const require=createRequire(import.meta.url);
  const {chromium}=require(process.env.PLAYWRIGHT_PATH||'D:/codex_project/雅思备考/readest-ielts/apps/readest-app/node_modules/playwright');
  const downloadBrowser=await chromium.launch({executablePath:chrome,headless:true});
  try{
    const page=await downloadBrowser.newPage({acceptDownloads:true});
    await page.goto(url+'/#/reading');
    await page.locator('#export-records').waitFor();
    await page.waitForFunction(()=>document.querySelector('#record-status').textContent==='记录已保存（本机）');
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-records').click()]);
    await download.saveAs(path.join(output,'downloaded-records.json'));
    writeFileSync(path.join(output,'download-metadata.json'),JSON.stringify({url:download.url(),filename:download.suggestedFilename(),failure:await download.failure(),driver:'existing Playwright for download only'},null,2));
  }finally{await downloadBrowser.close();}
  const exported=JSON.parse(readFileSync(path.join(output,'downloaded-records.json'),'utf8'));
  assert.equal(exported.format,'ielts-study-records');assert.equal(exported.view.counts.reading['word:1'],2);
  assert.deepEqual(exported.view,await publicRead());
  check('真实下载JSON可解析，次数和材料历史与公开读取一致');
  writeFileSync(path.join(dataDirectory,'fail-before'),'isolated failure');
  command('scrollintoview','[data-forget="word:1"]');command('click','[data-forget="word:1"]');
  command('wait','--fn',`document.querySelector('#record-status').textContent.includes('未完成')`);
  assert.equal(count('word:1'),2);capture('03-save-failure.png');
  assert.equal(evaluate('document.querySelector("[data-forget=\\\"word:1\\\"]").disabled'),true);
  unlinkSync(path.join(dataDirectory,'fail-before'));
  command('scrollintoview','#retry-records');command('click','#retry-records');saved();assert.equal(count('word:1'),3);
  assert.equal((await publicRead()).counts.reading['word:1'],3);
  check('真实文件边界失败不假增，重试同操作ID仅加一次');
  const port=Number(new URL(url).port);
  await stop();await start(port);
  command('reload');command('wait','#record-status');saved();assert.equal(count('word:1'),3);
  check('真实服务进程关闭重启后可读回，锁正常释放');
  command('tab','new',url+'/#/reading');command('wait','#record-status');saved();
  add('word:1');assert.equal(count('word:1'),4);
  command('tab','t1');command('scrollintoview','#refresh-records');command('click','#refresh-records');saved();
  assert.equal(count('word:1'),4);add('word:1');
  command('tab','t2');command('scrollintoview','#refresh-records');command('click','#refresh-records');saved();
  assert.equal(count('word:1'),5);
  check('两个真实标签共享记录，独立点击均保留，刷新记录后一致');
  command('tab','close');
  const beforeBusyOpen=(await publicRead()).history.reading['reading:1'].opens;
  writeFileSync(path.join(dataDirectory,'hold-read'),'isolated delayed read');
  command('scrollintoview','#refresh-records');command('click','#refresh-records');
  command('click','.back-link');command('click','.module-reading');command('wait','#record-status');
  unlinkSync(path.join(dataDirectory,'hold-read'));
  saved();
  assert.equal((await publicRead()).history.reading['reading:1'].opens,beforeBusyOpen+1);
  check('读取中主动打开的操作排队完成，不假报成功或丢历史');
  writeFileSync(path.join(dataDirectory,'lose-response'),'isolated lost acknowledgement');
  command('scrollintoview','[data-forget="word:1"]');command('click','[data-forget="word:1"]');
  command('wait','--fn',`document.querySelector('#record-status').textContent.includes('未完成')`);
  assert.equal(count('word:1'),5);assert.equal((await publicRead()).counts.reading['word:1'],6);
  unlinkSync(path.join(dataDirectory,'lose-response'));
  command('scrollintoview','#retry-records');command('click','#retry-records');saved();
  assert.equal(count('word:1'),6);assert.equal((await publicRead()).counts.reading['word:1'],6);
  check('写入已成但回执丢失，重试原操作只确认，不重复加一');
  command('select','#global-display','none');
  command('fill','#word-query','001');
  const ax=command('snapshot','-s','#word-scroll');
  writeFileSync(path.join(output,'masked-records-ax.json'),JSON.stringify(ax,null,2));
  assert.ok(!ax.snapshot.includes('atmosphere'));assert.ok(!ax.snapshot.includes('气氛'));
  check('新记忆控件和搜索不泄露全部遮挡的中英文');
  for(const [width,height] of [[1440,1000],[1280,720],[900,700],[560,740]]){
    command('set','viewport',String(width),String(height));command('click','.reset-view');
    command('fill','#word-query','13-d');command('click','[data-locate-entry="extra:13-D"]');
    assert.ok(evaluate('document.documentElement.scrollWidth')<=width);
    assert.ok(evaluate('document.querySelector("#word-scroll").clientHeight')>60);
    assert.ok(evaluate('document.querySelector("#article-scroll").clientHeight')>60);
    command('scrollintoview','[data-forget="extra:13-D"]');
    capture(`04-records-${width}.png`);check(`${width}×${height}次数控件、长拓展和两区可达`);
  }
  command('set','viewport','1440','1000');command('click','.reset-view');command('select','#global-display','both');
  capture('05-final.png');
  const errors=command('errors');assert.deepEqual(errors.errors,[]);
  writeFileSync(path.join(output,'browser-errors.json'),JSON.stringify(errors,null,2));
  writeFileSync(path.join(output,'environment.json'),JSON.stringify(evaluate('({userAgent:navigator.userAgent})'),null,2));
  writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',session,url,checks},null,2));
  console.log(JSON.stringify({status:'passed',checks:checks.length,output}));
}catch(error){
  writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'failed',session,url,checks,error:error.stack},null,2));
  try{capture('failure.png');}catch{}
  console.error(error);process.exitCode=1;
}finally{
  try{command('close');}catch(error){console.error(error.message);process.exitCode=1;}
  if(child?.connected)await stop();
}
