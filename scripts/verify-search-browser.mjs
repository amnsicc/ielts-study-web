import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
if (!args.includes('--output')) throw new Error('需要 --output <尚不存在的证据目录>');
const output = path.resolve(value('--output'));
mkdirSync(output, { recursive: false });
const session = args.includes('--session') ? value('--session') : `ielts-d2a-search-${Date.now()}`;
const cli = process.env.AGENT_BROWSER_EXE || 'D:/NodeTools/npm-global/node_modules/agent-browser/bin/agent-browser-win32-x64.exe';
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = args.includes('--url') ? value('--url') : 'http://127.0.0.1:4178';
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
try {
  command('--executable-path',chrome,'open',url);
  command('set','viewport','1440','1000');
  command('click','.module-reading');command('wait','#word-scope');
  const selected = selector => evaluate(`document.querySelector('${selector}').value`);
  const numbers = () => evaluate('Array.from(document.querySelectorAll(".main-row"),r=>Number(r.dataset.number))');
  const position = selector => evaluate(`document.querySelector('${selector}').scrollTop`);
  const bodyText = () => evaluate('Array.from(document.querySelectorAll(".article-paragraph"),p=>p.textContent)');
  const original = bodyText();
  assert.equal(selected('#word-scope'),'current'); assert.equal(selected('#word-grade'),'all');
  assert.equal(selected('#word-query'),'');assert.equal(selected('#article-query'),'');
  capture('01-default.png');check('D2a默认当前文章/全部P档/空搜索，沿用仅英文');

  command('select','#word-scope','all');assert.equal(numbers().length,200);
  assert.equal(selected('#material-select'),'reading:1');assert.deepEqual(bodyText(),original);
  command('fill','#word-query','DeStRuCtIvE');command('select','#word-grade','0');
  assert.deepEqual(numbers(),[21]);
  assert.equal(evaluate('document.querySelector(".main-row .sense-grade").textContent'),'P1');
  command('click','[data-expand="word:21"]');
  assert.equal(evaluate('document.querySelector("[data-entry-id=\\\"extra:21-A\\\"] .sense-grade").textContent'),'P0');
  assert.equal(selected('#material-select'),'reading:1');assert.deepEqual(bodyText(),original);
  capture('02-group-intersection.png');check('母词关键词与拓展P0分别命中，保留完整原标签整组，正文不变');

  command('select','#word-scope','current');assert.deepEqual(numbers(),[]);
  assert.equal(evaluate('document.querySelector(".search-empty:not([hidden])").textContent.includes("没有匹配词组")'),true);
  assert.equal(selected('#word-grade'),'0');assert.equal(selected('#word-query'),'DeStRuCtIvE');
  capture('03-empty.png');check('范围和筛选取交集，零命中不擅自换档或扩大范围');
  command('click','.reset-view');command('fill','#word-query','气氛');
  assert.deepEqual(numbers(),[1]);assert.equal(evaluate('document.activeElement.id'),'word-query');
  command('click','#clear-word-query');command('fill','#word-query','001');
  assert.deepEqual(numbers(),[1]);
  command('fill','#word-query','1-a');
  assert.deepEqual(numbers(),[1]);
  assert.equal(evaluate('document.querySelector(".word-search-result").dataset.locateEntry'),'extra:1-A');
  command('fill','#word-query','phere');assert.deepEqual(numbers(),[]);
  check('中英文和编号/子编号检索准确，中文输入保持焦点，英文仅前缀');

  command('click','.reset-view');
  command('focus','#article-scroll');command('press','Control+End');
  command('wait','--fn','(() => { const e=document.querySelector("#article-scroll"); return Math.abs(e.scrollHeight-e.clientHeight-e.scrollTop)<2; })()');
  const articleTop = position('#article-scroll');assert.ok(articleTop>0);
  command('fill','#word-query','13-d');
  assert.equal(position('#article-scroll'),articleTop);
  command('click','[data-locate-entry="extra:13-D"]');
  assert.equal(evaluate('document.querySelector("[data-entry-id=\\\"extra:13-D\\\"]").hidden'),false);
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-entry-id=\\\"extra:13-D\\\"] .meaning-content")).visibility'),'hidden');
  assert.equal(evaluate('document.activeElement.dataset.entryId'),'extra:13-D');
  assert.equal(evaluate('document.querySelector("[data-entry-id=\\\"extra:13-D\\\"]").classList.contains("locate-hit")'),true);
  assert.equal(position('#article-scroll'),articleTop);
  capture('04-extra-location.png');
  command('wait','1250');
  assert.equal(evaluate('document.querySelector("[data-entry-id=\\\"extra:13-D\\\"]").classList.contains("locate-hit")'),false);
  const rowTop = () => evaluate('document.querySelector("[data-entry-id=\\\"extra:13-D\\\"]").getBoundingClientRect().top');
  const beforeClear=rowTop();
  command('click','#clear-word-query');
  assert.ok(Math.abs(rowTop()-beforeClear)<3);assert.equal(position('#article-scroll'),articleTop);
  command('fill','#word-query','13-d');command('click','[data-locate-entry="extra:13-D"]');
  const beforeKeyboardClear=rowTop();
  command('focus','#word-query');command('press','Control+A');command('press','Backspace');
  assert.equal(selected('#word-query'),'');
  assert.ok(Math.abs(rowTop()-beforeKeyboardClear)<3,'键盘清空关键词应保留已定位行');
  writeFileSync(path.join(output,'word-ax-hidden.json'),JSON.stringify(command('snapshot','-s','#word-scroll'),null,2));
  check('命中拓展展开定位、保留遮挡和正文位置，约1秒提示淡去，清搜索保持定位');

  command('fill','#article-query','大气层');
  assert.equal(evaluate('document.querySelectorAll(".article-search-result").length'),0);
  assert.equal(selected('#material-select'),'reading:1');
  command('fill','#article-query','气氛');
  assert.equal(evaluate('document.querySelectorAll(".article-search-result").length'),1);
  command('click','.article-search-result');
  assert.equal(evaluate('document.activeElement.dataset.occurrenceId'),'occurrence:1:0');
  command('press','Enter');
  assert.equal(evaluate('document.querySelector(".meaning-text").textContent'),'n. 气氛');command('press','Escape');
  check('文章中文仅按本篇用义检索，选择结果定位到已登记目标且可继续查义');

  command('select','#word-grade','1');command('fill','#word-query','cru');
  const sameWords=numbers();const sameWordTop=position('#word-scroll');
  command('fill','#article-query','Class Visit');command('click','[data-search-hit="reading:1:title"]');
  assert.deepEqual(numbers(),sameWords);assert.equal(selected('#word-query'),'cru');
  assert.equal(selected('#word-grade'),'1');assert.equal(position('#word-scroll'),sameWordTop);
  assert.equal(evaluate('document.activeElement.className.includes("article-title")'),true);
  check('同篇文章搜索只定位，保留词表过滤和滚动');
  command('fill','#article-query','Grandad');assert.equal(selected('#material-select'),'reading:1');
  capture('05-article-results.png');
  command('click','[data-search-hit="reading:2:title"]');
  assert.equal(selected('#material-select'),'reading:2');
  assert.equal(selected('#word-scope'),'current');assert.equal(selected('#word-grade'),'all');assert.equal(selected('#word-query'),'');
  assert.deepEqual(numbers(),[21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40]);
  check('跨篇文章结果选择才换篇，词表自动清过滤并跟随实际目标');

  command('fill','#article-query','喷发');
  const targetHit = evaluate('document.querySelector(".article-search-result").dataset.searchHit');
  command('click',`[data-search-hit="${targetHit}"]`);
  assert.equal(evaluate('document.activeElement.classList.contains("article-target")'),true);
  command('click','#clear-article-query');
  command('fill','#article-query','040');
  assert.equal(evaluate('document.querySelectorAll(".article-search-result").length'),1);
  command('click','.article-search-result');
  assert.equal(evaluate('document.activeElement.textContent'),'erupt');
  check('文章中文与原编号定位到B篇实际目标');

  command('fill','#article-query','rain');
  const bodyHit=evaluate('Array.from(document.querySelectorAll(".article-search-result"),b=>b.dataset.searchHit).find(id=>id.includes(":body:"))');
  command('click',`[data-search-hit="${bodyHit}"]`);
  assert.equal(evaluate('document.activeElement.classList.contains("article-paragraph")'),true);
  capture('06-body-location.png');check('正文关键词结果定位对应段落，不改正文内容');

  command('select','#word-scope','all');command('select','#word-grade','0');command('fill','#word-query','atm');
  const saved={word:position('#word-scroll'),article:position('#article-scroll')};
  command('click','.back-link');command('click','.module-reading');command('wait','#word-scope');
  assert.equal(selected('#word-scope'),'all');assert.equal(selected('#word-grade'),'0');assert.equal(selected('#word-query'),'atm');
  assert.equal(selected('#article-query'),'rain');assert.equal(position('#article-scroll'),saved.article);
  command('click','.reset-view');
  assert.equal(selected('#material-select'),'reading:1');assert.equal(selected('#word-scope'),'current');
  assert.equal(selected('#word-grade'),'all');assert.equal(selected('#word-query'),'');assert.equal(selected('#article-query'),'');
  assert.equal(position('#word-scroll'),0);assert.equal(position('#article-scroll'),0);
  check('页内返回保留范围和搜索，阅读重置完整恢复D1b及D2a默认');
  command('select','#word-scope','all');command('fill','#word-query','des');command('fill','#article-query','rain');
  command('reload');command('wait','#word-scope');
  assert.equal(selected('#word-scope'),'current');assert.equal(selected('#word-query'),'');assert.equal(selected('#article-query'),'');
  check('刷新新会话不保留范围或搜索，不写浏览器持久记录');

  for(const [width,height] of [[1440,1000],[1280,720],[900,700],[560,740]]) {
    command('set','viewport',String(width),String(height));
    command('fill','#word-query','13-d');command('click','[data-locate-entry="extra:13-D"]');
    command('fill','#article-query','Grandad');
    assert.ok(evaluate('document.documentElement.scrollWidth')<=width);
    assert.ok(evaluate('document.querySelector("#word-scroll").clientHeight')>60);
    assert.ok(evaluate('document.querySelector("#article-scroll").clientHeight')>60);
    assert.ok(evaluate('document.querySelector("#word-scroll").scrollWidth<=document.querySelector("#word-scroll").clientWidth'));
    command('focus','#article-query');command('press','Tab');
    assert.equal(evaluate('document.activeElement.id'),'clear-article-query');
    capture(`07-search-${width}.png`);
    command('click','.reset-view');
    check(`桌面${width}×${height}搜索、长拓展、结果和键盘可达，无横向溢出`);
  }
  command('set','viewport','1440','1000');command('select','#global-display','both');
  command('select','#word-scope','all');command('select','#word-grade','0');
  capture('08-final.png');
  const errors=command('errors');assert.deepEqual(errors.errors,[]);
  writeFileSync(path.join(output,'browser-errors.json'),JSON.stringify(errors,null,2));
  writeFileSync(path.join(output,'final-snapshot.json'),JSON.stringify(command('snapshot','-i'),null,2));
  writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',session,url,checks},null,2));
  console.log(JSON.stringify({status:'passed',checks:checks.length,output}));
} catch(error) {
  writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'failed',session,url,checks,error:error.stack},null,2));
  try{capture('failure.png');}catch{}
  console.error(error);process.exitCode=1;
} finally {
  try{command('close');}catch(error){console.error(error.message);process.exitCode=1;}
}
