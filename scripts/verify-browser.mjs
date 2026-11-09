import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
if (!args.includes('--output')) throw new Error('需要 --output <尚不存在的证据目录>');
const output = path.resolve(value('--output'));
mkdirSync(output, { recursive: false });
const session = args.includes('--session') ? value('--session') : `ielts-d1b-${Date.now()}`;
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
  const numbers = () => evaluate(`Array.from(document.querySelectorAll('tr.main-row'), row => Number(row.dataset.number))`);
  assert.deepEqual(numbers(), [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
  assert.equal(evaluate(`getComputedStyle(document.querySelector('[data-number="1"] .meaning-content')).visibility`), 'hidden');
  assert.equal(evaluate(`document.querySelector('#target-highlight').checked`), true);
  command('select', '#global-display', 'both');
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

  const hiddenSnapshot = command('snapshot', '-i');
  writeFileSync(path.join(output, 'default-visibility-snapshot.json'), JSON.stringify(hiddenSnapshot, null, 2));
  assert.ok(!JSON.stringify(hiddenSnapshot).includes('气氛'));
  const visible = id => evaluate(`(() => { const row=document.querySelector('[data-entry-id="${id}"]'); return {
    english:getComputedStyle(row.querySelector('[data-language=english]')).visibility,
    chinese:getComputedStyle(row.querySelector('[data-language=chinese]')).visibility,
    height:row.getBoundingClientRect().height
  }; })()`);
  assert.equal(visible('word:1').chinese, 'hidden');
  const originalHeight = visible('word:1').height;
  command('select', '[data-display-for="word:1"]', 'chinese');
  command('select', '[data-display-for="word:2"]', 'english');
  assert.deepEqual([visible('word:1').english, visible('word:1').chinese], ['hidden', 'visible']);
  assert.deepEqual([visible('word:2').english, visible('word:2').chinese], ['visible', 'hidden']);
  assert.equal(visible('word:1').height, originalHeight);
  command('select', '#global-display', 'none');
  assert.deepEqual([visible('word:1').english, visible('word:1').chinese], ['hidden', 'hidden']);
  assert.equal(visible('word:1').height, originalHeight);
  command('select', '[data-display-for="word:1"]', 'both');
  assert.equal(evaluate('document.querySelector("#global-display").value'), 'custom');
  command('select', '#global-display', 'both');
  check('默认仅英文、逐词独立、整体四模式、遮挡保留行高且不在无障碍树泄露');

  // 阅读滚动后，词表操作不得重置正文。
  command('focus', '#article-scroll');
  command('press', 'Control+End');
  command('wait', '--fn', '(() => {const e=document.querySelector("#article-scroll");return e.scrollTop >= e.scrollHeight-e.clientHeight-2})()');
  const articlePosition = metrics().articleTop;
  command('click', '[data-expand="word:1"]');
  assert.equal(evaluate(`document.querySelector('[data-entry-id="extra:1-A"]').hidden`), false);
  assert.equal(visible('extra:1-A').chinese, 'visible');
  command('select', '[data-display-for="extra:1-A"]', 'chinese');
  assert.equal(visible('extra:1-A').english, 'hidden');
  assert.equal(visible('word:1').english, 'visible');
  command('click', '[data-expand="word:1"]');
  command('click', '[data-expand="word:1"]');
  assert.equal(visible('extra:1-A').english, 'hidden');
  assert.equal(metrics().articleTop, articlePosition);
  assert.deepEqual(numbers(), [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
  check('展开/收起及拓展单条显隐保留编号和状态，正文位置不变');

  // 两篇全部已知拓展入口均用真实点击展开，记录文字供来源对照。
  const allExtras = [];
  for (const material of ['reading:1', 'reading:2']) {
    command('select', '#material-select', material);
    command('select', '#global-display', 'both');
    const closedGroups = evaluate(`Array.from(document.querySelectorAll('[data-expand][aria-expanded="false"]'),b=>b.dataset.expand)`);
    for (const id of closedGroups) {
      command('scrollintoview', `[data-expand="${id}"]`);
      command('click', `[data-expand="${id}"]`);
    }
    const data = evaluate(`Array.from(document.querySelectorAll('.extra-row'),r=>({id:r.dataset.entryId,number:r.querySelector('.word-number').textContent,
      word:r.querySelector('.entry-word').textContent,hidden:r.hidden,senses:Array.from(r.querySelectorAll('.gloss'),g=>({text:g.querySelector('.sense-text').textContent,grade:g.querySelector('.sense-grade').textContent}))}))`);
    assert.ok(data.every(row => !row.hidden));
    allExtras.push(...data);
  }
  assert.equal(allExtras.length, 25);
  assert.deepEqual(allExtras.find(row => row.id === 'extra:13-A').senses.map(s=>s.text), ['即将发生', '可能很快出现']);
  writeFileSync(path.join(output, 'all-extras-dom.json'), JSON.stringify(allExtras, null, 2));
  check('两篇25条阅读拓展均真实展开，内容/子编号记录可核对');
  capture('08-extras-b.png');

  command('select', '#material-select', 'reading:1');
  const originalBody = evaluate(`Array.from(document.querySelectorAll('.article-paragraph'),p=>p.textContent)`);
  command('click', '[data-occurrence-id="occurrence:1:0"]');
  assert.equal(evaluate('document.querySelector("dialog .meaning-text").textContent'), 'n. 气氛');
  assert.equal(evaluate('document.querySelector("dialog[open] .meaning-title").textContent'), 'atmosphere');
  capture('09-meaning-atmosphere.png');
  command('press', 'Escape');
  assert.equal(evaluate('document.activeElement.dataset.occurrenceId'), 'occurrence:1:0');
  command('scrollintoview', '[data-occurrence-id="occurrence:1:5"]');
  command('click', '[data-occurrence-id="occurrence:1:5"]');
  assert.equal(evaluate('document.querySelector("dialog .meaning-text").textContent'), 'n. 地壳');
  command('click', '.meaning-top button');
  check('正文查义准确绑定气氛/地壳，关闭和Escape返回原目标焦点');
  command('uncheck', '#target-highlight');
  assert.equal(evaluate(`getComputedStyle(document.querySelector('.article-target')).backgroundColor`), 'rgba(0, 0, 0, 0)');
  command('scrollintoview', '[data-occurrence-id="occurrence:1:0"]');
  command('focus', '[data-occurrence-id="occurrence:1:0"]');
  command('press', 'Enter');
  assert.equal(evaluate('document.querySelector("dialog .meaning-text").textContent'), 'n. 气氛');
  command('press', 'Escape');
  command('check', '#target-highlight');
  assert.deepEqual(evaluate(`Array.from(document.querySelectorAll('.article-paragraph'),p=>p.textContent)`), originalBody);
  check('高亮关闭仍可键盘查义，开关不改变正文');

  const allMeanings = [];
  for (const material of ['reading:1', 'reading:2']) {
    command('select', '#material-select', material);
    const ids = evaluate('Array.from(document.querySelectorAll(".article-target"),b=>b.dataset.occurrenceId)');
    assert.equal(ids.length, 20);
    for (const id of ids) {
      command('scrollintoview', `[data-occurrence-id="${id}"]`);
      command('click', `[data-occurrence-id="${id}"]`);
      allMeanings.push({ material, id, ...evaluate('({text:document.querySelector(".meaning-title").textContent,meaning:document.querySelector(".meaning-text").textContent,note:document.querySelector(".meaning-note").textContent})') });
      command('press', 'Escape');
      assert.equal(evaluate('document.activeElement.dataset.occurrenceId'), id);
    }
  }
  writeFileSync(path.join(output, 'all-meaning-dialogs.json'), JSON.stringify(allMeanings, null, 2));
  check('两篇40处目标逐一真实点击查义并关闭，焦点返回对应目标');

  command('set', 'viewport', '560', '740');
  command('select', '#material-select', 'reading:1');
  command('select', '#global-display', 'both');
  command('scrollintoview', '[data-expand="word:13"]');
  // 前序已展开时不重复关闭。
  if (evaluate(`document.querySelector('[data-expand="word:13"]').getAttribute('aria-expanded')`) === 'false') command('click', '[data-expand="word:13"]');
  command('scrollintoview', '[data-entry-id="extra:13-D"]');
  assert.equal(evaluate('document.querySelector("#word-scroll").scrollWidth <= document.querySelector("#word-scroll").clientWidth'), true);
  capture('10-long-extra-560.png');
  command('select', '[data-display-for="extra:13-D"]', 'none');
  assert.equal(visible('extra:13-D').english, 'hidden');
  command('select', '[data-display-for="extra:13-D"]', 'both');
  command('scrollintoview', '[data-occurrence-id="occurrence:1:0"]');
  command('click', '[data-occurrence-id="occurrence:1:0"]');
  capture('11-meaning-560.png');
  const dialogBounds = evaluate('(() => {const r=document.querySelector("dialog").getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,height:innerHeight}})()');
  assert.ok(dialogBounds.left >= 0 && dialogBounds.right <= 560 && dialogBounds.bottom <= dialogBounds.height);
  command('press', 'Escape');
  check('560宽长词块可达且可逐条遮挡，查义浮层在可视区内');
  command('set', 'viewport', '1440', '1000');

  command('select', '#material-select', 'reading:2');
  command('select', '#global-display', 'none');
  command('focus', '#reading-divider');
  command('press', 'End');
  command('uncheck', '#target-highlight');
  command('click', '.back-link');
  command('click', '.module-reading');
  command('wait', '#global-display');
  assert.equal(evaluate('document.querySelector("#global-display").value'), 'none');
  assert.equal(evaluate('document.querySelector("#target-highlight").checked'), false);
  command('click', '.reset-view');
  assert.equal(evaluate('document.querySelector("#material-select").value'), 'reading:1');
  assert.equal(evaluate('document.querySelector("#global-display").value'), 'english');
  assert.equal(evaluate('document.querySelector("#reading-divider").getAttribute("aria-valuenow")'), '46');
  assert.equal(evaluate('document.querySelector("#target-highlight").checked'), true);
  assert.equal(evaluate('document.querySelectorAll(".extra-row:not([hidden])").length'), 0);
  assert.equal(metrics().articleTop, 0);
  assert.equal(metrics().wordTop, 0);
  check('页内保留状态；阅读模块重置恢复首篇/46%/英文/收起/高亮/零滚动');
  command('select', '#global-display', 'both');

  for (const [width, height] of [[1280,720],[900,700],[560,740]]) {
    command('set', 'viewport', String(width), String(height));
    const size = metrics();
    assert.ok(size.pageWidth <= width);
    assert.ok(size.wordHeight > 80 && size.articleHeight > 80);
    assert.equal(evaluate('document.querySelector("#word-scroll").scrollWidth <= document.querySelector("#word-scroll").clientWidth'), true);
    capture(`06-reading-${width}.png`);
    check(`窗口${width}×${height}无整页横向溢出，两区仍可滚动`, size);
  }
  command('set', 'viewport', '1440', '1000');
  capture('07-reading-final.png');
  const errors = command('errors');
  assert.deepEqual(errors.errors, []);
  writeFileSync(path.join(output, 'browser-errors.json'), JSON.stringify(errors, null, 2));
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
