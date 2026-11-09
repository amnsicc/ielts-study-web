import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
if (!args.includes('--output')) throw new Error('需要 --output <尚不存在的证据目录>');
const output = path.resolve(value('--output'));
mkdirSync(output, { recursive: false });
const session = args.includes('--session') ? value('--session') : `ielts-d1a-${Date.now()}`;
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
  command('--executable-path', chrome, 'open', url);
  command('set', 'viewport', '1440', '1000');
  const home = command('snapshot', '-i');
  writeFileSync(path.join(output, 'home-snapshot.json'), JSON.stringify(home, null, 2));
  assert.equal(evaluate(`document.querySelectorAll('.module-grid button').length`), 4);
  capture('01-home.png');
  for (const [id, name] of [['listening', '听力'], ['writing', '写作'], ['speaking', '口语']]) {
    command('click', `.module-${id}`);
    command('wait', '--text', '这个模块尚未开放');
    assert.equal(evaluate(`document.querySelector('main h1').textContent`), name);
    command('click', '.return-button');
    command('wait', '--text', '今天，从哪里开始');
  }
  check('四入口、未开放模块说明与返回可用');
  command('click', '.module-reading');
  command('wait', '#material-select');
  const numbers = () => evaluate(`Array.from(document.querySelectorAll('tbody tr'), row => Number(row.dataset.number))`);
  assert.deepEqual(numbers(), [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
  const atmosphere = evaluate(`Array.from(document.querySelector('[data-number="1"]').querySelectorAll('.sense-text'), n=>n.textContent)`);
  assert.deepEqual(atmosphere, ['气氛', '大气层', '空气']);
  assert.deepEqual(evaluate(`Array.from(document.querySelector('[data-number="8"]').querySelectorAll('.sense-text'), n=>n.textContent)`), ['核心', '中心部分', '核心的', '最重要的']);
  check('首篇目标001—020；主行多义完整、未混入无阅读标签的备查义', atmosphere);
  capture('02-reading-a.png');

  const before = metrics();
  command('mouse', 'move', String(Math.round(before.split.x)), String(Math.round(before.split.y)));
  command('mouse', 'down', 'left');
  command('mouse', 'move', String(Math.round(before.split.x)), String(Math.round(before.split.y + 110)), '--steps', '12');
  command('mouse', 'up', 'left');
  const after = metrics();
  assert.ok(after.wordHeight > before.wordHeight + 80);
  assert.ok(after.articleHeight < before.articleHeight - 80);
  assert.equal(after.font, before.font);
  check('真实鼠标拖动使上区变大、下区变小，字号不变', { before, after });
  capture('03-divider-dragged.png');
  command('focus', '#reading-divider');
  command('press', 'ArrowUp');
  assert.ok(metrics().wordHeight < after.wordHeight);
  command('press', 'Home');
  const minimum = metrics();
  command('press', 'End');
  const maximum = metrics();
  assert.ok(minimum.wordHeight > 100 && maximum.articleHeight > 100);
  check('分隔条键盘调整和两端限位均可用', { minimum, maximum });
  // 恢复到约一半，分别以真实键盘滚动两个可聚焦区。
  command('press', 'Home');
  for (let i = 0; i < 5; i++) command('press', 'ArrowDown');
  command('focus', '#word-scroll');
  command('press', 'Control+End');
  command('wait', '--fn', '(() => {const e=document.querySelector("#word-scroll");return e.scrollTop >= e.scrollHeight-e.clientHeight-2})()');
  const wordEnd = metrics();
  assert.ok(wordEnd.wordTop >= wordEnd.wordMax - 2);
  assert.equal(wordEnd.articleTop, 0);
  command('focus', '#article-scroll');
  command('press', 'Control+End');
  command('wait', '--fn', '(() => {const e=document.querySelector("#article-scroll");return e.scrollTop >= e.scrollHeight-e.clientHeight-2})()');
  const articleEnd = metrics();
  assert.ok(articleEnd.articleTop >= articleEnd.articleMax - 2);
  assert.equal(articleEnd.wordTop, wordEnd.wordTop);
  check('两个区域能各自滚到末尾，滚动互不影响', articleEnd);
  capture('04-independent-ends.png');

  command('select', '#material-select', 'reading:2');
  command('wait', '--text', "A Rainy Weekend at Grandad's Farm");
  assert.deepEqual(numbers(), [21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40]);
  assert.equal(metrics().wordTop, 0);
  assert.equal(metrics().articleTop, 0);
  check('选篇B后只留021—040，词表和正文回到篇首');
  capture('05-reading-b.png');

  command('click', '.back-link');
  command('wait', '--text', '今天，从哪里开始');
  command('click', '.module-reading');
  command('wait', '#material-select');
  assert.equal(evaluate('document.querySelector("#material-select").value'), 'reading:2');
  command('back');
  command('wait', '--text', '今天，从哪里开始');
  command('forward');
  command('wait', '#material-select');
  check('返回首页及浏览器后退/前进可用，页内保留所选文章');
  command('reload');
  command('wait', '#material-select');
  assert.equal(evaluate('document.querySelector("#material-select").value'), 'reading:1');
  check('重新加载为新会话，恢复首篇和默认分区');

  for (const [width, height] of [[1280,720],[900,700],[560,740]]) {
    command('set', 'viewport', String(width), String(height));
    const size = metrics();
    assert.ok(size.pageWidth <= width);
    assert.ok(size.wordHeight > 80 && size.articleHeight > 80);
    capture(`06-reading-${width}.png`);
    check(`窗口${width}×${height}无整页横向溢出，两区仍可滚动`, size);
  }
  command('set', 'viewport', '1440', '1000');
  capture('07-reading-final.png');
  writeFileSync(path.join(output, 'browser-errors.json'), JSON.stringify(command('errors'), null, 2));
  writeFileSync(path.join(output, 'reading-snapshot.json'), JSON.stringify(command('snapshot', '-i'), null, 2));
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'passed', session, url, checks }, null, 2));
  console.log(JSON.stringify({ status: 'passed', checks: checks.length, output }));
} catch (error) {
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'failed', session, checks, error: error.stack }, null, 2));
  try { capture('failure.png'); } catch {}
  console.error(error);
  process.exitCode = 1;
} finally {
  try { command('close'); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
