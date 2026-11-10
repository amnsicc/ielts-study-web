export function resolveWordSelection(material,mapping,voiceId,anchor,focus){
  const compare=(a,b)=>a.paragraphIndex-b.paragraphIndex||a.offset-b.offset;
  const [a,b]=compare(anchor,focus)<=0?[anchor,focus]:[focus,anchor];
  for(const point of [a,b])if(!Number.isInteger(point.paragraphIndex)||!Number.isInteger(point.offset)||typeof material.paragraphs[point.paragraphIndex]!=='string'||point.offset<0||point.offset>material.paragraphs[point.paragraphIndex].length)throw new Error('原稿选区越界');
  if(compare(a,b)===0)return null;
  const chosen=mapping.words.map((w,i)=>({...w,index:i})).filter(w=>compare({paragraphIndex:w.paragraphIndex,offset:w.end},a)>0&&compare({paragraphIndex:w.paragraphIndex,offset:w.start},b)<0);
  if(!chosen.length)return null;
  const first=chosen[0],last=chosen.at(-1),times=mapping.voices[voiceId]?.words;
  if(!times?.[last.index])throw new Error('当前声音没有可用选段时间');
  const text=material.paragraphs.slice(first.paragraphIndex,last.paragraphIndex+1).map((p,i)=>p.slice(i===0?first.start:0,first.paragraphIndex+i===last.paragraphIndex?last.end:undefined)).join('\n\n');
  return {first,last,text,start:times[first.index][0],end:times[last.index][1],words:chosen.length};
}

export function validateWordMapping(material,mapping,voiceId,{textSha256,audioSha256}){
  const fail=()=>{throw new Error('选段时间与当前原稿或录音不匹配，请重新选择材料重试；整篇播放仍可用。');};
  const voice=material.voices.find(v=>v.id===voiceId),timeline=mapping?.voices?.[voiceId];
  if(!voice||mapping?.materialId!==material.id||mapping.version!==material.version||mapping.textSha256!==textSha256||timeline?.audioSha256!==audioSha256||voice.sha256!==audioSha256)fail();
  const words=material.paragraphs.flatMap((p,paragraphIndex)=>[...p.matchAll(/[\p{L}\p{N}]+(?:['’\u2010\u2011-][\p{L}\p{N}]+)*/gu)].map(m=>({paragraphIndex,start:m.index,end:m.index+m[0].length,text:m[0]})));
  if(!Array.isArray(mapping.words)||mapping.words.length!==words.length||!Array.isArray(timeline.words)||timeline.words.length!==words.length)fail();
  let end=0;
  words.forEach((w,i)=>{
    if(Object.keys(w).some(k=>w[k]!==mapping.words[i]?.[k]))fail();
    const t=timeline.words[i];
    if(!Array.isArray(t)||t.length!==2||!t.every(Number.isFinite)||t[0]<end||t[1]<=t[0]||t[1]>voice.duration)fail();
    end=t[1];
  });
  return true;
}
