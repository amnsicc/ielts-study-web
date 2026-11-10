import {resolveWordSelection,validateWordMapping} from './selection.mjs';
import {createClipPlayer} from './clip-player.mjs';
import {transcriptSelection,wordRange} from './transcript-selection.mjs';

const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function createClipView({root,audio,container}){
  const bar=document.createElement('div');bar.className='clip-bar';bar.id='clip-controls';bar.hidden=true;
  const text=document.createElement('p');text.id='clip-selection';text.className='clip-selection';text.lang='en';
  const status=document.createElement('span');status.id='clip-status';status.className='clip-status';status.setAttribute('role','status');
  const actions=document.createElement('div');actions.className='clip-actions';
  function button(id,label,action){const b=document.createElement('button');b.type='button';b.id=id;b.className='quiet-button';b.textContent=label;b.addEventListener('click',action);actions.append(b);return b;}
  const once=button('clip-once','播放选段一次',()=>void player.play('once'));
  const loop=button('clip-loop','循环选段',()=>void player.play('loop'));
  button('clip-exit','退出选段',()=>{clear();container.querySelector('#toggle-transcript')?.focus();});
  bar.append(text,status,actions);container.append(bar);
  const notice=document.createElement('p');notice.id='clip-availability';notice.className='clip-availability';notice.setAttribute('role','status');container.append(notice);
  let material=null,voice=null,mapping=null,revision=0,dragging=false,lastSelection=null,pointerStart=null,sentenceOpen=false;
  const paragraphs=()=>root.querySelectorAll('.article-body > .article-paragraph');
  function layout(){
    const panel=root.querySelector('.article-panel'),left=root.querySelector('.listening-left');if(!panel||!left)return;
    left.classList.toggle('clip-open',!bar.hidden);
    left.classList.toggle('sentence-open',sentenceOpen);
    panel.style.minHeight=bar.hidden&&!sentenceOpen?'':`${Math.ceil(container.getBoundingClientRect().height+panel.querySelector('.article-toolbar').getBoundingClientRect().height+panel.querySelector('.filter-toolbar').getBoundingClientRect().height+142)}px`;
    const wordPanel=root.querySelector('.word-panel'),wordScroll=root.querySelector('#word-scroll');
    if(wordPanel&&wordScroll){
      const height=e=>e.getBoundingClientRect().height;
      const chrome=[...wordPanel.children].filter(e=>e!==wordScroll).reduce((n,e)=>n+height(e),0);
      const beforeTable=[...wordScroll.children].filter(e=>e.tagName!=='TABLE').reduce((n,e)=>n+height(e),0);
      const head=wordScroll.querySelector('thead')?.getBoundingClientRect().height||0;
      wordPanel.style.minHeight=sentenceOpen?`${Math.ceil(chrome+beforeTable+head+102)}px`:'';
    }
  }
  new ResizeObserver(layout).observe(container);
  const player=createClipPlayer(audio,{onChange:s=>{
    bar.hidden=!s.range;
    if(!s.range){CSS.highlights?.delete('listening-clip');lastSelection=null;layout();return;}
    text.textContent=s.range.text;
    status.textContent=s.error||(s.phase==='playing'?(s.mode==='loop'?'循环播放中':'单次播放中'):s.phase==='ended'?'选段播放结束':s.phase==='paused'?'选段已暂停':'已选完整单词');
    once.setAttribute('aria-pressed',String(s.mode==='once'));loop.setAttribute('aria-pressed',String(s.mode==='loop'));
    layout();
  }});
  function clear(){player.clear();CSS.highlights?.delete('listening-clip');lastSelection=null;}
  async function load(nextMaterial,nextVoice){
    const token=++revision;clear();material=nextMaterial;voice=nextVoice;mapping=null;
    for(const p of paragraphs())p.tabIndex=0;
    notice.textContent='正在准备原稿选段…';
    try{
      const response=await fetch('/data/listening-word-map.json');if(!response.ok)throw new Error('选段时间读取失败，请重新选择材料重试；整篇播放仍可用。');
      const bundle=await response.json();if(bundle.formatVersion!==1)throw new Error('选段资料版本不可用，请重新选择材料重试。');
      const candidate=bundle.materials.find(m=>m.materialId===nextMaterial.id);
      const recording=await fetch(nextVoice.url);if(!recording.ok)throw new Error('当前录音无法验证，选段暂不可用。');
      const audioSha256=await digest(await recording.arrayBuffer());
      const textSha256=await digest(new TextEncoder().encode(JSON.stringify(nextMaterial.paragraphs)));
      validateWordMapping(nextMaterial,candidate,nextVoice.id,{textSha256,audioSha256});
      if(token!==revision)return;mapping=candidate;notice.textContent='选中原稿文字，可播放一次或循环。';
    }catch(e){if(token===revision){mapping=null;notice.textContent=/^(选段|当前录音)/.test(e.message)?e.message:'选段资料暂不可用，请重新选择材料重试；整篇播放和草稿仍可使用。';}}
  }
  function capture(){
    if(!root.isConnected)return;
    const points=transcriptSelection(paragraphs());
    if(!points){if(player.snapshot().range)clear();return;}
    if(!mapping||!voice){clear();return;}
    try{
      const range=resolveWordSelection(material,mapping,voice.id,...points);
      if(!range){clear();return;}
      const key=`${range.first.index}:${range.last.index}`;
      if(key===lastSelection)return;
      player.select(range);lastSelection=key;
      CSS.highlights?.set('listening-clip',new Highlight(wordRange(paragraphs(),range.first,range.last)));
    }catch(e){clear();notice.textContent=e.message;}
  }
  root.addEventListener('pointerdown',e=>{if(e.target.closest('.article-paragraph')){pointerStart=[e.clientX,e.clientY];dragging=false;}else pointerStart=null;});
  root.addEventListener('pointermove',e=>{if(pointerStart&&Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>3)dragging=true;});
  document.addEventListener('pointerup',e=>{
    if(!root.isConnected||e.target.closest('#clip-controls, .answer-feedback'))return;
    if(pointerStart){capture();pointerStart=null;}else if(!e.target.closest('.listening-player'))capture();
  });
  root.addEventListener('click',e=>{if(dragging&&e.target.closest('.article-target')){e.preventDefault();e.stopPropagation();}dragging=false;},true);
  document.addEventListener('keyup',e=>{if(root.isConnected&&(e.shiftKey||e.key==='Escape')){if(e.key==='Escape')clear();else capture();}});
  root.addEventListener('keydown',e=>{
    if(e.target.matches('.article-paragraph')&&e.shiftKey&&e.key.startsWith('Arrow')){
      const selection=getSelection();
      if(!e.target.contains(selection.anchorNode))selection.collapse(e.target.firstChild,0);
      selection.modify('extend',e.key==='ArrowLeft'||e.key==='ArrowUp'?'backward':'forward',e.key==='ArrowUp'||e.key==='ArrowDown'?'line':e.ctrlKey?'word':'character');
      e.preventDefault();
    }
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&player.snapshot().range)audio.pause();});
  return {load,clear,setSentenceOpen(value){sentenceOpen=value;layout();},rewind:seconds=>player.rewind(seconds),leave(){revision++;clear();},snapshot:player.snapshot};
}
