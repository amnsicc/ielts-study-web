// Convert the browser's real multi-node Range into paragraph character endpoints.
export function transcriptSelection(paragraphs,selection=getSelection()){
  if(!selection.rangeCount||selection.isCollapsed)return null;
  const range=selection.getRangeAt(0),parts=[];
  for(const p of paragraphs){
    if(!range.intersectsNode(p))continue;
    const offset=(container,value)=>{const prefix=document.createRange();prefix.selectNodeContents(p);prefix.setEnd(container,value);return prefix.toString().length;};
    const start=p.contains(range.startContainer)?offset(range.startContainer,range.startOffset):0;
    const end=p.contains(range.endContainer)?offset(range.endContainer,range.endOffset):p.textContent.length;
    if(end>start)parts.push({paragraphIndex:Number(p.dataset.paragraphIndex),start,end});
  }
  if(!parts.length)return null;
  return [{paragraphIndex:parts[0].paragraphIndex,offset:parts[0].start},{paragraphIndex:parts.at(-1).paragraphIndex,offset:parts.at(-1).end}];
}

export function wordRange(paragraphs,first,last){
  const endpoint=(word,offset)=>{
    const p=[...paragraphs].find(p=>Number(p.dataset.paragraphIndex)===word.paragraphIndex);
    const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n;
    while((n=walker.nextNode())){if(offset<=n.length)return [n,offset];offset-=n.length;}
    throw new Error('原稿位置已改变，请重新选择材料。');
  };
  const range=document.createRange();range.setStart(...endpoint(first,first.start));range.setEnd(...endpoint(last,last.end));return range;
}
