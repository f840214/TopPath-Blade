/* ============ util.js — 共用小工具 ============ */
G.U = {
  /** 放進 innerHTML 前跳脫玩家輸入的文字（城池名稱等） */
  esc: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  /** 折線改成平滑曲線（Catmull-Rom），每 step px 取一點 */
  smooth(path, step = 6) {
    const P = [path[0], ...path, path[path.length - 1]], out = [];
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]], n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        const f = k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
        out.push([f(0), f(1)]);
      }
    }
    out.push(path[path.length - 1]);
    return out;
  },
  /** 讓一串點自然蜿蜒：沿著前進方向的垂直方向偏移，偏移量照「走了多遠」決定（取樣密度不同也會得到同一條線） */
  meander(pts, amp, seed = 0) {
    let d = 0;
    return pts.map(([x, y], i) => {
      if (i) d += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
      const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(bx - ax, by - ay) || 1;
      const k = Math.min(1, i / 6, (pts.length - 1 - i) / 6);   // 兩端不偏，接得上原本的端點
      const o = amp * k * (Math.sin(d / 110 + seed) * 0.6 + Math.sin(d / 41 + seed * 1.7) * 0.4);
      return [x - (by - ay) / l * o, y + (bx - ax) / l * o];
    });
  },
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  rand: (a, b) => a + Math.random() * (b - a),
  /** 兩個角度相差多少（0 ~ π） */
  angDiff(a, b) { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; },
  /** 角度 → 精靈圖的方向列（0 南、1 東南、2 東、3 東北、4 北、5 西北、6 西、7 西南） */
  dirRow(a) { const k = (Math.round(a / (Math.PI / 4)) + 8) % 8; return (10 - k) % 8; },
};
