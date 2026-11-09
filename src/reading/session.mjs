export function createReadingSession(catalog, materials) {
  let current = materials[0];
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
    resetView() {
      current = materials[0];
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
    },
    getView() {
      return {
        globalMode,
        expandedIds: [...expanded],
        highlightTargets,
        visibility: Object.fromEntries([...visibility].map(([id, mode]) => [id, { ...modes[mode] }])),
        material: current,
        groups: catalog
          .filter(group => current.targetGroupIds.includes(group.id))
          .sort((a, b) => a.number - b.number),
      };
    },
  };
}
