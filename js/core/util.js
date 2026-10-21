/* ============ util.js — 共用小工具 ============ */
G.U = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  rand: (a, b) => a + Math.random() * (b - a),
  /** 兩個角度相差多少（0 ~ π） */
  angDiff(a, b) { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; },
  /** 角度 → 精靈圖的方向列（0 南、1 東南、2 東、3 東北、4 北、5 西北、6 西、7 西南） */
  dirRow(a) { const k = (Math.round(a / (Math.PI / 4)) + 8) % 8; return (10 - k) % 8; },
};
