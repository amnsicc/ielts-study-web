import {fork} from 'node:child_process';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
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
 await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=2);await page.click('#toggle-transcript');
 await page.evaluate(()=>{const p=document.querySelector('.article-paragraph');const range=document.createRange();range.setStart(p.firstChild,1);range.setEnd(p.firstChild,4);const s=getSelection();s.removeAllRanges();s.addRange(range);document.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',shiftKey:true,bubbles:true}));});
 await page.locator('#clip-once').waitFor({state:'visible',timeout:3000});
 assert.equal(await page.locator('#clip-selection').innerText(),'Before');check('原稿半词选择扩成完整Before，条件操作条出现且不自动播放');
 assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);
 const select=async(p,a,q,b,valid=true)=>{
  await page.evaluate(({p,a,q,b})=>{
   const paras=[...document.querySelectorAll('.article-paragraph')];
   const point=(index,offset)=>{const w=document.createTreeWalker(paras[index],NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(offset<=n.length)return[n,offset];offset-=n.length;}throw new Error('Bad test offset');};
   const selection=getSelection();selection.removeAllRanges();const r=document.createRange();r.setStart(...point(p,a));r.setEnd(...point(q,b));selection.addRange(r);
   document.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',shiftKey:true,bubbles:true}));
  },{p,a,q,b});
  if(valid)await page.locator('#clip-once').waitFor({state:'visible'});
 };
 await page.evaluate(()=>{window.mediaEvidence=[];const audio=document.querySelector('audio');const nativePause=audio.pause.bind(audio);audio.pause=()=>{window.mediaEvidence.push({type:'pause-request',time:audio.currentTime,clock:performance.now(),paused:audio.paused,rate:audio.playbackRate,voice:document.querySelector('#listening-voice')?.value,selection:document.querySelector('#clip-selection')?.textContent});nativePause();};for(const type of ['play','pause','seeking','seeked','ratechange','ended'])audio.addEventListener(type,()=>window.mediaEvidence.push({type,time:audio.currentTime,clock:performance.now(),paused:audio.paused,rate:audio.playbackRate,status:document.querySelector('#clip-status')?.textContent}));window.mediaPoll=setInterval(()=>{if(!audio.paused)window.mediaEvidence.push({type:'progress',time:audio.currentTime,clock:performance.now(),rate:audio.playbackRate});},8);});
 await page.click('#clip-once');await page.waitForFunction(()=>document.querySelector('#clip-status').textContent==='选段播放结束');
 assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);
 assert.ok(Math.abs(await page.locator('audio').evaluate(a=>a.currentTime)-.45)<.02);
 check('真实女声Before单播到末词停止，原音时间0.1—0.45秒');
 await select(0,1,0,16);await page.click('#clip-loop');
 await page.waitForFunction(()=>!document.querySelector('audio').paused);await page.waitForTimeout(2100);
 assert.equal(await page.locator('#clip-status').innerText(),'循环播放中');
 const cycles=await page.evaluate(()=>window.mediaEvidence.filter(x=>x.type==='seeked'&&x.time<.12).length);
 assert.ok(cycles>=3,JSON.stringify(await page.evaluate(()=>window.mediaEvidence)));
 await page.locator('audio').evaluate(a=>a.pause());const paused=await page.locator('audio').evaluate(a=>a.currentTime);
 await page.waitForTimeout(180);assert.equal(await page.locator('audio').evaluate(a=>a.currentTime),paused);
 await page.locator('audio').evaluate(a=>a.play());await page.waitForTimeout(100);await page.click('#rewind-audio');
 assert.ok(await page.locator('audio').evaluate(a=>a.currentTime)>=.1);
 await page.click('#clip-exit');assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);
 assert.equal(await page.locator('#clip-controls').isVisible(),false);check('真实循环多个周期、暂停继续、回退边界及退出可用');
 for(const voice of ['en-US-JennyNeural','en-US-GuyNeural']){
  await page.selectOption('#listening-voice',voice);await page.waitForFunction(()=>document.querySelector('audio').readyState>=2&&document.querySelector('#clip-availability').textContent.includes('可播放一次'));
  for(const speed of ['0.75','1','1.25','1.5']){
   await page.selectOption('#listening-speed',speed);await select(0,1,0,4);await page.click('#clip-once');
   await page.waitForFunction(()=>document.querySelector('#clip-status').textContent==='选段播放结束');
   assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);
  }
  await select(0,1,0,16);await page.click('#clip-loop');await page.waitForTimeout(1400);
  assert.equal(await page.locator('#clip-status').innerText(),'循环播放中');await page.click('#clip-exit');
  check(voice+'四档倍速单播及循环正常');
 }
 await page.selectOption('#material-select','listening:long');await page.waitForFunction(()=>document.querySelector('audio').readyState>=2&&document.querySelector('#clip-availability').textContent.includes('可播放一次'));
 for(const speed of ['0.75','1','1.25','1.5']){await page.selectOption('#listening-speed',speed);await select(0,1,0,4);await page.click('#clip-once');await page.waitForFunction(()=>document.querySelector('#clip-status').textContent==='选段播放结束');}
 await select(0,1,0,14);await page.click('#clip-loop');await page.waitForTimeout(1700);
 assert.equal(await page.locator('#clip-status').innerText(),'循环播放中');await page.click('#clip-exit');check('长篇英音使用独立时间轴单播及循环');

 // Native mouse drag through a target button, rather than a scripted text offset only.
 await page.selectOption('#material-select','listening:short');await page.waitForFunction(()=>document.querySelector('#clip-availability').textContent.includes('可播放一次'));
 const target=page.locator('.article-target').first();await target.scrollIntoViewIfNeeded();
 const coords=await target.evaluate(el=>{const n=el.firstChild;const at=i=>{const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+1);const b=r.getBoundingClientRect();return{x:b.x+1,y:b.y+b.height/2};};return{a:at(2),b:at(6)};});
 await page.mouse.move(coords.a.x,coords.a.y);await page.mouse.down();await page.mouse.move(coords.b.x,coords.b.y,{steps:12});await page.mouse.up();
 assert.equal(await page.locator('#clip-selection').innerText(),'atmosphere');assert.equal(await page.locator('dialog[open]').count(),0);
 check('鼠标从目标按钮内部拖半词，完整atmosphere高亮且不误开查义');
 await page.click('#clip-exit');await page.evaluate(()=>getSelection().removeAllRanges());await target.click();
 assert.equal(await page.locator('dialog[open]').count(),1);await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));check('普通单击目标仍打开本次用义，Esc可关闭');
 const text0=await page.locator('.article-paragraph').first().textContent();
 const end=text0.indexOf('atmosphere')+4;await select(0,2,0,end);
 assert.ok((await page.locator('#clip-selection').innerText()).endsWith('atmosphere'));
 await select(0,text0.length-5,1,4);assert.ok((await page.locator('#clip-selection').innerText()).includes('\n'));
 check('跨目标节点及跨两个段落均按实际正文位置选择');
 await page.evaluate(()=>{const p=document.querySelector('.article-paragraph'),s=getSelection();s.setBaseAndExtent(p.firstChild,4,p.firstChild,1);document.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowLeft',shiftKey:true,bubbles:true}));});
 assert.equal(await page.locator('#clip-selection').innerText(),'Before');
 await page.evaluate(()=>{const s=getSelection(),p=document.querySelector('.article-paragraph');p.focus();s.collapse(p.firstChild,0);});
 await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Shift+ArrowRight');assert.equal(await page.locator('#clip-selection').innerText(),'Before');
 await page.focus('#clip-once');assert.equal(await page.evaluate(()=>document.activeElement.id),'clip-once');assert.equal(await page.locator('dialog[open]').count(),0);await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#clip-status').textContent==='选段播放结束');
 check('反向Range和真实Shift方向键选择、键盘执行单播可用');
 for(const n of [6]){await page.selectOption('#listening-speed','1');await select(0,n,0,n+1,false);assert.equal(await page.locator('#clip-controls').isVisible(),false);}
 await page.evaluate(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('.article-title'));getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',shiftKey:true,bubbles:true}));});
 assert.equal(await page.locator('#clip-controls').isVisible(),false);check('纯空白及标题不当作可播放原稿');
 // Selection style remains even with target highlighting disabled.
 await select(0,1,0,4);await page.locator('#target-highlight').uncheck();
 assert.equal(await page.evaluate(()=>CSS.highlights.has('listening-clip')),true);
 check('选段高亮独立于目标高亮开关');
 // Every cancellation path must leave audio paused and hide clip controls.
 for(const action of ['voice','material','collapse','reset','leave']){
  if(!await page.locator('#article-scroll').isVisible())await page.click('#toggle-transcript');
  await page.waitForFunction(()=>document.querySelector('#clip-availability').textContent.includes('可播放一次'));await select(0,1,0,16);await page.click('#clip-loop');
  if(action==='voice')await page.selectOption('#listening-voice','en-US-GuyNeural');
  if(action==='material')await page.selectOption('#material-select','listening:long');
  if(action==='collapse')await page.click('#toggle-transcript');
  if(action==='reset')await page.click('.reset-view');
  if(action==='leave'){await page.click('.back-link');await page.click('.module-listening');}
  await page.waitForTimeout(120);assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);assert.equal(await page.locator('#clip-controls').isVisible(),false);
  check(action+'取消旧循环，不自动发声');
  await page.selectOption('#material-select','listening:short');
 }
 if(!await page.locator('#article-scroll').isVisible())await page.click('#toggle-transcript');
 await page.waitForFunction(()=>document.querySelector('#clip-availability').textContent.includes('可播放一次'));
 await select(0,1,0,16);await page.click('#clip-loop');await page.click('#restart-audio');
 assert.equal(await page.locator('#clip-controls').isVisible(),false);await page.waitForFunction(()=>!document.querySelector('audio').paused);await page.locator('audio').evaluate(a=>a.pause());
 await select(0,1,0,16);await page.click('#clip-loop');await page.locator('audio').evaluate(a=>a.currentTime=20);
 await page.waitForFunction(()=>document.querySelector('#clip-controls').hidden);await page.locator('audio').evaluate(a=>a.pause());check('从头重听和主动整篇跳进度退出片段模式');
 for(const [width,height] of [[1440,1000],[1042,811],[900,700],[497,811]]){
  await page.setViewportSize({width,height});await select(0,1,0,16);
  assert.ok(await page.locator('#article-scroll').evaluate(e=>e.clientHeight>=120),'选段操作不能挤掉原稿');await page.locator('#clip-controls').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('#clip-controls').evaluate(e=>e.getBoundingClientRect().right<=innerWidth));
  for(const id of ['clip-once','clip-loop','clip-exit'])assert.equal(await page.locator('#'+id).isVisible(),true);
  await page.screenshot({path:path.join(output,'clip-'+width+'.png')});check(width+'桌面窗口选段操作可达且无横向溢出');
 }

 await page.setViewportSize({width:1440,height:1000});await page.selectOption('#listening-speed','1');
 await select(0,1,0,16);await page.click('#clip-loop');
 // Headless Chrome does not emit hidden on tab activation/minimization (see diagnostic logs).
 // Inject only the external document visibility boundary, not a product test API.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(120);assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);
 check('可见性系统边界注入：隐藏即暂停，返回不自动发声（不是有头浏览器最小化认证）');
 await page.click('#clip-exit');
 // Same spelling at different offsets must seek different audio positions.
 let firstTime;
 for(const offset of [7,text0.indexOf('the children')+1]){
  await select(0,offset,0,offset+1);assert.equal(await page.locator('#clip-selection').innerText(),'the');await page.click('#clip-once');await page.waitForFunction(()=>document.querySelector('#clip-status').textContent==='选段播放结束');
  const t=await page.locator('audio').evaluate(a=>a.currentTime);if(firstTime===undefined)firstTime=t;else assert.ok(t>firstTime+5);
 }
 check('相同the按原稿实际位置分别播放，不把所有同拼写一起选中');
 // Last word and partially outside-body selection.
 await page.selectOption('#material-select','listening:long');await page.waitForFunction(()=>document.querySelector('#clip-availability').textContent.includes('可播放一次'));
 const last=await page.locator('.article-paragraph').last().textContent();await select(7,last.indexOf('included')+2,7,last.indexOf('included')+4);await page.click('#clip-once');await page.waitForFunction(()=>document.querySelector('#clip-status').textContent==='选段播放结束');
 assert.ok(Math.abs(await page.locator('audio').evaluate(a=>a.currentTime)-293.354)<.02);check('长篇末词included完整选入，293.354秒结束');
 await page.evaluate(()=>{const r=document.createRange(),h=document.querySelector('.article-title'),p=document.querySelector('.article-paragraph');r.setStart(h.firstChild,0);r.setEnd(p.firstChild,2);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',shiftKey:true,bubbles:true}));});
 assert.equal(await page.locator('#clip-selection').innerText(),'Today');check('选区从标题跨入正文时只取相交的Today');

 const published=await (await fetch(url+'/data/listening-word-map.json')).json();
 for(const map of published.materials){
  await page.selectOption('#material-select',map.materialId);
  for(const [voiceId,timeline] of Object.entries(map.voices)){
   await page.selectOption('#listening-voice',voiceId);await page.waitForFunction(()=>document.querySelector('#clip-availability').textContent.includes('可播放一次'));
   let shortest=0;for(let i=1;i<timeline.words.length;i++)if(timeline.words[i][1]-timeline.words[i][0]<timeline.words[shortest][1]-timeline.words[shortest][0])shortest=i;
   const w=map.words[shortest];await page.selectOption('#listening-speed','1.5');await select(w.paragraphIndex,w.start,w.paragraphIndex,w.end);
   await page.click('#clip-once');await page.waitForFunction(()=>document.querySelector('#clip-status').textContent==='选段播放结束');
   assert.ok(Math.abs(await page.locator('audio').evaluate(a=>a.currentTime)-timeline.words[shortest][1])<.02);
   check(voiceId+'最短时间词'+w.text+'在1.5倍速单播结束',{word:w,start:timeline.words[shortest][0],end:timeline.words[shortest][1]});
  }
 }
 // Invalid published maps cannot affect full audio or drafts; restore is by reselecting.
 for(const kind of ['hash','missing','time','network','audio-bytes']){
  const bad=await context.newPage();bad.on('pageerror',e=>errors.push(e.message));
  await bad.route('**/data/listening-word-map.json',async route=>{
   if(kind==='network')return route.abort('failed');
   const response=await route.fetch(),value=await response.json();
   if(kind==='hash')value.materials[0].voices['en-US-JennyNeural'].audioSha256='wrong';
   if(kind==='missing')value.materials=[];
   if(kind==='time')value.materials[0].voices['en-US-JennyNeural'].words[0]=[0,1000];
   await route.fulfill({response,json:value});
  });
  if(kind==='audio-bytes')await bad.route('**/audio/*.mp3',async route=>{if(route.request().resourceType()!=='fetch')return route.continue();const response=await route.fetch();await route.fulfill({response,body:Buffer.concat([await response.body(),Buffer.from([0])])});});
  await bad.goto(url+'/#/listening');await bad.waitForFunction(()=>document.querySelector('#draft-status')?.textContent==='草稿已保存（本机）');await bad.selectOption('#listening-voice','en-US-JennyNeural');await bad.waitForFunction(()=>{const t=document.querySelector('#clip-availability')?.textContent;return t&&(t.includes('不匹配')||t.includes('不可用'));});
  await bad.click('#toggle-transcript');await bad.locator('.article-paragraph').first().focus();await bad.keyboard.press('Shift+ArrowRight');assert.equal(await bad.locator('#clip-controls').isVisible(),false);
  await bad.click('#restart-audio');await bad.waitForFunction(()=>!document.querySelector('audio').paused);await bad.locator('audio').evaluate(a=>a.pause());
  assert.equal(await bad.locator('.answer-input').first().isEnabled(),true);
  await bad.unrouteAll();await bad.selectOption('#listening-voice','en-US-GuyNeural');await bad.waitForFunction(()=>document.querySelector('#clip-availability').textContent.includes('可播放一次'));
  await bad.close();check(kind+'映射故障拒绝选段、保留整篇原音和草稿，重新选声恢复');
 }
 writeFileSync(path.join(output,'media-evidence.json'),JSON.stringify(await page.evaluate(()=>window.mediaEvidence),null,2));

 await page.screenshot({path:path.join(output,'selection.png')});
 assert.deepEqual(errors,[]);await context.tracing.stop({path:path.join(output,'trace.zip')});
 writeFileSync(path.join(output,'result.json'),JSON.stringify({url,checks,errors},null,2)+'\n');
}catch(e){if(page){writeFileSync(path.join(output,'failure-media.json'),JSON.stringify(await page.evaluate(()=>window.mediaEvidence||[]),null,2));await page.screenshot({path:path.join(output,'failure.png')});}writeFileSync(path.join(output,'failure.json'),JSON.stringify({url,checks,errors,error:e.stack},null,2));throw e;}
finally{await browser?.close();if(child?.connected){await new Promise(resolve=>{child.once('exit',resolve);child.send('close');});}}
