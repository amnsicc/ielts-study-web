import {fork} from 'node:child_process';
import {mkdirSync,writeFileSync,appendFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'D:/codex_project/雅思备考/readest-ielts/apps/readest-app/node_modules/playwright');
const args=process.argv.slice(2),output=path.resolve(args[args.indexOf('--output')+1]);mkdirSync(output,{recursive:false});
const directory=path.join(output,'records-data');mkdirSync(directory);
const checks=[],errors=[];let browser,child,url,page;
function check(name,detail){checks.push({name,passed:true,detail});console.log(name);}
try{
 child=fork(new URL('./listening-test-server.mjs',import.meta.url),[directory,'0'],{silent:true});
 child.stdout.on('data',d=>appendFileSync(path.join(output,'server.log'),d));child.stderr.on('data',d=>appendFileSync(path.join(output,'server.log'),d));url=await new Promise((resolve,reject)=>{child.once('message',m=>resolve(m.url));child.once('error',reject);});
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/#/listening');
 await page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent==='草稿已保存（本机）'&&!document.querySelector('#check-listening').disabled);
 await page.locator('[data-answer-for="word:1"]').fill('1、2');await page.click('#check-listening');await page.waitForFunction(()=>document.querySelector('#practice-summary')?.textContent.includes('50%'));
 assert.equal((await page.locator('#practice-summary').innerText()).trim(),'首次核对：正确率 50% · 答对 1个 · 共7个');
 const row=page.locator('[data-target-id="word:1"]');assert.equal((await row.locator('.answer-feedback > p').innerText()).trim(),'答案：1');
 const bodyText=await page.locator('.listening-answers').innerText();for(const text of ['上次核对原填','超出本篇事件范围','未对应答案','同行重复号','仅按已填序号','继续修改属于订正'])assert.equal(bodyText.includes(text),false,text);
 const frozenFirst=(await (await fetch(url+'/api/listening/practice')).json()).materials['listening:short'].rounds[0].first;
 check('主结果三项及逐词答案精简，冗余常驻诊断和成功解释消失');
 await page.click('#listening-history');assert.equal(await page.locator('.history-round > details').first().locator('summary').innerText(),'首次核对：正确率 50% · 答对 1个 · 共7个');await page.keyboard.press('Escape');check('历史与主区统一正确率/答对数/整篇总数');
 await page.screenshot({path:path.join(output,'r1-summary.png')});
 assert.equal(await page.locator('#article-scroll').isVisible(),false);
 await row.locator('.answer-feedback > details > summary').click();const sentence=row.locator('[data-locate-sentence]').first();await sentence.waitFor({state:'visible',timeout:3000});await sentence.click();
 assert.equal(await page.locator('#article-scroll').isVisible(),true);
 const selected=await page.evaluate(()=>[...CSS.highlights.get('listening-sentence')][0].toString());
 assert.equal(selected,'The aim is to create a relaxed atmosphere, so please let the children suggest answers before you explain anything.');
 check('点原句自动展开并高亮跨目标按钮的整句，而非整个段落');
 const definitions=(await (await fetch(url+'/data/listening-answers.json')).json()).definitions;
 const saved=()=>page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent==='草稿已保存（本机）');
 const highlight=()=>page.evaluate(()=>{const h=CSS.highlights.get('listening-sentence');return h?[...h][0].toString():null;});
 let count=0;
 for(const d of definitions){
  if(d.materialId==='listening:long'){
   await page.selectOption('#material-select',d.materialId);await page.locator('[data-answer-for="word:4"]').fill('16、19');await page.click('#check-listening');
   await page.waitForFunction(()=>document.querySelector('#practice-summary')?.textContent.includes('共39个'));
   assert.equal((await page.locator('#practice-summary').innerText()).trim(),'首次核对：正确率 100% · 答对 2个 · 共39个');
  }
  await page.waitForFunction(()=>document.querySelector('audio').readyState>=2);await page.locator('audio').evaluate(a=>a.currentTime=11);await saved();
  const original=await page.locator('.article-body').textContent();
  for(const t of d.targets){
   const feedback=page.locator(`[data-target-id="${t.id}"] .answer-feedback`);
   if(!await feedback.locator('details').evaluate(e=>e.open))await feedback.locator('summary').click();
   for(const o of t.occurrences){
    const link=feedback.locator(`[data-locate-sentence="${o.number}"]`);await link.scrollIntoViewIfNeeded();
    const before=await page.locator('#answer-scroll').evaluate(e=>e.scrollTop);await link.click();await page.waitForFunction(()=>CSS.highlights.has('listening-sentence'));
    assert.equal(await highlight(),o.sentence);assert.ok(await page.locator('#article-scroll').evaluate(e=>e.clientHeight>=120));
    assert.ok(Math.abs(await page.locator('#answer-scroll').evaluate(e=>e.scrollTop)-before)<=1);
    assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);assert.ok(Math.abs(await page.locator('audio').evaluate(a=>a.currentTime)-11)<.05);
    const visible=await page.evaluate(()=>{const r=[...CSS.highlights.get('listening-sentence')][0].getClientRects()[0],s=document.querySelector('#article-scroll').getBoundingClientRect();return r.bottom>s.top&&r.top<s.bottom;});assert.equal(visible,true);
    count++;
   }
  }
  assert.equal(await page.locator('.article-body').textContent(),original);
 }
 assert.equal(count,46);check('46处原句逐一点击，重复目标正确定位、正文不改、右区位置和暂停进度保持',{sentences:count});
 await page.locator('#target-highlight').uncheck();assert.equal(await highlight(),definitions[1].targets.at(-1).occurrences.at(-1).sentence);check('目标高亮开关不取消整句定位高亮');
 await page.click('#toggle-transcript');assert.equal(await highlight(),null);
 const lastLink=page.locator('[data-locate-sentence]').last();await lastLink.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>CSS.highlights.has('listening-sentence'));assert.equal(await page.locator('#article-scroll').isVisible(),true);
 check('收原稿清定位高亮，Tab可达的原句入口Enter重新展开定位');
 await page.selectOption('#material-select','listening:short');assert.equal(await highlight(),null);
 await page.locator('[data-target-id="word:1"] .answer-feedback summary').click();await page.locator('[data-sentence-target="word:1"]').first().click();await page.waitForFunction(()=>CSS.highlights.has('listening-sentence'));
 await page.locator('.reset-view').click();assert.equal(await highlight(),null);assert.equal(await page.locator('#article-scroll').isVisible(),false);
 check('换篇和重置清旧高亮，首次数据不清');
 await page.waitForFunction(()=>document.querySelector('audio').readyState>=2);await page.locator('audio').evaluate(a=>a.currentTime=15);await saved();
 await page.locator('[data-target-id="word:1"] .answer-feedback summary').click();await page.locator('audio').evaluate(a=>a.play());
 await page.waitForFunction(()=>!document.querySelector('audio').paused);
 await page.evaluate(()=>{window.navigationMedia=[];const a=document.querySelector('audio');for(const type of ['pause','seeking','play'])a.addEventListener(type,()=>window.navigationMedia.push({type,time:a.currentTime}));});
 await page.locator('[data-sentence-target="word:1"]').click();await page.waitForFunction(()=>CSS.highlights.has('listening-sentence'));
 assert.equal(await page.locator('audio').evaluate(a=>a.paused),false);assert.deepEqual(await page.evaluate(()=>window.navigationMedia),[]);
 await page.locator('audio').evaluate(a=>a.pause());await saved();check('整篇正在播放时原句定位不暂停、不seek，也不额外播放');
 await page.evaluate(()=>{const p=document.querySelector('.article-paragraph'),r=document.createRange();r.setStart(p.firstChild,1);r.setEnd(p.firstChild,4);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',shiftKey:true,bubbles:true}));});
 await page.click('#clip-loop');await page.waitForFunction(()=>!document.querySelector('audio').paused);
 const core=page.locator('[data-target-id="word:8"] .answer-feedback');if(!await core.locator('details').evaluate(e=>e.open))await core.locator('summary').click();
 await core.locator('[data-locate-sentence]').click();await page.waitForFunction(()=>[...CSS.highlights.get('listening-sentence')][0].toString().startsWith('At the core'));
 assert.equal(await page.locator('#clip-status').innerText(),'循环播放中');assert.equal(await page.locator('audio').evaluate(a=>a.paused),false);assert.equal(await page.evaluate(()=>CSS.highlights.has('listening-clip')),true);
 await page.click('#clip-exit');assert.ok(await highlight());check('循环播放和选段蓝色高亮独立，点原句保留循环；退出选段不清句高亮');
 await page.selectOption('#word-scope','all');await page.selectOption('#word-grade','1');await page.fill('#word-query','ATM');
 await page.focus('#reading-divider');await page.keyboard.press('End');
 for(const [width,height] of [[1440,1000],[1042,811],[888,812],[900,700],[497,811]]){
  await page.setViewportSize({width,height});const proportion=await page.locator('#reading-divider').getAttribute('aria-valuenow');
  const link=page.locator('[data-sentence-target="word:8"]');await link.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>CSS.highlights.has('listening-sentence'));
  assert.ok(await page.locator('#article-scroll').evaluate(e=>e.clientHeight>=120));assert.ok(await page.locator('#word-scroll').evaluate(e=>e.clientHeight>e.querySelector('thead').getBoundingClientRect().height+40),'定位后词表不能只剩表头');assert.equal(await page.locator('#reading-divider').getAttribute('aria-valuenow'),proportion);
  assert.equal(await page.locator('#word-query').inputValue(),'ATM');assert.equal(await page.locator('#word-grade').inputValue(),'1');
  assert.equal(await page.locator('[data-answer-for="word:1"]').inputValue(),'1、2');assert.ok(await page.locator('.listening-layout').evaluate(e=>e.scrollWidth<=e.clientWidth));
  await page.screenshot({path:path.join(output,'sentence-'+width+'.png')});check(width+'桌面窗口正文可见，关键词/P档/分隔设置与作答保留');
 }

 await page.locator('.article-target').first().click();await page.locator('dialog[open]').waitFor({state:'visible'});assert.ok((await page.locator('dialog[open]').innerText()).includes('atmosphere'));await page.keyboard.press('Escape');check('整句高亮不改目标按钮DOM，普通点击查义和关闭仍可用');
 await page.click('.back-link');await page.waitForFunction(()=>document.querySelector('.module-listening'));assert.equal(await highlight(),null);await page.click('.module-listening');
 check('离页清整句高亮，再回听力保留作答与首次结果');

 await page.locator('[data-answer-for="word:1"]').fill('9');await saved();assert.ok((await page.locator('#practice-summary').innerText()).includes('答对 1个 · 共7个'));assert.equal(await page.locator('[data-target-id="word:1"] .answer-key').innerText(),'答案：1');
 const unchanged=(await (await fetch(url+'/api/listening/practice')).json()).materials['listening:short'].rounds[0].first;assert.deepEqual(unchanged,frozenFirst);check('编辑新输入不误判为旧结果，全部导航后首次快照逐字段保持');
 for(const kind of ['version','sentence']){
  const bad=await context.newPage();bad.on('pageerror',e=>errors.push(e.message));await bad.route('**/api/listening/practice',async route=>{const response=await route.fetch(),value=await response.json(),d=value.materials['listening:short'].rounds[0].first.definition;
   if(kind==='version')d.materialVersion='wrong';else d.targets[0].occurrences[0].sentence='missing original sentence';await route.fulfill({response,json:value});});
  await bad.goto(url+'/#/listening');await bad.waitForFunction(()=>document.querySelector('#practice-summary')?.textContent.includes('50%'));
  await bad.locator('[data-target-id="word:1"] .answer-feedback summary').click();await bad.locator('[data-sentence-target="word:1"]').click();await bad.waitForFunction(()=>document.querySelector('#practice-status')?.textContent.includes('无法定位'));
  assert.equal(await bad.evaluate(()=>CSS.highlights.has('listening-sentence')),false);await bad.close();check(kind+'不匹配明确拒绝定位，不跳错句');
 }



 assert.deepEqual(errors,[]);await context.tracing.stop({path:path.join(output,'trace.zip')});writeFileSync(path.join(output,'result.json'),JSON.stringify({url,checks,errors},null,2)+'\n');
}catch(e){if(page)await page.screenshot({path:path.join(output,'failure.png')});writeFileSync(path.join(output,'failure.json'),JSON.stringify({url,checks,errors,error:e.stack},null,2));throw e;}
finally{await browser?.close();if(child?.connected)await new Promise(resolve=>{child.once('exit',resolve);child.send('close');});}
