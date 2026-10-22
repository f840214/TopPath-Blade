/* ============ town-small.js — 佔領的城池（小城）============
 * 從主城的配置取下半部（靠城門的兩排街區），整個往上移 DY，最上面放城主府；名稱用大地圖上的城名（G.Town.enter 的 name）。
 */
G.TOWNS.small = (() => {
  const m = G.TOWNS.main, DY = -540, cx = m.wall.gateX, up = p => ({ ...p, y: p.y + DY });
  const keep = b => b.y >= 740 && !(b.y < 860 && Math.abs(b.x - cx) < 150) && b.role !== 'drill';
  return {
    ...m, name: '城鎮',
    size: { w: m.size.w, h: m.size.h + DY },
    spawn: up(m.spawn), gate: up(m.gate),
    wall: { ...m.wall, wallY: m.wall.wallY + DY },
    roads: m.roads.map(r => ({ ...r, h: r.h + DY })),
    buildings: [...m.buildings.filter(keep).map(up), { art: 'keep', x: cx, y: 300, fw: 136, fh: 78, label: '城主府', role: 'hero' }],
  };
})();
