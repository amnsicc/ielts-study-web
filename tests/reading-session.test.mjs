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

test('默认仅英文，母词和拓展可各自显隐，整体模式覆盖先前逐条设置', () => {
  const words = [{ ...catalog[1], extras: [{ id: 'extra:1-A', number: '1-A', word: 'atmospheric', senses: [] }] }, catalog[0]];
  const session = createReadingSession(words, materials);
  assert.deepEqual(session.getView().visibility['word:1'], { english: true, chinese: false });
  session.setVisibility('word:1', 'chinese');
  session.setVisibility('extra:1-A', 'none');
  assert.deepEqual(session.getView().visibility['word:1'], { english: false, chinese: true });
  assert.deepEqual(session.getView().visibility['extra:1-A'], { english: false, chinese: false });
  session.setVisibility('all', 'both');
  assert.deepEqual(session.getView().visibility['extra:1-A'], { english: true, chinese: true });
  session.setVisibility('word:1', 'english');
  assert.deepEqual(session.getView().visibility['extra:1-A'], { english: true, chinese: true });
});

test('多个拓展组可展开收起，不重排母词、不改变显隐或文章', () => {
  const session = createReadingSession(catalog, materials);
  session.setVisibility('word:1', 'chinese');
  session.toggleExtras('word:1');
  session.toggleExtras('word:9');
  assert.deepEqual(session.getView().expandedIds, ['word:1', 'word:9']);
  session.toggleExtras('word:1');
  assert.deepEqual(session.getView().expandedIds, ['word:9']);
  assert.deepEqual(session.getView().groups.map(g => g.number), [1, 9]);
  assert.equal(session.getView().material.id, 'A');
  assert.deepEqual(session.getView().visibility['word:1'], { english: false, chinese: true });
});

test('查义仅认本篇登记出现，高亮关闭不改变含义或正文，换篇不串义', () => {
  const docs = [
    { ...materials[0], occurrences: [{ id: 'A:0', text: 'crust', groupId: 'word:9', meaning: '地壳' }] },
    { ...materials[1], occurrences: [{ id: 'B:0', text: 'crust', groupId: 'word:9', meaning: '面包皮' }] },
  ];
  const session = createReadingSession(catalog, docs);
  assert.equal(session.getOccurrenceMeaning('A:0').meaning, '地壳');
  assert.equal(session.getOccurrenceMeaning('crust'), null);
  session.setTargetHighlight(false);
  assert.equal(session.getView().highlightTargets, false);
  assert.equal(session.getOccurrenceMeaning('A:0').meaning, '地壳');
  assert.deepEqual(session.getView().material.paragraphs, ['A正文']);
  session.selectMaterial('B');
  assert.equal(session.getOccurrenceMeaning('A:0'), null);
  assert.equal(session.getOccurrenceMeaning('B:0').meaning, '面包皮');
});

test('重置当前阅读界面回首篇和默认显隐、收起与高亮，新会话也默认', () => {
  const session = createReadingSession(catalog, materials);
  session.selectMaterial('B');
  session.setVisibility('all', 'none');
  session.toggleExtras('word:1');
  session.setTargetHighlight(false);
  session.resetView();
  const view = session.getView();
  assert.equal(view.material.id, 'A');
  assert.equal(view.globalMode, 'english');
  assert.deepEqual(view.expandedIds, []);
  assert.equal(view.highlightTargets, true);
  assert.deepEqual(view.visibility['word:1'], { english: true, chinese: false });
  session.setVisibility('word:1', 'chinese');
  assert.deepEqual(createReadingSession(catalog, materials).getView().visibility['word:1'], { english: true, chinese: false });
});
