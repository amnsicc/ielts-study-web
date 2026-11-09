export function createReadingSession(catalog, materials) {
  let current = materials[0];
  return {
    selectMaterial(id) {
      const next = materials.find(material => material.id === id);
      if (!next) throw new RangeError('未知材料，已保留当前文章。');
      current = next;
    },
    getView() {
      return {
        material: current,
        groups: catalog
          .filter(group => current.targetGroupIds.includes(group.id))
          .sort((a, b) => a.number - b.number),
      };
    },
  };
}
