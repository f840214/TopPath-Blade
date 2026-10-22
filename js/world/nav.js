/* ============ nav.js — 網格流場尋路 ============
 * 全圖切成 CELL px 的格子，格子中心被 G.Map.blocked 擋住（城牆沒入口的地方、建築腳下）就不能走。
 * 每個目的地（量化到 GOAL px 一格）用 BFS 算一張「到目的地還有幾步」的表，所有往那裡走的人共用；
 * 表放在快取裡（最多 MAX 張），城門、缺口、雲梯的通行狀態一變就整個重算。
 * 只有攻城圖、城內這種有障礙的地圖才用；空地直接直線走（G.Map.route 決定）。
 */
G.Nav = (() => {
  const CELL = 16, GOAL = 64, MAX = 64, INF = 0x7fffffff;
  let cols = 0, rows = 0, solid = null, sig = '', cache = new Map();
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  /** 通行狀態的簽名：入口開關、雲梯數量變了就要重算 */
  function signature() {
    const c = G.Map.castle;
    return (c ? c.openings.map(o => (G.Map.passable(o) ? 1 : 0)).join('') : '') + '|' + (G.Map.town ? 't' : '');
  }
  function ensure() {
    const s = signature(), { w, h } = G.CONFIG.world;
    if (solid && s === sig) return;
    sig = s; cache.clear();
    cols = Math.ceil(w / CELL); rows = Math.ceil(h / CELL);
    solid = G.Map.blockedGrid(cols, rows, CELL);   // 每個障礙物蓋自己的格子（以前一格一格問 G.Map.blocked，大地圖要 3 秒）
  }
  const cellOf = (x, y) => G.U.clamp(Math.floor(y / CELL), 0, rows - 1) * cols + G.U.clamp(Math.floor(x / CELL), 0, cols - 1);

  /** 從目的地往外 BFS；目的地被擋住時改從最近的空格開始 */
  function field(tx, ty) {
    const gx = Math.floor(tx / GOAL), gy = Math.floor(ty / GOAL), key = gy * 1000 + gx;
    let f = cache.get(key);
    if (f) { cache.delete(key); cache.set(key, f); return f; }   // 移到最新
    f = new Int32Array(cols * rows).fill(INF);
    let start = cellOf(gx * GOAL + GOAL / 2, gy * GOAL + GOAL / 2);
    if (solid[start]) start = nearestOpen(start);
    if (start >= 0) {
      const q = new Int32Array(cols * rows); let head = 0, tail = 0;
      f[start] = 0; q[tail++] = start;
      while (head < tail) {
        const i = q[head++], x = i % cols, y = (i / cols) | 0, d = f[i] + 1;
        for (let k = 0; k < 4; k++) {
          const nx = x + N8[k][0], ny = y + N8[k][1];
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx;
          if (solid[j] || f[j] <= d) continue;
          f[j] = d; q[tail++] = j;
        }
      }
    }
    cache.set(key, f);
    if (cache.size > MAX) cache.delete(cache.keys().next().value);
    return f;
  }
  function nearestOpen(i) {
    const x0 = i % cols, y0 = (i / cols) | 0;
    for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (x >= 0 && y >= 0 && x < cols && y < rows && !solid[y * cols + x]) return y * cols + x;
    }
    return -1;
  }

  /**
   * 從 (x, y) 往 (tx, ty) 的下一個路點：沿著流場往下走 3 格（斜走不切牆角）。
   * 走不到（例如城門關著、牆上沒有入口）回傳 null，交給呼叫端處理。
   */
  function step(x, y, tx, ty) {
    ensure();
    const f = field(tx, ty);
    let i = cellOf(x, y);
    if (f[i] === INF) return null;
    for (let n = 0; n < 3; n++) {
      const cx = i % cols, cy = (i / cols) | 0;
      let best = i;
      for (const [dx, dy] of N8) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (f[j] >= f[best]) continue;
        if (dx && dy && (solid[cy * cols + nx] || solid[ny * cols + cx])) continue;   // 不切牆角
        best = j;
      }
      if (best === i) break;
      i = best;
    }
    return { x: (i % cols) * CELL + CELL / 2, y: ((i / cols) | 0) * CELL + CELL / 2 };
  }

  return { step, reset() { solid = null; cache.clear(); } };
})();
