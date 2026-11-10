import test from 'node:test';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {resolveSentenceLocation} from '../src/listening/sentence-location.mjs';
const material={id:'sample',version:'v1',paragraphs:['Core works. Core works.','End.'],occurrences:[{groupId:'a',paragraphIndex:0,start:0,end:4,text:'Core'},{groupId:'a',paragraphIndex:0,start:12,end:16,text:'Core'},{groupId:'b',paragraphIndex:1,start:0,end:3,text:'End'}]};
const definition={materialId:'sample',materialVersion:'v1',targets:[{id:'a',occurrences:[{number:1,actualForm:'Core',sentence:'Core works.'},{number:2,actualForm:'Core',sentence:'Core works.'}]},{id:'b',occurrences:[{number:3,actualForm:'End',sentence:'End.'}]}]};
test('同词同句第二次定位第二处完整原句，首尾和其他段落不串位',()=>{
 assert.deepEqual(resolveSentenceLocation(material,definition,'a',2),{materialId:'sample',version:'v1',targetId:'a',occurrenceNumber:2,paragraphIndex:0,start:12,end:23,text:'Core works.'});
 assert.equal(resolveSentenceLocation(material,definition,'a',1).start,0);assert.equal(resolveSentenceLocation(material,definition,'b',3).end,4);
});
export {material,definition};

test('版本/事件/实际形式错误和不唯一的句范围均拒绝，不回退到同拼写首词',()=>{
 for(const d of [{...definition,materialVersion:'other'},{...definition,materialId:'other'},structuredClone(definition)]){
  if(d.materialVersion==='v1'&&d.materialId==='sample')d.targets[0].occurrences[1].actualForm='wrong';
  assert.throws(()=>resolveSentenceLocation(material,d,'a',2),/无法定位/);
 }
 assert.throws(()=>resolveSentenceLocation(material,definition,'a',99),/无法定位/);assert.throws(()=>resolveSentenceLocation(material,definition,'unknown',1),/无法定位/);
 const same={id:'same',version:'v1',paragraphs:["Core meets Core. I'd re-enter."],occurrences:[{groupId:'a',paragraphIndex:0,start:0,end:4,text:'Core'},{groupId:'a',paragraphIndex:0,start:11,end:15,text:'Core'}]};
 const d={...definition,materialId:'same',targets:[{id:'a',occurrences:[{number:1,actualForm:'Core',sentence:'Core meets Core.'},{number:2,actualForm:'Core',sentence:'Core meets Core.'}]}]};
 assert.equal(resolveSentenceLocation(same,d,'a',2).end,16);
 assert.throws(()=>resolveSentenceLocation({id:'ambiguous',version:'v1',paragraphs:['aaaaa'],occurrences:[{groupId:'a',paragraphIndex:0,start:2,end:3,text:'a'}]}, {materialId:'ambiguous',materialVersion:'v1',targets:[{id:'a',occurrences:[{number:1,actualForm:'a',sentence:'aaa'}]}]},'a',1),/无法定位/);

});

test('两篇全部46处原句均精确包含本次登记目标，长篇重复出现分别定位',()=>{
 const ms=JSON.parse(readFileSync(new URL('../data/listening-materials.json',import.meta.url))),ds=JSON.parse(readFileSync(new URL('../data/listening-answers.json',import.meta.url))).definitions;let n=0;
 for(const m of ms){const d=ds.find(d=>d.materialId===m.id);for(const t of d.targets)for(const o of t.occurrences){const r=resolveSentenceLocation(m,d,t.id,o.number);assert.equal(m.paragraphs[r.paragraphIndex].slice(r.start,r.end),o.sentence);n++;}}
 assert.equal(n,46);
 const d=ds[1],a=resolveSentenceLocation(ms[1],d,'word:4',16),b=resolveSentenceLocation(ms[1],d,'word:4',19);assert.notEqual(a.text,b.text);
});
