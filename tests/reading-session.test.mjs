import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadingSession } from '../src/reading/session.mjs';

// 人工夹具故意不按编号排列；材料目标不是连续编号。
const catalog = [
  { id: 'word:9', number: 9, word: 'crust', senses: [{ text: '地壳', grade: 1 }] },
  { id: 'word:1', number: 1, word: 'atmosphere', senses: [{ text: '气氛', grade: 0 }] },
  { id: 'word:4', number: 4, word: 'oxygen', senses: [{ text: '氧气', grade: 1 }] },
];
const materials = [
  { id: 'A', title: '文章A', targetGroupIds: ['word:9', 'word:1'], paragraphs: ['A正文'] },
  { id: 'B', title: '文章B', targetGroupIds: ['word:4'], paragraphs: ['B正文'] },
];

test('打开阅读时只返回首篇实际目标，按母词原编号排序', () => {
  const session = createReadingSession(catalog, materials);
  const view = session.getView();
  assert.equal(view.material.id, 'A');
  assert.deepEqual(view.groups.map(group => group.number), [1, 9]);
});

test('切换材料后只保留新篇目标，再切回来仍保持原义项与编号', () => {
  const session = createReadingSession(catalog, materials);
  session.selectMaterial('B');
  assert.equal(session.getView().material.title, '文章B');
  assert.deepEqual(session.getView().groups.map(group => group.number), [4]);
  session.selectMaterial('A');
  assert.deepEqual(session.getView().groups.map(group => [group.number, group.senses[0].text]), [
    [1, '气氛'], [9, '地壳'],
  ]);
});

test('选择不存在的材料被拒绝并保留当前文章', () => {
  const session = createReadingSession(catalog, materials);
  assert.throws(() => session.selectMaterial('missing'), /未知材料/);
  assert.equal(session.getView().material.id, 'A');
  assert.deepEqual(session.getView().groups.map(group => group.number), [1, 9]);
});
