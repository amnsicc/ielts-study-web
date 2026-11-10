import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {checkAnswers} from '../src/listening/check.mjs';
test('发布答案来自两篇实际目标事件，长篇重复事件及双声一致',()=>{
 const defs=JSON.parse(readFileSync(new URL('../data/listening-answers.json',import.meta.url))).definitions;
 assert.deepEqual(defs.map(d=>d.targets.length),[7,34]);
 const long=defs[1];assert.deepEqual(long.targets.find(t=>t.id==='word:4').correctNumbers,[16,19]);assert.deepEqual(long.targets.find(t=>t.id==='word:8').correctNumbers,[1,39]);
 const r=checkAnswers(long,{'word:4':'16、19','word:8':'1、39'});assert.equal(r.correct,4);assert.equal(r.submitted,4);assert.equal(r.totalExpected,39);
 assert.equal(defs[0].targets.find(t=>t.id==='word:1').occurrences[0].actualForm,'atmosphere');
});
