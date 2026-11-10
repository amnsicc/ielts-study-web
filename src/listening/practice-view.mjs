import {createPracticeClient} from './practice-client.mjs';
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
export function createPracticeView({root,drafts,audio,getMaterial,onLock,onRoundChanged,onLocateSentence}){
  const client=createPracticeClient(drafts),bar=node('div','practice-toolbar'),label=node('span','practice-round');label.id='practice-round';
  const summary=node('div','practice-summary');summary.id='practice-summary';
  const status=node('p','practice-status');status.id='practice-status';status.setAttribute('role','status');
  const actions=node('div','practice-actions'),recovery=node('div','practice-recovery');
  let state=client.snapshot(),composing=false,historyFocus=null;const observedRounds=new Map();
  function button(text,id,fn,parent=bar){const b=node('button','quiet-button',text);b.id=id;b.type='button';b.addEventListener('click',fn);parent.append(b);return b;}
  bar.append(label);
  const check=button('核对答案','check-listening',()=>{
    if(composing){status.textContent='请先完成当前中文输入，再核对。';return;}
    audio.pause();const m=getMaterial(),s=state.view?.materials[m.id],r=s?.rounds.find(r=>r.id===s.currentRoundId);
    void client.perform(r?.first?'correction':'first',m.id);
  });
  const fresh=button('开始新一轮','new-listening-round',()=>{
    if(composing){status.textContent='请先完成当前输入，再开始新一轮。';return;}
    if(!confirm('开始新一轮将保留当前轮的输入和结果，新轮填写为空。确定继续？'))return;
    audio.pause();void client.perform('newRound',getMaterial().id);
  });
  const history=button('练习历史','listening-history',()=>void showHistory());
  const retry=button('重试未完成操作','retry-practice',()=>void client.retry(),actions);
  const compare=button('查看远端练习','compare-practice',async()=>{await client.compare();remote.hidden=false;},actions);
  const adopt=button('采用远端练习','adopt-practice',()=>void client.adopt(getMaterial().id),actions);
  const remote=node('pre','practice-remote');remote.id='practice-remote';remote.hidden=true;
  const dialog=node('dialog','practice-history-dialog');dialog.id='practice-history-dialog';
  const heading=node('h2','','练习历史'),close=button('关闭','close-practice-history',()=>dialog.close(),node('div'));
  const historyBody=node('div','practice-history-body');dialog.append(heading,close,historyBody);root.append(dialog);
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('close',()=>historyFocus?.focus());
  root.addEventListener('compositionstart',e=>{if(e.target.matches('.answer-input'))composing=true;});
  root.addEventListener('compositionend',()=>composing=false);
  root.querySelector('.listening-answers').insertBefore(bar,root.querySelector('.listening-hint'));
  bar.after(status,actions,recovery,summary,remote);
  const percent=r=>`${Math.round(r.percentage*10)/10}%`;
  const line=(title,s)=>`${title}：正确率 ${percent(s.result)} · 答对 ${s.result.correct}个 · 共${s.result.totalExpected}个`;
  function render(){
    const m=getMaterial();if(!m)return;
    const s=state.view?.materials[m.id],r=s?.rounds.find(r=>r.id===s.currentRoundId),locked=state.busy||!!state.pending;
    if(s){const old=observedRounds.get(m.id);observedRounds.set(m.id,s.currentRoundId);if(old&&old!==s.currentRoundId)onRoundChanged?.(m.id);}
    onLock(locked);check.disabled=fresh.disabled=!s||locked||!!state.storageError;history.disabled=!s||state.busy;
    label.textContent=s?`第${s.rounds.findIndex(x=>x.id===s.currentRoundId)+1}轮`:'';check.textContent=r?.first?'核对订正':'核对答案';
    status.textContent=state.storageError||state.error||(state.busy?'正在确认保存…':state.pending?'核对待办已保全，尚未确认保存。':'');
    status.hidden=!status.textContent;retry.hidden=!state.error&&!state.pending||state.code==='PRACTICE_CONFLICT';retry.disabled=state.busy;
    compare.hidden=adopt.hidden=state.code!=='PRACTICE_CONFLICT';compare.disabled=adopt.disabled=state.busy;
    actions.hidden=retry.hidden&&compare.hidden&&adopt.hidden;
    remote.textContent=JSON.stringify(s?.rounds.map(r=>({roundId:r.id,answers:r.draft?.answers,first:r.first?.answers})),null,2);
    if(state.code!=='PRACTICE_CONFLICT')remote.hidden=true;
    recovery.replaceChildren();for(const [i,x] of state.recovery.entries())button(`恢复核对待办${i+1}`,`recover-practice-${i}`,()=>client.recover(x.key),recovery).disabled=locked;
    recovery.hidden=!recovery.childElementCount;
    summary.replaceChildren();
    if(r?.first){summary.append(node('p','',line('首次核对',r.first)));const last=r.corrections.at(-1);if(last)summary.append(node('p','',line(`第${r.corrections.length}次订正`,last)));}
    summary.hidden=!r?.first;
    const latest=r?.corrections.at(-1)||r?.first;
    for(const row of root.querySelectorAll('.answer-row')){
      const wasOpen=row.querySelector('.answer-feedback details')?.open;
      row.querySelector('.answer-feedback')?.remove();if(!latest)continue;
      const id=row.dataset.targetId,target=latest.definition.targets.find(t=>t.id===id);
      const box=node('div','answer-feedback');box.append(node('p','answer-key',`答案：${target.correctNumbers.join('、')}`));
      const details=node('details');details.open=!!wasOpen;details.append(node('summary','','原句'));
      for(const o of target.occurrences){
        const link=node('button','sentence-link',o.sentence);link.type='button';link.lang='en';link.dataset.locateSentence=String(o.number);link.dataset.sentenceTarget=id;
        link.addEventListener('click',()=>void onLocateSentence(latest.definition,id,o.number).catch(e=>{status.textContent=e.message;status.hidden=false;}));details.append(link);
      }box.append(details);row.append(box);
    }
    if(state.issues.length){const id=state.issues[0].targetId;const input=[...root.querySelectorAll('.answer-input')].find(e=>e.dataset.answerFor===id);input?.focus();}
  }
  async function showHistory(){
    await client.compare();historyBody.replaceChildren();const s=client.snapshot().view?.materials[getMaterial().id];if(!s)return;
    historyFocus=history;
    for(const [i,r] of s.rounds.entries()){
      const section=node('section','history-round');section.dataset.roundId=r.id;section.append(node('h3','',`第${i+1}轮${r.id===s.currentRoundId?'（当前）':''}`));
      const snapshots=[...(r.first?[['首次核对',r.first]]:[]),...r.corrections.map((x,i)=>[`第${i+1}次订正`,x])];
      if(!snapshots.length)section.append(node('p','','尚未核对，无首次成绩。'));
      for(const [title,x] of snapshots){const d=node('details');d.append(node('summary','',line(title,x)),node('p','',`${x.checkedAt} · ${x.voice.label||x.voice.id}`));
        for(const t of x.definition.targets)d.append(node('p','',`${t.word}：原填 ${x.answers[t.id]||'（空白）'}；答案 ${t.correctNumbers.join('、')}`));section.append(d);}
      const draft=node('details');draft.append(node('summary','','查看该轮已存输入'));for(const [id,text] of Object.entries(r.draft?.answers||{}))draft.append(node('p','',`${getMaterial().targets.find(t=>t.id===id)?.word||id}：${text||'（空白）'}`));section.append(draft);historyBody.append(section);
    }
    if(!dialog.open)dialog.showModal();
  }
  client.subscribe(s=>{state=s;render();});void client.refresh();
  return {render,close:()=>dialog.open&&dialog.close()};
}
