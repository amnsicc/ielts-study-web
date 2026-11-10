import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createReadingSession} from '../src/reading/session.mjs';

test('听力两份真实材料按实际7/34目标显示并与阅读次数隔离',async()=>{
  const load=async name=>JSON.parse(await readFile(new URL('../data/'+name+'.json',import.meta.url),'utf8'));
  const catalog=await load('listening-catalog'), materials=await load('listening-materials');
  const s=createReadingSession(catalog,materials,'listening');
  assert.deepEqual(s.getView().groups.map(g=>g.number),[1,4,5,6,7,8,9]);
  s.setRecords({revision:1,counts:{reading:{'word:1':9},listening:{'word:1':2}},undoable:{reading:{},listening:{}},history:{reading:{},listening:{}}});
  assert.equal(s.getView().counts['word:1'],2);
  s.setScope('all');assert.equal(s.getView().groups.length,187);
  s.selectMaterial('listening:long');assert.equal(s.getView().groups.length,34);
  assert.equal(s.getView().scope,'current');
});
