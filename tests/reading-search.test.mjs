import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadingSession } from '../src/reading/session.mjs';

const catalog = [
  { id: 'word:9', number: 9, word: 'crust', senses: [{text:'地壳',grade:1}], extras: [] },
  { id: 'word:1', number: 1, word: 'atmosphere', senses: [{text:'气氛',grade:1},{text:'大气层',grade:2}],
    extras: [{id:'extra:1-A',number:'1-A',word:'atmospheric',senses:[{text:'大气的',grade:0}]}] },
  { id: 'word:4', number: 4, word: 'oxygen', senses: [{text:'氧气',grade:2}], extras: [] },
];
const materials = [
  {id:'A', title:'A Quiet Visit',targetGroupIds:['word:9','word:1'],paragraphs:['A friendly `atmosphere` near the coast.'],
   occurrences:[{id:'A:0',paragraphIndex:0,start:11,end:21,text:'atmosphere',groupId:'word:1',meaning:'气氛'}]},
  {id:'B',title:'Under the Sea',targetGroupIds:['word:4'],paragraphs:['We need `oxygen` near the coast.'],
   occurrences:[{id:'B:0',paragraphIndex:0,start:8,end:14,text:'oxygen',groupId:'word:4',meaning:'氧气'}]},
];

test('词表范围切到全部不换正文，非连续目标与原编号保持；未知范围拒绝', () => {
  const s=createReadingSession(catalog,materials);
  assert.equal(s.getView().scope,'current');
  s.setScope('all');
  assert.deepEqual(s.getView().groups.map(g=>g.number),[1,4,9]);
  assert.equal(s.getView().material.id,'A');
  assert.throws(()=>s.setScope('missing'),/范围/);
  assert.equal(s.getView().scope,'all');
  s.setScope('current');
  assert.deepEqual(s.getView().groups.map(g=>g.number),[1,9]);
});

test('P档按母词组匹配任一拓展或本体义项，保留完整内容和原档位', () => {
  const s=createReadingSession(catalog,materials);
  s.setScope('all');
  s.setFilters({grade:'0'});
  assert.deepEqual(s.getView().groups.map(g=>g.number),[1]);
  assert.deepEqual(s.getView().groups[0].senses.map(x=>x.grade),[1,2]);
  assert.equal(s.getView().groups[0].extras[0].senses[0].grade,0);
  s.setFilters({grade:'2'});
  assert.deepEqual(s.getView().groups.map(g=>g.number),[1,4]);
  assert.throws(()=>s.setFilters({grade:'8'}),/档/);
  assert.equal(s.getView().filters.grade,'2');
  s.setFilters({grade:'all'});
  assert.deepEqual(s.getView().groups.map(g=>g.number),[1,4,9]);
});

test('英文前缀/中文包含/完整编号搜索与P档取组交集，返回具体命中ID', () => {
  const s=createReadingSession(catalog,materials);
  s.setScope('all');
  s.setFilters({query:'  ATM ',grade:'0'});
  assert.deepEqual(s.getView().groups.map(g=>g.number),[1]);
  assert.deepEqual(s.getView().matches.map(m=>m.entryId),['word:1','extra:1-A']);
  s.setFilters({query:'气氛'});
  assert.deepEqual(s.getView().matches.map(m=>m.entryId),['word:1']);
  s.setFilters({query:'1-a'});
  assert.deepEqual(s.getView().matches.map(m=>m.entryId),['extra:1-A']);
  s.setFilters({query:'001'});
  assert.deepEqual(s.getView().matches.map(m=>m.entryId),['word:1']);
  s.setFilters({query:'cru'});
  assert.deepEqual(s.getView().groups,[]);
  assert.equal(s.getView().filters.grade,'0');
  s.setFilters({query:''});
  assert.deepEqual(s.getView().groups.map(g=>g.number),[1]);
  s.setFilters({query:'phere',grade:'all'});
  assert.deepEqual(s.getView().groups,[]);
  assert.equal(s.getView().material.id,'A');
});

test('换篇清范围及过滤，保留显隐；无效换篇不破坏状态；重置和新会话默认', () => {
  const s=createReadingSession(catalog,materials);
  s.setScope('all');s.setFilters({query:'ATM',grade:'0'});
  s.setVisibility('word:1','none');s.setTargetHighlight(false);
  assert.throws(()=>s.selectMaterial('bad'),/未知材料/);
  assert.equal(s.getView().filters.query,'ATM');
  s.selectMaterial('B');
  assert.equal(s.getView().scope,'current');
  assert.deepEqual(s.getView().filters,{grade:'all',query:''});
  assert.deepEqual(s.getView().groups.map(g=>g.number),[4]);
  assert.equal(s.getView().visibility['word:1'].english,false);
  assert.equal(s.getView().highlightTargets,false);
  s.setScope('all');s.setFilters({grade:'1',query:'cru'});s.resetView();
  assert.equal(s.getView().scope,'current');
  assert.deepEqual(s.getView().filters,{grade:'all',query:''});
  assert.deepEqual(s.getView().groups.map(g=>g.number),[1,9]);
  assert.deepEqual(createReadingSession(catalog,materials).getView().filters,{grade:'all',query:''});
});

test('文章库按标题/正文/实际目标编号和本篇中文义搜索，给定位而不擅自换篇', () => {
  const s=createReadingSession(catalog,materials);
  assert.equal(s.searchMaterials('Quiet')[0].kind,'title');
  assert.deepEqual(s.searchMaterials('COAST').map(x=>x.materialId),['A','B']);
  const match=s.searchMaterials('气氛');
  assert.equal(match.length,1);
  assert.equal(match[0].occurrenceId,'A:0');
  assert.equal(match[0].paragraphIndex,0);
  assert.equal(match[0].snippet,'atmosphere · 气氛');
  assert.deepEqual(s.searchMaterials('大气层'),[]);
  assert.deepEqual(s.searchMaterials('大气的'),[]);
  assert.equal(s.searchMaterials('004')[0].occurrenceId,'B:0');
  assert.deepEqual(s.searchMaterials(''),[]);
  assert.deepEqual(s.searchMaterials('not-found'),[]);
  assert.equal(s.getView().material.id,'A');
  s.setFilters({grade:'0',query:'ATM'});
  assert.equal(s.searchMaterials('氧气')[0].materialId,'B');
  assert.equal(s.getView().filters.query,'ATM');
});
