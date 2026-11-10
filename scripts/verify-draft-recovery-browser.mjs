// Existing Playwright handles native beforeunload dialogs that time out in this machine's CLI.
import {createRequire} from 'node:module';
import {fork} from 'node:child_process';
import {mkdirSync,writeFileSync,appendFileSync,unlinkSync,readFileSync} from 'node:fs';
import path from 'node:path';import assert from 'node:assert/strict';
const args=process.argv.slice(2),output=path.resolve(args[args.indexOf('--output')+1]);mkdirSync(output,{recursive:false});
const directory=path.join(output,'records-data');mkdirSync(directory);
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'D:/codex_project/雅思备考/readest-ielts/apps/readest-app/node_modules/playwright');
const child=fork(new URL('./listening-test-server.mjs',import.meta.url),[directory,'0'],{silent:true});
child.stdout.on('data',d=>appendFileSync(path.join(output,'server.log'),d));child.stderr.on('data',d=>appendFileSync(path.join(output,'server.log'),d));
const {url}=await new Promise((r,j)=>{child.once('message',r);child.once('error',j);});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.tracing.start({screenshots:true,snapshots:true});
const checks=[],dialogs=[];context.on('page',p=>p.on('dialog',async d=>{dialogs.push({type:d.type(),message:d.message()});await d.accept();}));
const check=(name,detail)=>{checks.push({name,passed:true,detail});console.log(name);};
const saved=page=>page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent==='草稿已保存（本机）');
try{
 let p=await context.newPage();await p.goto(url+'/#/listening');await saved(p);
 writeFileSync(path.join(directory,'draft-fail-before'),'isolated');await p.locator('[data-answer-for="word:1"]').fill('4、9?');
 await p.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('写前失败'));
 await p.reload();await p.waitForFunction(()=>document.querySelector('#draft-status')?.textContent.includes('写前失败'));
 assert.equal(await p.locator('[data-answer-for="word:1"]').inputValue(),'4、9?');
 await p.screenshot({path:path.join(output,'01-pending-reload.png')});
 check('未确认输入遇原生beforeunload提示，接受刷新后待办和原字符串恢复');
 await p.close();p=await context.newPage();await p.goto(url+'/#/listening');await saved(p);
 assert.equal(await p.locator('[data-answer-for="word:1"]').inputValue(),'');
 await p.locator('#recover-draft-0').click();await p.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('写前失败'));
 assert.equal(await p.locator('[data-answer-for="word:1"]').inputValue(),'4、9?');
 unlinkSync(path.join(directory,'draft-fail-before'));await p.locator('#retry-drafts').click();await saved(p);
 const view=await (await context.request.get(url+'/api/listening/drafts')).json();assert.equal(view.drafts['listening:short'].answers['word:1'],'4、9?');
 check('关闭原标签再新开，发现本地备份并明确恢复后可原操作保存');
 // A new server identity at the same origin must reject an old-directory outbox before writing.
 const bad=await context.request.post(url+'/api/listening/drafts/operations',{headers:{origin:url,'x-data-store-id':'foreign-store'},data:{operationId:'foreign',materialId:'listening:short',version:'foreign',expectedRevision:0,answers:{},context:{}}});
 assert.equal(bad.status(),409);check('数据目录身份不匹配的待办拒绝跨目录写入');
 const catalog=JSON.parse(readFileSync(new URL('../data/listening-catalog.json',import.meta.url),'utf8'));
 await p.selectOption('#word-scope','all');await p.selectOption('#global-display','both');
 // Real DOM buttons, no internal view/model hooks. Bulk dispatch only reduces driver round trips.
 await p.evaluate(()=>{for(const b of document.querySelectorAll('[data-expand][aria-expanded=false]'))b.click();});
 const rows=await p.locator('[data-entry-id]').evaluateAll(rows=>rows.map(r=>({id:r.dataset.entryId,word:r.querySelector('.entry-word').textContent,hidden:r.hidden,senses:[...r.querySelectorAll('.gloss')].map(g=>({pos:g.querySelector('.sense-pos').textContent,text:g.querySelector('.sense-text').textContent,grade:g.querySelector('.sense-grade').textContent,primary:g.querySelector('.sense-text').classList.contains('primary-sense')}))})));
 const expected=catalog.flatMap(g=>[g,...g.extras]).map(e=>({id:e.id,word:e.word,hidden:false,senses:e.senses.map(s=>({pos:s.pos,text:s.text,grade:`P${s.grade}`,primary:s.primary}))}));
 assert.deepEqual(rows,expected);writeFileSync(path.join(output,'all-listening-rows.json'),JSON.stringify(rows,null,2));
 check('全部187母词415义及137拓展241义在真实页面完整呈现，顺序/P档/主要义一致');
 await p.click('.reset-view');
 for(const width of [1440,900]){
  await p.setViewportSize({width,height:1000});const divider=p.locator('#listening-column-divider');await divider.focus();
  const before=await p.locator('.listening-left-region').boundingBox();await p.keyboard.press('ArrowLeft');await p.keyboard.press('ArrowLeft');
  const after=await p.locator('.listening-left-region').boundingBox();assert.ok(after.width<before.width-1,{width,before:before.width,after:after.width});
 }
 await p.setViewportSize({width:1440,height:1000});await p.click('#toggle-transcript');
 const upper=await p.locator('#word-scroll').boundingBox();await p.locator('#reading-divider').focus();await p.keyboard.press('ArrowDown');
 assert.ok((await p.locator('#word-scroll').boundingBox()).height>upper.height);
 await p.screenshot({path:path.join(output,'02-dividers.png')});check('1440/900桌面左右分隔实际改变宽度，展开原稿后上下分隔实际改变高度');
 // R1 removes normal-page export. Validate the retained public preservation API honestly.
 assert.equal(await p.locator('#export-drafts').count(),0);
 const exportResponse=await context.request.get(url+'/api/listening/drafts/export');assert.equal(exportResponse.status(),200);
 writeFileSync(path.join(output,'http-exported-drafts.json'),await exportResponse.body());const exported=JSON.parse(readFileSync(path.join(output,'http-exported-drafts.json'),'utf8'));
 assert.equal(exported.format,'ielts-listening-drafts');assert.equal(exported.view.drafts['listening:short'].answers['word:1'],'4、9?');
 check('听力页面不提供导出入口，保留的公开HTTP保全接口可读取正确已存稿');
 writeFileSync(path.join(directory,'draft-lose-response'),'isolated');await p.locator('[data-answer-for="word:1"]').fill('40');
 await p.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('回执丢失'));
 await p.locator('[data-answer-for="word:1"]').fill('41');
 const beforeConcurrent=await (await context.request.get(url+'/api/listening/drafts')).json();
 const material=(await (await context.request.get(url+'/data/listening-materials.json')).json())[0];
 await context.request.post(url+'/api/listening/drafts/operations',{headers:{origin:url,'x-data-store-id':beforeConcurrent.storeId},data:{operationId:'other-window-after-lost-receipt',materialId:material.id,version:material.version,expectedRevision:beforeConcurrent.drafts[material.id].revision,answers:{'word:1':'42'},context:{voiceId:material.voices[0].id,position:0}}});
 unlinkSync(path.join(directory,'draft-lose-response'));await p.locator('#retry-drafts').click();
 await p.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('冲突'));
 assert.equal(await p.locator('[data-answer-for="word:1"]').inputValue(),'41');
 const afterConcurrent=await (await context.request.get(url+'/api/listening/drafts')).json();assert.equal(afterConcurrent.drafts[material.id].answers['word:1'],'42');
 check('旧操作回执丢失后远端继续更新，新本地输入不能借幂等回执自动覆盖远端');
 let releaseRemote,remoteRequested;
 const gate=new Promise(r=>releaseRemote=r),requested=new Promise(r=>remoteRequested=r);
 await p.route('**/api/listening/drafts',async route=>{remoteRequested();await gate;await route.continue();});
 await p.locator('#use-remote-drafts').click();await requested;
 assert.equal(await p.locator('[data-answer-for="word:1"]').isDisabled(),true);
 releaseRemote();await saved(p);await p.unroute('**/api/listening/drafts');
 assert.equal(await p.locator('[data-answer-for="word:1"]').inputValue(),'42');
 check('确认采用远端后读取期间锁定本篇输入，避免异步回执丢弃新输入');
 assert.ok(dialogs.some(d=>d.type==='beforeunload'));
 writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'passed',url,checks,dialogs},null,2));
}catch(error){writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'failed',url,checks,dialogs,error:error.stack},null,2));console.error(error);process.exitCode=1;}
finally{await context.tracing.stop({path:path.join(output,'trace.zip')});await browser.close();const done=new Promise(r=>child.once('exit',r));child.send('close');await done;}
