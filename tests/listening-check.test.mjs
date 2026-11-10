import test from 'node:test';import assert from 'node:assert/strict';
import {checkAnswers} from '../src/listening/check.mjs';
export const definition={materialId:'sample',materialVersion:'v1',answerVersion:'a1',ruleVersion:'filled-events-v1',targets:[{id:'a',correctNumbers:[1,3],occurrences:[]},{id:'b',correctNumbers:[2],occurrences:[]}]};
test('部分填写按事件计，空白不是没听懂或全篇成绩',()=>{
 const r=checkAnswers(definition,{a:'1、2',b:''});assert.equal(r.correct,1);assert.equal(r.submitted,2);assert.equal(r.percentage,50);assert.equal(r.wrong,1);assert.equal(r.unmatchedExpected,2);assert.deepEqual(r.rows.a.missing,[3]);assert.equal(r.rows.b.blank,true);
});

test('多号和问号分别处理，同行重号去重、跨行同号分别判，非法输入不得冻结果',()=>{
 const r=checkAnswers(definition,{a:'1，1 ? 3',b:'1、9 ？'});
 assert.equal(r.correct,2);assert.equal(r.submitted,4);assert.equal(r.percentage,50);assert.deepEqual(r.rows.a.duplicates,[1]);assert.equal(r.rows.a.question,true);assert.deepEqual(r.rows.b.outOfRange,[9]);assert.deepEqual(r.sharedNumbers,[{number:1,targetIds:['a','b']}]);
 for(const text of ['0','-1','1.2','abc','3?','9007199254740992'])assert.throws(()=>checkAnswers(definition,{a:text}),e=>e.code==='INVALID_ANSWER'&&e.issues[0].targetId==='a');
 for(const text of ['','?','？'])assert.throws(()=>checkAnswers(definition,{a:text}),e=>e.code==='EMPTY_ANSWER');
 assert.equal(checkAnswers(definition,{a:'3\n1',b:'2'}).percentage,100);
});
