export function resolveSentenceLocation(material,definition,targetId,occurrenceNumber){
  const fail=()=>{throw new Error('这句暂时无法定位，请重新选择材料。');};
  if(definition?.materialId!==material?.id||definition?.materialVersion!==material?.version)fail();
  const target=definition.targets.find(t=>t.id===targetId),index=target?.occurrences.findIndex(o=>o.number===occurrenceNumber),entry=target?.occurrences[index];
  const registered=material.occurrences.filter(o=>o.groupId===targetId).sort((a,b)=>a.paragraphIndex-b.paragraphIndex||a.start-b.start),occurrence=registered[index];
  if(!entry||!occurrence||registered.length!==target.occurrences.length||!entry.sentence||occurrence.text!==entry.actualForm||material.paragraphs[occurrence.paragraphIndex]?.slice(occurrence.start,occurrence.end)!==entry.actualForm)fail();
  const paragraph=material.paragraphs[occurrence.paragraphIndex],matches=[];
  for(let start=paragraph.indexOf(entry.sentence);start!==-1;start=paragraph.indexOf(entry.sentence,start+1)){
    const end=start+entry.sentence.length;
    if(start<=occurrence.start&&occurrence.end<=end)matches.push({start,end});
  }
  if(matches.length!==1)fail();
  const {start,end}=matches[0];
  return {materialId:material.id,version:material.version,targetId,occurrenceNumber,paragraphIndex:occurrence.paragraphIndex,start,end,text:entry.sentence};
}
