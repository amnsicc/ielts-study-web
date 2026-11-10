import {spawnSync,fork} from 'node:child_process';
import {mkdirSync,writeFileSync,appendFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const args=process.argv.slice(2);
const value=name=>args[args.indexOf(name)+1];
if(!args.includes('--output'))throw new Error('需要 --output <尚不存在的证据目录>');
const output=path.resolve(value('--output'));mkdirSync(output,{recursive:false});
const session=args.includes('--session')?value('--session'):`ielts-r200-${Date.now()}`;
const cli=process.env.AGENT_BROWSER_EXE||'D:/NodeTools/npm-global/node_modules/agent-browser/bin/agent-browser-win32-x64.exe';
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const catalog=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));
const materials=JSON.parse(readFileSync(new URL('../data/materials.json',import.meta.url),'utf8'));
const checks=[];let child,url;
function command(...commandArgs){
  const full=['--session',session,'--json',...commandArgs];
  const result=spawnSync(cli,full,{encoding:'utf8',windowsHide:true,timeout:30000});
  appendFileSync(path.join(output,'commands.jsonl'),JSON.stringify({at:new Date().toISOString(),command:[cli,...full],exit:result.status,stdout:result.stdout,stderr:result.stderr,error:result.error?.message})+'\n');
  assert.equal(result.status,0,result.stderr||result.stdout||result.error?.message);
  const json=JSON.parse(result.stdout);assert.equal(json.success,true,JSON.stringify(json));return json.data;
}
const evaluate=script=>command('eval','-b',Buffer.from(script).toString('base64')).result;
const capture=name=>command('screenshot',path.join(output,name));
const check=(name,detail)=>{checks.push({name,passed:true,detail});console.log(name);};
const saved=()=>command('wait','--fn',`document.querySelector('#record-status')?.textContent==='记录已保存（本机）'`);
const selected=id=>evaluate(`document.querySelector(${JSON.stringify(id)}).value`);
const numbers=()=>evaluate('Array.from(document.querySelectorAll(".main-row"),r=>Number(r.dataset.number))');
const publicRead=async()=> (await fetch(url+'/api/records')).json();
async function start(port=0){
  child=fork(new URL('./records-test-server.mjs',import.meta.url),[path.join(output,'records-data'),String(port)],{silent:true});
  child.stdout.on('data',d=>appendFileSync(path.join(output,'server.log'),d));
  child.stderr.on('data',d=>appendFileSync(path.join(output,'server.log'),d));
  url=(await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',c=>reject(new Error(`测试服务退出${c}`)));})).url;
}
async function stop(){const exit=new Promise(resolve=>child.once('exit',resolve));child.send('close');await exit;}
try{
  await start();command('--executable-path',chrome,'open',url);command('set','viewport','1440','1000');
  assert.ok(evaluate('document.querySelector(".home-note").textContent').includes('001—200'));
  assert.ok(evaluate('document.querySelector(".home-note").textContent').includes('10篇'));
  command('click','.module-reading');command('wait','#material-select');saved();
  const options=evaluate('Array.from(document.querySelector("#material-select").options,o=>({value:o.value,text:o.textContent}))');
  assert.equal(options.length,10);assert.equal(new Set(options.map(o=>o.text[0])).size,10);
  assert.ok(options[9].text.startsWith('J · 181—200'));
  check('首页范围与10篇A—J列表准确');
  const rendered=[];
  for(const material of materials){
    command('select','#material-select',material.id);saved();command('select','#global-display','both');
    assert.deepEqual(numbers(),material.targetGroupIds.map(id=>Number(id.split(':')[1])));
    const closed=evaluate('Array.from(document.querySelectorAll("[data-expand][aria-expanded=false]"),b=>b.dataset.expand)');
    for(const id of closed){command('scrollintoview',`[data-expand="${id}"]`);command('click',`[data-expand="${id}"]`);}
    const rows=evaluate(`Array.from(document.querySelectorAll('[data-entry-id]'),r=>({id:r.dataset.entryId,hidden:r.hidden,word:r.querySelector('.entry-word').textContent,
      senses:Array.from(r.querySelectorAll('.gloss'),g=>({text:g.querySelector('.sense-text').textContent,pos:g.querySelector('.sense-pos').textContent,grade:g.querySelector('.sense-grade').textContent,primary:g.querySelector('.sense-text').classList.contains('primary-sense')}))}))`);
    const expected=catalog.filter(g=>material.targetGroupIds.includes(g.id)).flatMap(g=>[g,...g.extras]);
    assert.equal(rows.length,expected.length);
    for(const [i,row] of rows.entries()){
      const entry=expected[i];assert.equal(row.id,entry.id);assert.equal(row.word,entry.word);assert.equal(row.hidden,false);
      assert.deepEqual(row.senses,entry.senses.map(s=>({text:s.text,pos:s.pos,grade:`P${s.grade}`,primary:s.primary})));
    }
    const paragraphs=evaluate('Array.from(document.querySelectorAll(".article-paragraph"),p=>p.textContent)');
    assert.deepEqual(paragraphs,material.paragraphs.map(p=>p.replaceAll('`','')));
    const targets=evaluate('Array.from(document.querySelectorAll(".article-target"),b=>({id:b.dataset.occurrenceId,text:b.textContent}))');
    assert.deepEqual(targets,material.occurrences.map(o=>({id:o.id,text:o.text})));
    rendered.push({material:material.id,rows,paragraphs,targets});
    capture(`article-${material.label}.png`);check(`${material.label}篇母词/完整义项/展开拓展/原文及20处查义入口准确`,{groups:material.targetGroupIds.length,rows:rows.length});
  }
  writeFileSync(path.join(output,'all-rendered-content.json'),JSON.stringify(rendered,null,2));
  for(const [materialId,text,meaning] of [['reading:4','Arctic','adj. 北极的'],['reading:7','thaw','vi./vt. （使）融化；解冻'],['reading:7','freeze','vi./vt. （使）结冰'],['reading:7','forecast','n./vt. 预测；预报'],['reading:8','irregularly','adv. 不规则地'],['reading:10','sunset','n. 日落']]){
    if(selected('#material-select')!==materialId){command('select','#material-select',materialId);saved();}
    const id=materials.find(m=>m.id===materialId).occurrences.find(o=>o.text===text).id;
    command('scrollintoview',`[data-occurrence-id="${id}"]`);command('click',`[data-occurrence-id="${id}"]`);
    assert.equal(evaluate('document.querySelector(".meaning-title").textContent'),text);
    assert.equal(evaluate('document.querySelector(".meaning-text").textContent'),meaning);
    capture(`meaning-${text}.png`);command('press','Escape');
    assert.equal(evaluate('document.activeElement.dataset.occurrenceId'),id);
  }
  check('新增大小写、复合词性、副词及末词6处真实查义，ESC返回入口');
  command('select','#word-scope','all');assert.equal(numbers().length,200);
  command('focus','#word-scroll');command('press','Control+End');
  assert.ok(evaluate('document.querySelector("#word-scroll").scrollTop')>0);
  assert.equal(evaluate('document.querySelector(".main-row:last-of-type")?.dataset.number')!==undefined,true);
  command('fill','#word-query','200');assert.deepEqual(numbers(),[200]);
  command('click','[data-locate-entry="word:200"]');
  assert.equal(evaluate('document.activeElement.dataset.entryId'),'word:200');
  command('select','[data-display-for="word:200"]','none');
  assert.equal(evaluate('getComputedStyle(document.querySelector("[data-entry-id=\\"word:200\\"] .entry-word")).visibility'),'hidden');
  const openEdit=id=>{command('scrollintoview',`[data-edit-count="${id}"]`);command('click',`[data-edit-count="${id}"]`);command('wait','#count-edit-dialog[open]');};
  const edit=id=>{openEdit(id);command('fill','#count-edit-value','9');command('click','#save-count-edit');command('wait','--fn','!document.querySelector("#count-edit-dialog").open');saved();};
  edit('word:200');assert.equal((await publicRead()).counts.reading['word:200'],9);
  command('click','[data-forget="word:200"]');saved();assert.equal((await publicRead()).counts.reading['word:200'],10);
  command('click','[data-undo="word:200"]');saved();assert.equal((await publicRead()).counts.reading['word:200'],9);
  command('fill','#count-threshold','9');command('select','#count-operator','=');assert.deepEqual(numbers(),[200]);
  check('全部200组可滚动，末词定位/遮挡/设数/加一/撤销/次数交集正确');
  command('click','.reset-view');command('select','#word-scope','all');command('fill','#word-query','157-b');command('select','#word-grade','0');
  assert.deepEqual(numbers(),[157]);command('click','[data-locate-entry="extra:157-B"]');
  assert.equal(evaluate('document.activeElement.dataset.entryId'),'extra:157-B');
  edit('extra:157-B');assert.equal((await publicRead()).counts.reading['extra:157-B'],9);
  assert.equal(selected('#material-select'),'reading:1');
  check('新增拓展子编号/P0交集、抽屉定位和独立记录不改变正文');
  command('fill','#article-query','日落');command('click','[data-search-hit="reading:10:occurrence:10:19"]');saved();
  assert.equal(selected('#material-select'),'reading:10');assert.equal(selected('#word-scope'),'current');assert.equal(selected('#word-grade'),'all');assert.equal(selected('#word-query'),'');assert.equal(selected('#count-threshold'),'0');
  assert.equal(evaluate('document.activeElement.dataset.occurrenceId'),'occurrence:10:19');
  command('press','Enter');assert.equal(evaluate('document.querySelector(".meaning-title").textContent'),'sunset');command('press','Escape');
  const history=(await publicRead()).history.reading['reading:10'].opens;
  command('click','.back-link');command('click','.module-reading');command('wait','#material-select');saved();assert.equal(selected('#material-select'),'reading:10');
  assert.equal((await publicRead()).history.reading['reading:10'].opens,history+1);
  check('新增文章中文用义搜索定位、词表联动与返回历史正确');
  const port=Number(new URL(url).port);await stop();await start(port);command('reload');command('wait','#word-scope');saved();
  assert.equal(selected('#material-select'),'reading:1');assert.equal(selected('#count-threshold'),'0');
  assert.equal((await publicRead()).counts.reading['word:200'],9);assert.equal((await publicRead()).counts.reading['extra:157-B'],9);
  const exported=await (await fetch(url+'/api/records/export')).json();assert.equal(exported.version,2);assert.equal(exported.view.counts.reading['word:200'],9);
  check('隔离服务正常重开后新对象记录保持，刷新界面默认，JSON导出有效');
  for(const [width,height] of [[1440,1000],[1280,720],[900,700],[497,811]]){
    command('set','viewport',String(width),String(height));command('select','#material-select','reading:10');saved();command('select','#global-display','both');
    assert.ok(evaluate('document.documentElement.scrollWidth')<=width);
    assert.ok(evaluate('document.querySelector("#word-scroll").scrollWidth<=document.querySelector("#word-scroll").clientWidth'));
    assert.ok(evaluate('document.querySelector("#word-scroll").clientHeight')>60);assert.ok(evaluate('document.querySelector("#article-scroll").clientHeight')>60);
    capture(`expanded-${width}.png`);check(`${width}×${height}新增篇与完整释义可达，无横向溢出`);
  }
  const errors=command('errors');assert.deepEqual(errors.errors,[]);writeFileSync(path.join(output,'browser-errors.json'),JSON.stringify(errors,null,2));
  writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',session,url,checks},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,output}));
}catch(error){
  writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'failed',session,url,checks,error:error.stack},null,2));try{capture('failure.png');}catch{}console.error(error);process.exitCode=1;
}finally{try{command('close');}catch{}if(child?.connected)await stop();}
