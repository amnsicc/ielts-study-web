import {resolveSentenceLocation} from './sentence-location.mjs';
import {wordRange} from './transcript-selection.mjs';

export function createSentenceNavigation({root,getMaterial,showTranscript,setOpen}){
  let generation=0;
  function clear(){generation++;CSS.highlights.delete('listening-sentence');setOpen(false);}
  async function locate(definition,targetId,number){
    const token=++generation;
    try{
      const location=resolveSentenceLocation(getMaterial(),definition,targetId,number);
      showTranscript();setOpen(true);
      await new Promise(requestAnimationFrame);
      if(token!==generation)return;
      const paragraphs=root.querySelectorAll('.article-body > .article-paragraph');
      const range=wordRange(paragraphs,{paragraphIndex:location.paragraphIndex,start:location.start},{paragraphIndex:location.paragraphIndex,end:location.end});
      if(range.toString()!==location.text)throw new Error('这句暂时无法定位，请重新选择材料。');
      CSS.highlights.set('listening-sentence',new Highlight(range));
      const scroll=root.querySelector('#article-scroll'),bounds=scroll.getBoundingClientRect(),first=range.getClientRects()[0];
      scroll.scrollTop+=first.top-bounds.top-16;
      scroll.scrollIntoView({block:'nearest',inline:'nearest'});
    }catch(e){if(token===generation)clear();throw e;}
  }
  return {locate,clear};
}
