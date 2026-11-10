import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createReadingSession} from '../src/reading/session.mjs';

const catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
const materials=JSON.parse(await readFile(new URL('../data/materials.json',import.meta.url),'utf8'));

test('全部阅读词覆盖001—200，第十篇可学习181—200而首篇身份保持',()=>{
  const session=createReadingSession(catalog,materials);
  session.setScope('all');
  assert.equal(session.getView().groups.length,200);
  assert.equal(session.getView().groups.at(-1).number,200);
  assert.equal(session.getView().material.id,'reading:1');
  session.selectMaterial('reading:10');
  assert.equal(session.getView().material.title,'Making a Garden from an Empty Yard');
  assert.deepEqual(session.getView().groups.map(g=>g.number),[181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200]);
});

test('新增篇保留复合词性及副词，Arctic查义绑定067而不改正文',()=>{
  const session=createReadingSession(catalog,materials);
  for(const [materialId,word,pos,meaning] of [
    ['reading:7','thaw','vi./vt.','（使）融化；解冻'],
    ['reading:7','freeze','vi./vt.','（使）结冰'],
    ['reading:7','forecast','n./vt.','预测；预报'],
    ['reading:8','irregularly','adv.','不规则地'],
    ['reading:4','Arctic','adj.','北极的'],
  ]){
    session.selectMaterial(materialId);
    const occurrence=session.getView().material.occurrences.find(o=>o.text===word);
    assert.ok(occurrence,word);
    assert.equal(session.getOccurrenceMeaning(occurrence.id).pos,pos);
    assert.equal(session.getOccurrenceMeaning(occurrence.id).meaning,meaning);
    if(word==='Arctic')assert.equal(occurrence.groupId,'word:67');
  }
});

test('新增拓展与P档按组取交集，最后一篇中文搜索返回实际目标位置',()=>{
  const session=createReadingSession(catalog,materials);
  session.setScope('all');session.setFilters({query:'157-b',grade:'0'});
  assert.deepEqual(session.getView().groups.map(g=>g.number),[157]);
  assert.deepEqual(session.getView().matches.map(m=>m.entryId),['extra:157-B']);
  assert.equal(session.getView().groups[0].senses[0].grade,1);
  const sunset=session.searchMaterials('日落').filter(h=>h.kind==='target');
  assert.equal(sunset.length,1);
  assert.equal(sunset[0].materialId,'reading:10');
  session.selectMaterial(sunset[0].materialId);
  assert.equal(session.getOccurrenceMeaning(sunset[0].occurrenceId).text,'sunset');
  assert.deepEqual(session.getView().filters,{grade:'all',query:''});
});
