import {readingView} from '../reading/view.mjs';
import {createReadingSession} from '../reading/session.mjs';
import {createRecordsClient} from '../records/client.mjs';
import {createDraftsClient} from './drafts-client.mjs';
import {createClipView} from './clip-view.mjs';
import {createPracticeView} from './practice-view.mjs';

function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
function button(text,id,action){const e=node('button','quiet-button',text);e.type='button';e.id=id;e.addEventListener('click',action);return e;}
export function listeningView(catalog,materials){
  const session=createReadingSession(catalog,materials,'listening'),records=createRecordsClient('listening'),drafts=createDraftsClient(materials);
  const root=node('main','listening-layout'),right=node('section','study-panel listening-answers');
  let current=null,voice=null,draftState=null,visible=false,loaded=false,suppressPosition=false,practiceLocked=false,practice;
  const audio=node('audio');audio.id='listening-audio';audio.preload='metadata';audio.controls=true;
  audio.setAttribute('aria-label','固定原音播放器');
  const player=node('div','listening-player');
  const voices=node('select','display-select');voices.id='listening-voice';voices.setAttribute('aria-label','录音声音');
  const step=node('select','display-select');step.id='rewind-step';step.setAttribute('aria-label','回退秒数');
  for(const n of [1,3,5,10])step.append(new Option(`${n}秒`,String(n)));step.value='5';
  const speed=node('select','display-select');speed.id='listening-speed';speed.setAttribute('aria-label','播放速度');
  for(const n of [.75,1,1.25,1.5])speed.append(new Option(`${n}倍`,String(n)));speed.value='1';
  const playbackStatus=node('p','playback-status','正在读取音频…');playbackStatus.id='playback-status';playbackStatus.setAttribute('role','status');
  const remember=()=>{
    if(current&&voice&&loaded&&!suppressPosition&&draftState?.view){
      const position=Math.min(voice.duration,Math.max(0,audio.currentTime||0));
      drafts.context(current.id,{voiceId:voice.id,position});
    }
  };
  const rewind=button('回退5秒','rewind-audio',()=>{if(loaded){clips.rewind(Number(step.value));remember();}});
  const rewindControl=node('div','rewind-control');rewindControl.id='rewind-control';rewindControl.setAttribute('role','group');rewindControl.setAttribute('aria-label','回退与秒数选择');
  const rewindPicker=node('span','rewind-picker'),rewindArrow=node('span','','▾');rewindArrow.setAttribute('aria-hidden','true');
  rewindPicker.append(step,rewindArrow);rewindControl.append(rewind,rewindPicker);
  const syncRewindLabel=()=>{rewind.textContent=`回退${step.value}秒`;rewindPicker.title=`选择回退秒数（当前${step.value}秒）`;};
  step.addEventListener('change',syncRewindLabel);syncRewindLabel();
  const restart=button('从头重听','restart-audio',()=>{if(!loaded)return;clips.clear();audio.currentTime=0;void audio.play().catch(e=>playbackStatus.textContent='播放未开始：'+e.message);remember();});
  const transcriptToggle=button('展开原稿','toggle-transcript',()=>setTranscript(!visible));
  transcriptToggle.setAttribute('aria-expanded','false');transcriptToggle.setAttribute('aria-controls','article-scroll');
  player.append(voices,audio,rewindControl,speed,restart,transcriptToggle,playbackStatus);
  const clips=createClipView({root,audio,container:player});
  const answerToolbar=node('div','panel-toolbar');answerToolbar.append(node('h2','','目标填号'));
  const reveal=node('input');reveal.type='checkbox';reveal.id='question-meanings';
  const revealLabel=node('label','highlight-label');revealLabel.append(reveal,document.createTextNode('显示本篇中文'));
  answerToolbar.append(revealLabel);
  const status=node('p','draft-status','正在读取草稿…');status.id='draft-status';status.setAttribute('role','status');
  const actions=node('div','draft-actions');
  const retry=button('重试保存','retry-drafts',()=>{if(draftState?.view)void drafts.flush();else void drafts.refresh();});
  const compare=button('查看远端草稿','compare-drafts',()=>void drafts.compare(current.id).then(x=>{remote.textContent=JSON.stringify(x.answers,null,2);remote.hidden=false;}).catch(e=>status.textContent=e.message));
  const useRemote=button('采用远端草稿','use-remote-drafts',()=>void drafts.useRemote(current.id).catch(e=>status.textContent=e.message));
  actions.append(retry,compare,useRemote);actions.hidden=true;
  const remote=node('pre','remote-draft');remote.id='remote-draft';remote.hidden=true;
  const recoveryBox=node('div','draft-recovery');recoveryBox.id='draft-recovery';
  const answers=node('div','answer-scroll');answers.id='answer-scroll';
  const hint=node('p','listening-hint','按原编号排列；填写听到的目标出现序号，可填多个号或单独问号。核对按已填序号统计，首次结果保留，订正另存。');
  answerToolbar.append(status);
  right.append(answerToolbar,hint,actions,recoveryBox,remote,answers);
  let left;
  function setTranscript(open){
    if(!open)clips.clear();
    visible=open;left.classList.toggle('transcript-closed',!open);left.querySelector('#article-scroll').hidden=!open;
    left.querySelector('#reading-divider').hidden=!open;transcriptToggle.textContent=open?'收起原稿':'展开原稿';transcriptToggle.setAttribute('aria-expanded',String(open));
  }
  function buildAnswers(){
    answers.replaceChildren();remote.hidden=true;
    const answerMaterial=current.id;
    for(const target of current.targets){
      const row=node('div','answer-row');row.dataset.targetId=target.id;
      const label=node('label','answer-word');label.htmlFor=`answer-${target.id.replace(':','-')}`;
      label.append(node('span','answer-number',String(target.number).padStart(3,'0')),node('span','',target.word));
      const input=node('input','answer-input');input.type='text';input.maxLength=1000;input.autocomplete='off';input.spellcheck=false;
      input.id=label.htmlFor;input.dataset.answerFor=target.id;input.setAttribute('aria-label',`编号${String(target.number).padStart(3,'0')}听到的出现序号`);
      let composing=false;
      input.addEventListener('compositionstart',()=>composing=true);
      input.addEventListener('compositionend',()=>{composing=false;drafts.edit(answerMaterial,target.id,input.value);});
      input.addEventListener('input',()=>{if(!composing)drafts.edit(answerMaterial,target.id,input.value);});
      input.addEventListener('blur',()=>{if(composing){composing=false;drafts.edit(answerMaterial,target.id,input.value);}});
      const meaning=node('details','question-meaning');const summary=node('summary','','查看本篇中文');meaning.append(summary,node('span','',`${target.pos} ${target.meaning}`));
      meaning.open=reveal.checked;row.append(label,input,meaning);answers.append(row);
    }
    syncDrafts();
    practice?.render();
  }
  function setVoice(id,position=0){
    suppressPosition=true;audio.pause();loaded=false;
    voice=current.voices.find(v=>v.id===id)||current.voices[0];voices.value=voice.id;
    void clips.load(current,voice);
    audio.src=voice.url;audio.load();audio.playbackRate=Number(speed.value);playbackStatus.textContent='正在读取固定录音…';rewind.disabled=true;
    const expected=voice.id,materialId=current.id;
    audio.onloadedmetadata=()=>{
      if(current.id!==materialId||voice.id!==expected)return;
      loaded=true;suppressPosition=true;audio.currentTime=Math.min(position,voice.duration,audio.duration||voice.duration);rewind.disabled=false;
      playbackStatus.textContent=`${voice.label} · 固定原音 · ${Math.round(audio.duration)}秒`;
      setTimeout(()=>suppressPosition=false,0);
    };
  }
  function changed(material){
    if(!left)return;
    remember();suppressPosition=true;audio.pause();current=material;
    voices.replaceChildren(...current.voices.map(v=>new Option(v.label,v.id)));
    const context=draftState?.items[current.id]?.context;
    setVoice(context?.voiceId||current.voices[0].id,context?.position||0);buildAnswers();setTranscript(visible);
  }
  left=readingView(session,materials,records,{module:'listening',materialChanged:changed,reset:()=>{
    suppressPosition=true;audio.pause();step.value='5';syncRewindLabel();speed.value='1';reveal.checked=false;
    resize(64);setTranscript(false);setVoice(current.voices[0].id,0);buildAnswers();
  }});
  left.classList.add('listening-left');left.setAttribute('role','region');left.setAttribute('aria-label','听力词表与原音');
  // The reused panel is a region inside this module's single main landmark.
  const leftRegion=node('section','listening-left-region');leftRegion.append(left);
  left.querySelector('.article-panel').insertBefore(player,left.querySelector('.article-panel .filter-toolbar'));
  left.querySelector('.article-toolbar h2').textContent='音频材料';
  left.querySelector('#reading-history').hidden=true;
  left.querySelector('#article-query').addEventListener('input',()=>{if(left.querySelector('#article-query').value)setTranscript(true);});
  const divider=node('div','listening-column-divider');divider.id='listening-column-divider';divider.tabIndex=0;divider.setAttribute('role','separator');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-label','调整词表与填号区的宽度');divider.setAttribute('aria-valuemin','45');divider.setAttribute('aria-valuemax','75');divider.setAttribute('aria-valuenow','64');
  let share=64;
  const resize=n=>{share=Math.max(45,Math.min(75,n));root.style.setProperty('--listen-left',`${share}%`);divider.setAttribute('aria-valuenow',String(Math.round(share)));};
  divider.addEventListener('pointerdown',e=>{divider.setPointerCapture(e.pointerId);e.preventDefault();});
  divider.addEventListener('pointermove',e=>{if(divider.hasPointerCapture(e.pointerId)){const r=root.getBoundingClientRect();resize((e.clientX-r.left)/r.width*100);}});
  divider.addEventListener('pointerup',e=>{if(divider.hasPointerCapture(e.pointerId))divider.releasePointerCapture(e.pointerId);});
  divider.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){resize(e.key==='Home'?45:e.key==='End'?75:share+(e.key==='ArrowRight'?3:-3));e.preventDefault();}});
  root.append(leftRegion,divider,right);
  practice=createPracticeView({root,drafts,audio,getMaterial:()=>current,onLock:value=>{practiceLocked=value;syncDrafts();},onRoundChanged:id=>{if(current?.id===id){clips.clear();audio.pause();if(loaded)audio.currentTime=0;}}});
  function syncDrafts(){
    if(!draftState||!current)return;
    const x=draftState.items[current.id],ready=!!draftState.view;
    for(const input of answers.querySelectorAll('input')){
      input.disabled=!ready||draftState.resolving||practiceLocked;
      const value=x?.answers[input.dataset.answerFor]||'';
      if(input!==document.activeElement&&input.value!==value)input.value=value;
    }
    status.textContent=draftState.storageError||(!ready?`草稿未读取：${draftState.error||'正在读取…'}`:
      x?.conflict?'草稿冲突：本地输入已保留，请查看远端并选择处理。':draftState.error?`未保存：${draftState.error}`:
      draftState.busy?'正在保存草稿…':(x?.pending||x?.dirty)?'草稿待保存（本地保全）':'草稿已保存（本机）');
    retry.hidden=ready&&!draftState.error&&!x?.pending;retry.disabled=draftState.busy;
    compare.hidden=useRemote.hidden=!x?.conflict;compare.disabled=useRemote.disabled=draftState.busy;
    actions.hidden=retry.hidden&&compare.hidden&&useRemote.hidden;
    if(!x?.conflict)remote.hidden=true;
    if(recoveryBox.childElementCount!==draftState.recovery.length){
      recoveryBox.replaceChildren(...draftState.recovery.map((r,i)=>button(`恢复待办备份${i+1}（可能来自其他窗口）`,`recover-draft-${i}`,()=>{try{drafts.recover(r.key);void drafts.flush();}catch(e){status.textContent=e.message;}})));
    }
  }
  reveal.addEventListener('change',()=>answers.querySelectorAll('details').forEach(e=>e.open=reveal.checked));
  voices.addEventListener('change',()=>{const id=voices.value;setVoice(id,0);drafts.context(current.id,{voiceId:id,position:0});});
  speed.addEventListener('change',()=>audio.playbackRate=Number(speed.value));
  audio.addEventListener('pause',()=>remember());audio.addEventListener('seeked',()=>remember());
  audio.addEventListener('error',()=>{loaded=false;clips.clear();rewind.disabled=true;playbackStatus.textContent='音频未能读取，请检查本地服务后重新选择材料。';});
  drafts.subscribe(state=>{const first=!draftState?.view&&state.view;draftState=state;syncDrafts();practice?.render();if(first&&current){const c=state.items[current.id]?.context;if(c)setVoice(c.voiceId,c.position);}});
  changed(materials[0]);setTranscript(false);void records.refresh();void drafts.refresh().then(()=>void drafts.flush());
  root.leave=()=>{remember();clips.clear();audio.pause();void drafts.flush();practice.close();left.querySelectorAll('dialog[open]').forEach(d=>d.close());};
  return root;
}
