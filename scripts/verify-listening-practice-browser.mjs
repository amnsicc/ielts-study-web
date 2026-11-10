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
 child.stdout.on('data',d=>appendFileSync(path.join(output,'server.log'),d));child.stderr.on('data',d=>appendFileSync(path.join(output,'server.log'),d));
 url=await new Promise((resolve,reject)=>{child.once('message',m=>resolve(m.url));child.once('error',reject);});
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/#/listening');await page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent==='草稿已保存（本机）');
 await page.locator('#check-listening').waitFor({state:'visible',timeout:3000});
 await page.click('#check-listening');await page.waitForFunction(()=>document.querySelector('#practice-status')?.textContent.includes('至少一个有效序号'));
 assert.equal((await (await fetch(url+'/api/listening/practice')).json()).materials['listening:short'].rounds[0].first,null);check('全空首次不冻结0%结果，输入保持可用');
 await page.locator('[data-answer-for="word:1"]').fill('1、2');await page.click('#check-listening');
 await page.waitForFunction(()=>document.querySelector('#practice-summary')?.textContent.includes('50%'));
 assert.ok((await page.locator('#practice-summary').innerText()).includes('首次核对'));
 const v=await (await fetch(url+'/api/listening/practice')).json();assert.equal(v.materials['listening:short'].rounds[0].first.result.percentage,50);
 check('真实页面首次核对按已填事件计算50%，服务端冻结快照');
 await page.screenshot({path:path.join(output,'first.png')});
 const read=async()=> (await (await fetch(url+'/api/listening/practice')).json()).materials['listening:short'];
 const saved=()=>page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent==='草稿已保存（本机）');
 await page.locator('[data-answer-for="word:1"]').fill('1');await saved();await page.click('#check-listening');
 await page.waitForFunction(()=>document.querySelector('#practice-summary')?.textContent.includes('第1次订正'));
 let practice=await read();assert.equal(practice.rounds[0].first.result.percentage,50);assert.equal(practice.rounds[0].corrections[0].result.percentage,100);
 check('核对订正另存100%，首次仍50%且原始输入不变');
 page.once('dialog',d=>d.dismiss());await page.click('#new-listening-round');assert.equal((await read()).rounds.length,1);
 await page.locator('audio').evaluate(a=>a.currentTime=20);page.once('dialog',d=>d.accept());await page.click('#new-listening-round');await page.waitForFunction(()=>document.querySelector('#practice-round')?.textContent==='第2轮');assert.ok(await page.locator('audio').evaluate(a=>a.currentTime)<.1);
 await page.waitForFunction(()=>document.querySelector('[data-answer-for="word:1"]').value==='');
 assert.equal((await read()).rounds[0].draft.answers['word:1'],'1');
 await page.locator('[data-answer-for="word:1"]').fill('7');await saved();
 await page.click('#listening-history');await page.locator('#practice-history-dialog').waitFor({state:'visible'});
 assert.equal(await page.locator('.history-round').count(),2);assert.ok((await page.locator('.history-round').first().innerText()).includes('50%'));
 await page.keyboard.press('Escape');assert.equal(await page.locator('[data-answer-for="word:1"]').inputValue(),'7');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'listening-history');
 check('新轮确认/取消、空输入、旧稿归档及历史只读，关闭返回入口焦点');
 await page.reload();await saved();await page.waitForFunction(()=>document.querySelector('#practice-round')?.textContent==='第2轮');
 assert.equal(await page.locator('[data-answer-for="word:1"]').inputValue(),'7');
 await page.click('#check-listening');await page.waitForFunction(()=>document.querySelector('#practice-summary')?.textContent.includes('0%'));
 assert.equal((await read()).rounds[1].first.result.correct,0);assert.equal((await read()).rounds[0].first.result.percentage,50);
 check('重开恢复当前轮草稿，当前首次和旧轮首次互不覆盖');
 await page.locator('[data-answer-for="word:1"]').fill('3?');await saved();await page.click('#check-listening');
 await page.waitForFunction(()=>document.querySelector('#practice-status')?.textContent.includes('无效序号'));
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.answerFor),'word:1');assert.equal((await read()).rounds[1].corrections.length,0);
 await page.locator('[data-answer-for="word:1"]').fill('？');await saved();await page.click('#check-listening');
 await page.waitForFunction(()=>document.querySelector('#practice-status')?.textContent.includes('至少一个有效序号'));
 assert.equal((await read()).rounds[1].corrections.length,0);
 check('非法格式定位原输入，单问号不给假0%订正，原数据保留');
 await page.locator('[data-answer-for="word:1"]').fill('1');await saved();
 writeFileSync(path.join(directory,'practice-fail-before'),'isolated');await page.click('#check-listening');
 await page.waitForFunction(()=>document.querySelector('#practice-status')?.textContent.includes('写前失败'));
 assert.equal(await page.locator('[data-answer-for="word:1"]').isDisabled(),true);assert.equal((await read()).rounds[1].corrections.length,0);
 const pendingId=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ielts-practice-outbox-v1')).operation.operationId);
 page.once('dialog',d=>d.accept());await page.reload();await saved();await page.waitForFunction(()=>document.querySelector('#retry-practice')&&!document.querySelector('#retry-practice').hidden);
 assert.equal(await page.locator('[data-answer-for="word:1"]').isDisabled(),true);
 unlinkSync(path.join(directory,'practice-fail-before'));await page.click('#retry-practice');await page.waitForFunction(()=>document.querySelector('#practice-summary')?.textContent.includes('第1次订正'));
 assert.equal((await read()).rounds[1].corrections[0].operationId,pendingId);check('写前失败锁定新动作，原待办刷新保留，同ID重试只追加一次订正');
 writeFileSync(path.join(directory,'practice-lose-response'),'isolated');await page.locator('[data-answer-for="word:1"]').fill('1、2');await saved();await page.click('#check-listening');
 await page.waitForFunction(()=>document.querySelector('#practice-status')?.textContent.includes('回执丢失'));assert.equal((await read()).rounds[1].corrections.length,2);
 unlinkSync(path.join(directory,'practice-lose-response'));await page.click('#retry-practice');await page.waitForFunction(()=>document.querySelector('#practice-summary')?.textContent.includes('第2次订正'));
 assert.equal((await read()).rounds[1].corrections.length,2);check('核对回执丢失后原ID重试幂等，无重复订正');
 const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(url+'/#/listening');await second.waitForFunction(()=>document.querySelector('#practice-round')?.textContent==='第2轮');
 page.once('dialog',d=>d.accept());await page.click('#new-listening-round');await page.waitForFunction(()=>document.querySelector('#practice-round')?.textContent==='第3轮');
 await second.click('#check-listening');await second.waitForFunction(()=>document.querySelector('#practice-status')?.textContent.includes('另一窗口改变'));
 assert.equal(await second.locator('[data-answer-for="word:1"]').inputValue(),'1、2');
 await second.click('#compare-practice');await second.waitForFunction(()=>!document.querySelector('#practice-remote').hidden);
 assert.equal(await second.locator('#adopt-practice').isVisible(),true);assert.equal(await second.locator('[data-answer-for="word:1"]').isDisabled(),true);
 second.once('dialog',d=>d.dismiss());await second.click('#adopt-practice');assert.equal(await second.locator('[data-answer-for="word:1"]').inputValue(),'1、2');
 second.once('dialog',d=>d.accept());await second.click('#adopt-practice');await second.waitForFunction(()=>document.querySelector('#practice-round')?.textContent==='第3轮'&&!document.querySelector('[data-answer-for="word:1"]').disabled);
 assert.equal(await second.locator('[data-answer-for="word:1"]').inputValue(),'');await second.close();
 check('双窗口旧轮核对冲突保留输入，查看远端后仍可取消或明确采用，不跨轮覆盖');
 const recordsBefore=await (await fetch(url+'/api/records')).json();
 await page.selectOption('#material-select','listening:long');await saved();
 await page.locator('[data-answer-for="word:4"]').fill('16、19');await page.locator('[data-answer-for="word:8"]').fill('1、39');await page.click('#check-listening');
 await page.waitForFunction(()=>document.querySelector('#practice-summary')?.textContent.includes('答对 4个 · 共39个'));
 const longState=(await (await fetch(url+'/api/listening/practice')).json()).materials['listening:long'];
 assert.equal(longState.rounds[0].first.result.totalExpected,39);assert.equal(longState.rounds[0].first.voice.id,'en-GB-SoniaNeural');
 const oxygen=page.locator('[data-target-id="word:4"] .answer-feedback');await oxygen.locator('summary').click();assert.equal(await oxygen.locator('.answer-key').innerText(),'答案：16、19');assert.equal(await oxygen.locator('[data-locate-sentence]').count(),2);
 const recordsAfter=await (await fetch(url+'/api/records')).json();assert.deepEqual(recordsAfter.counts,recordsBefore.counts);assert.equal((await read()).rounds[0].first.result.percentage,50);
 check('长篇重复目标按39事件核对、实际形式原句可展开，跨材料和次数互不污染');
 await page.selectOption('#material-select','listening:short');await saved();
 const input=page.locator('[data-answer-for="word:1"]');
 await input.evaluate(e=>e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'1'})));await input.fill('1');await page.click('#check-listening');
 assert.ok((await page.locator('#practice-status').innerText()).includes('完成当前中文输入'));
 assert.equal((await read()).rounds[2].first,null);
 await input.evaluate(e=>e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'1'})));await page.click('#check-listening');await page.waitForFunction(()=>document.querySelector('#practice-summary')?.textContent.includes('100%'));
 check('composition系统事件边界：组合中不核对，结束后保存再核对；非真人IME认证');
 await page.selectOption('#listening-voice','en-US-GuyNeural');await saved();await input.fill('1、1 ?');await page.click('#check-listening');await page.waitForFunction(()=>document.querySelector('#practice-summary')?.textContent.includes('第1次订正'));
 const active=(await read()).rounds[2];assert.equal(active.first.voice.id,'en-US-JennyNeural');assert.equal(active.corrections[0].voice.id,'en-US-GuyNeural');assert.equal(active.corrections[0].result.submitted,1);
 assert.deepEqual(active.corrections[0].result.rows['word:1'].duplicates,[1]);assert.equal(await page.locator('[data-target-id="word:1"] .answer-key').innerText(),'答案：1');
 check('切声不换轮，首次声音版本固定，订正记录新声音及保持同行去重数据');
 for(const [width,height] of [[1440,1000],[1042,811],[900,700],[497,811]]){
  await page.setViewportSize({width,height});await page.locator('#check-listening').scrollIntoViewIfNeeded();assert.ok(await page.locator('.listening-layout').evaluate(e=>e.scrollWidth<=e.clientWidth));
  assert.ok(await page.locator('#answer-scroll').evaluate(e=>e.clientHeight>100));
  await page.screenshot({path:path.join(output,'practice-'+width+'.png')});await page.click('#listening-history');assert.equal(await page.locator('#practice-history-dialog').isVisible(),true);
  await page.screenshot({path:path.join(output,'history-'+width+'.png')});await page.keyboard.press('Escape');
  check(width+'桌面窗口填写、结果、历史和关闭均可达');
 }





 await page.setViewportSize({width:1440,height:1000});await page.locator('[data-answer-for="word:1"]').fill('1');await saved();
 writeFileSync(path.join(directory,'practice-fail-before'),'isolated');await page.click('#check-listening');await page.waitForFunction(()=>document.querySelector('#practice-status')?.textContent.includes('写前失败'));
 const recoverId=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ielts-practice-outbox-v1')).operation.operationId);
 page.once('dialog',d=>d.accept());await page.close();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/#/listening');await saved();
 await page.locator('#recover-practice-0').waitFor({state:'visible'});await page.click('#recover-practice-0');assert.equal(await page.locator('[data-answer-for="word:1"]').isDisabled(),true);
 unlinkSync(path.join(directory,'practice-fail-before'));await page.click('#retry-practice');await page.waitForFunction(()=>document.querySelector('#practice-summary')?.textContent.includes('第2次订正'));
 const restored=(await read()).rounds[2];assert.equal(restored.corrections.length,2);assert.equal(restored.corrections[1].operationId,recoverId);
 assert.equal(await page.evaluate(id=>Object.keys(localStorage).filter(k=>k.startsWith('ielts-practice-recovery:')).some(k=>JSON.parse(localStorage.getItem(k)).operation.operationId===id),recoverId),false);
 check('关闭旧标签后新标签明确恢复核对待办、同ID重试，确认后清对应备份');
 writeFileSync(path.join(directory,'practice-lose-response'),'isolated');page.once('dialog',d=>d.accept());await page.click('#new-listening-round');await page.waitForFunction(()=>document.querySelector('#practice-status')?.textContent.includes('回执丢失'));
 assert.equal((await read()).rounds.length,4);assert.equal(await page.locator('.answer-input').first().isDisabled(),true);
 unlinkSync(path.join(directory,'practice-lose-response'));await page.click('#retry-practice');await page.waitForFunction(()=>document.querySelector('#practice-round')?.textContent==='第4轮'&&!document.querySelector('.answer-input').disabled);
 assert.equal((await read()).rounds.length,4);assert.equal(await page.locator('.answer-input').first().inputValue(),'');check('新轮回执丢失后同ID重试只建一轮，旧轮输入和结果仍在');


 writeFileSync(path.join(directory,'practice-read-fail'),'isolated');const unread=await context.newPage();unread.on('pageerror',e=>errors.push(e.message));await unread.goto(url+'/#/listening');await unread.waitForFunction(()=>document.querySelector('#practice-status')?.textContent.includes('练习读取失败'));
 assert.equal(await unread.locator('#check-listening').isDisabled(),true);assert.equal(await unread.locator('#practice-summary').isVisible(),false);
 assert.equal(await unread.locator('.answer-input').first().isEnabled(),true);unlinkSync(path.join(directory,'practice-read-fail'));await unread.click('#retry-practice');await unread.waitForFunction(()=>!document.querySelector('#check-listening').disabled);await unread.close();
 check('练习首次读取失败不冒充零成绩，保留草稿可用且可重试');
 assert.deepEqual(errors,[]);await context.tracing.stop({path:path.join(output,'trace.zip')});
 writeFileSync(path.join(output,'result.json'),JSON.stringify({url,checks,errors},null,2)+'\n');
}catch(e){if(page)await page.screenshot({path:path.join(output,'failure.png')});writeFileSync(path.join(output,'failure.json'),JSON.stringify({url,checks,errors,error:e.stack},null,2));throw e;}
finally{await browser?.close();if(child?.connected){await new Promise(resolve=>{child.once('exit',resolve);child.send('close');});}}
