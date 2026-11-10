const normalizeNumber = value => {
  const match = String(value).match(/^0*(\d+)(-[a-z]+)?$/i);
  return match ? `${Number(match[1])}${(match[2] || '').toUpperCase()}` : null;
};
export function createReadingSession(catalog, materials) {
  let current = materials[0];
  let scope = 'current';
  let filters = { grade: 'all', query: '' };
  let countFilter=null;
  let records=null;
  const comparisons={'>':(a,b)=>a>b,'>=':(a,b)=>a>=b,'=':(a,b)=>a===b,'<':(a,b)=>a<b,'<=':(a,b)=>a<=b};
  const matchesEntry = entry => {
    const query = filters.query.trim().toLowerCase();
    const number = normalizeNumber(query);
    return number ? normalizeNumber(entry.number) === number :
      entry.word.toLowerCase().startsWith(query) || entry.senses.some(s => s.text.includes(query));
  };
  const entries = catalog.flatMap(group => [group, ...(group.extras || [])]);
  const modes = {
    english: { english: true, chinese: false },
    chinese: { english: false, chinese: true },
    both: { english: true, chinese: true },
    none: { english: false, chinese: false },
  };
  let globalMode = 'english';
  const visibility = new Map(entries.map(entry => [entry.id, 'english']));
  const expanded = new Set();
  let highlightTargets = true;
  return {
    setRecords(value){
      if(!value || !value.counts?.reading || !Number.isSafeInteger(value.revision))throw new Error('记录视图无效。');
      if(!records || value.revision>=records.revision) records=structuredClone(value);
    },
    setCountFilter(value){
      if(value!==null && (!records || !Object.hasOwn(comparisons,value.operator)||!Number.isSafeInteger(value.threshold)||value.threshold<0))throw new Error('次数筛选无效或记录尚未读取。');
      countFilter=value===null?null:{...value};
    },
    searchMaterials(value) {
      const query = value.trim().toLowerCase();
      if (!query) return [];
      const results = [];
      const number = normalizeNumber(query);
      for (const material of materials) {
        const add = hit => results.push({ materialId: material.id, title: material.title, ...hit });
        if (material.title.toLowerCase().includes(query)) add({ id:`${material.id}:title`, kind:'title', snippet:material.title });
        material.paragraphs.forEach((paragraph, paragraphIndex) => {
          const plain = paragraph.replaceAll('`','');
          let start = plain.toLowerCase().indexOf(query);
          while (start !== -1) {
            add({ id:`${material.id}:body:${paragraphIndex}:${start}`,kind:'body',paragraphIndex,start,end:start+query.length,
              snippet:plain.slice(Math.max(0,start-28),start+query.length+50) });
            start = plain.toLowerCase().indexOf(query,start+query.length);
          }
        });
        for (const occurrence of material.occurrences || []) {
          const group = catalog.find(g=>g.id===occurrence.groupId);
          if (occurrence.meaning.toLowerCase().includes(query) || occurrence.text.toLowerCase().includes(query) ||
              (number && normalizeNumber(group?.number) === number)) {
            add({id:`${material.id}:${occurrence.id}`,kind:'target',occurrenceId:occurrence.id,paragraphIndex:occurrence.paragraphIndex,
              start:occurrence.start,end:occurrence.end,snippet:`${occurrence.text} · ${occurrence.meaning}`});
          }
        }
      }
      return results;
    },
    setFilters(next) {
      if (next.grade !== undefined && !['all','0','1','2'].includes(next.grade)) throw new RangeError('未知P档。');
      if (next.query !== undefined && typeof next.query !== 'string') throw new TypeError('检索词必须是文字。');
      filters = { ...filters, ...next };
    },
    setScope(value) {
      if (!['current', 'all'].includes(value)) throw new RangeError('未知词表范围。');
      scope = value;
    },
    resetView() {
      countFilter=null;
      current = materials[0];
      scope = 'current';
      filters = { grade: 'all', query: '' };
      globalMode = 'english';
      for (const entry of entries) visibility.set(entry.id, 'english');
      expanded.clear();
      highlightTargets = true;
    },
    getOccurrenceMeaning(id) {
      const occurrence = (current.occurrences || []).find(item => item.id === id);
      return occurrence ? { ...occurrence } : null;
    },
    setTargetHighlight(value) {
      highlightTargets = Boolean(value);
    },
    toggleExtras(id) {
      if (!catalog.some(group => group.id === id)) throw new RangeError('未知母词组。');
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
    },
    setVisibility(id, mode) {
      if (!Object.hasOwn(modes, mode)) throw new RangeError('未知显示模式。');
      if (id === 'all') {
        globalMode = mode;
        for (const entry of entries) visibility.set(entry.id, mode);
      } else {
        if (!visibility.has(id)) throw new RangeError('未知词条。');
        visibility.set(id, mode);
      }
    },
    selectMaterial(id) {
      const next = materials.find(material => material.id === id);
      if (!next) throw new RangeError('未知材料，已保留当前文章。');
      current = next;
      countFilter=null;
      scope = 'current';
      filters = { grade: 'all', query: '' };
    },
    getView() {
      const groups = catalog
        .filter(group => scope === 'all' || current.targetGroupIds.includes(group.id))
        .filter(group => filters.grade === 'all' || [group,...(group.extras || [])].some(entry => entry.senses.some(s => String(s.grade) === filters.grade)))
        .filter(group => !filters.query.trim() || [group,...(group.extras || [])].some(matchesEntry))
        .filter(group => !countFilter || [group,...(group.extras || [])].some(entry=>comparisons[countFilter.operator](records.counts.reading[entry.id]||0,countFilter.threshold)))
        .sort((a, b) => a.number - b.number);
      return {
        scope,
        filters: { ...filters },
        countFilter:countFilter&&{...countFilter},
        recordsReady:records!==null,
        counts:records ? {...records.counts.reading}:null,
        undoable:records ? {...records.undoable.reading}:null,
        history:records ? structuredClone(records.history.reading):null,
        globalMode,
        expandedIds: [...expanded],
        highlightTargets,
        visibility: Object.fromEntries([...visibility].map(([id, mode]) => [id, { ...modes[mode] }])),
        material: current,
        groups,
        matches: !filters.query.trim() ? [] : groups.flatMap(group => [group,...(group.extras || [])]
          .filter(matchesEntry).map(entry => ({groupId:group.id,entryId:entry.id,number:entry.number}))),
      };
    },
  };
}
