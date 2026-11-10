import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateWordMapping,resolveWordSelection} from '../src/listening/selection.mjs';
const load=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
test('发布的两篇三声音逐词映射可验证实际MP3字节，重复词按位置返回',()=>{
 const materials=load('../data/listening-materials.json'),bundle=load('../data/listening-word-map.json');
 assert.equal(bundle.formatVersion,1);
 for(const m of materials){const map=bundle.materials.find(x=>x.materialId===m.id);
  for(const v of m.voices){
   const audioSha256=createHash('sha256').update(readFileSync(new URL('..'+v.url,import.meta.url))).digest('hex');
   const textSha256=createHash('sha256').update(JSON.stringify(m.paragraphs)).digest('hex');
   assert.equal(validateWordMapping(m,map,v.id,{textSha256,audioSha256}),true);
   assert.equal(resolveWordSelection(m,map,v.id,{paragraphIndex:0,offset:0},{paragraphIndex:0,offset:1}).start,0.1);
  }
 }
 assert.equal(bundle.materials[0].words.length,224);assert.equal(bundle.materials[1].words.length,764);
 assert.deepEqual(bundle.materials[0].voices['en-US-JennyNeural'].words[0],[0.1,0.45]);
 assert.deepEqual(bundle.materials[0].voices['en-US-GuyNeural'].words[0],[0.1,0.4375]);
 // Literal last WordBoundary from the protected Sonia speech-events source.
 assert.deepEqual(bundle.materials[1].voices['en-GB-SoniaNeural'].words.at(-1),[292.6915,293.354]);
});
