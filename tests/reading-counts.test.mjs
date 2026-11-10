import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadingSession} from '../src/reading/session.mjs';
test('次数与关键词/P档按组交集，五种边界及0可筛，重置只清界面',()=>{
  const catalog=[{id:'word:1',number:1,word:'alpha',senses:[{text:'甲',grade:1}],extras:[{id:'extra:1-A',number:'1-A',word:'beta',senses:[{text:'乙',grade:0}]}]},
    {id:'word:2',number:2,word:'gamma',senses:[{text:'丙',grade:2}],extras:[]}];
  const materials=[{id:'A',targetGroupIds:['word:1','word:2']},{id:'B',targetGroupIds:['word:1']}];
  const s=createReadingSession(catalog,materials);
  s.setRecords({revision:2,counts:{reading:{'word:1':2,'extra:1-A':8}},undoable:{reading:{}},history:{reading:{}}});
  s.setFilters({query:'alpha',grade:'0'});s.setCountFilter({operator:'>',threshold:5});
  assert.deepEqual(s.getView().groups.map(g=>g.number),[1]);
  s.setFilters({query:'',grade:'all'});
  for(const [operator,threshold,numbers] of [['>',8,[]],['>=',8,[1]],['=',0,[2]],['<',2,[2]],['<=',2,[1,2]]]){
    s.setCountFilter({operator,threshold});assert.deepEqual(s.getView().groups.map(g=>g.number),numbers);
  }
  assert.throws(()=>s.setCountFilter({operator:'>',threshold:-1}));
  s.selectMaterial('B');assert.equal(s.getView().countFilter,null);assert.equal(s.getView().counts['word:1'],2);
  s.setCountFilter({operator:'>',threshold:5});s.resetView();
  assert.equal(s.getView().countFilter,null);assert.equal(s.getView().counts['extra:1-A'],8);
});
