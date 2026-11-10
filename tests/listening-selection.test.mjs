import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveWordSelection,validateWordMapping} from '../src/listening/selection.mjs';
const material={id:'sample',version:'v1',paragraphs:["I'd re-read Anna’s note. note!",'Last word.'],voices:[{id:'voice',sha256:'audio',duration:9}]};
const mapping={materialId:'sample',version:'v1',textSha256:'text',voices:{voice:{audioSha256:'audio',words:[[0,0.4],[0.5,1.2],[1.3,2],[2.1,2.5],[3,3.4],[4,4.5],[5,5.5]]}},words:[{paragraphIndex:0,start:0,end:3,text:"I'd"},{paragraphIndex:0,start:4,end:11,text:'re-read'},{paragraphIndex:0,start:12,end:18,text:'Anna’s'},{paragraphIndex:0,start:19,end:23,text:'note'},{paragraphIndex:0,start:25,end:29,text:'note'},{paragraphIndex:1,start:0,end:4,text:'Last'},{paragraphIndex:1,start:5,end:9,text:'word'}]};
test('半词扩成完整缩写、连字符和所有格，反向选择等价',()=>{
 const a=resolveWordSelection(material,mapping,'voice',{paragraphIndex:0,offset:1},{paragraphIndex:0,offset:16});
 assert.equal(a.text,"I'd re-read Anna’s");assert.equal(a.start,0);assert.equal(a.end,2);
 assert.deepEqual(resolveWordSelection(material,mapping,'voice',{paragraphIndex:0,offset:16},{paragraphIndex:0,offset:1}),a);
});
export {material,mapping};

test('边界、标点、重复词及跨段只取相交完整词，不多收邻词',()=>{
 const take=(p,a,q,b)=>resolveWordSelection(material,mapping,'voice',{paragraphIndex:p,offset:a},{paragraphIndex:q,offset:b});
 assert.equal(take(0,3,0,4),null);assert.equal(take(0,23,0,25),null);assert.equal(take(0,4,0,4),null);
 assert.equal(take(0,4,0,11).text,'re-read');
 assert.equal(take(0,26,0,27).start,3);assert.equal(take(0,26,1,7).text,'note!\n\nLast word');assert.equal(take(1,8,1,9).end,5.5);
 assert.throws(()=>take(9,0,9,1),/越界/);
});
test('发布映射绑定实际原稿与本声音，错hash、漏词、倒序或越界时间均拒绝',()=>{
 assert.equal(validateWordMapping(material,mapping,'voice',{textSha256:'text',audioSha256:'audio'}),true);
 for(const mutate of [m=>m.version='old',m=>m.textSha256='old',m=>m.voices.voice.audioSha256='wrong',m=>m.words.pop(),m=>m.words[1].text='wrong',m=>m.voices.voice.words[1]=[0.1,0.2],m=>m.voices.voice.words[6]=[5,10]]){
  const m=structuredClone(mapping);mutate(m);assert.throws(()=>validateWordMapping(material,m,'voice',{textSha256:'text',audioSha256:'audio'}));
 }
 assert.throws(()=>validateWordMapping(material,mapping,'missing',{textSha256:'text',audioSha256:'audio'}));
});
