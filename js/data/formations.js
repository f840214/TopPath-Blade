/* ============ formations.js — 陣型 ============
 * slots(n) 回傳每個士兵在「面向 +x」座標系裡的位置：x = 前後（負的在後面），y = 左右。
 */
(() => {
  const grid = (n, cols, sp) => {
    const rows = Math.ceil(n / cols), out = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      out.push({ x: -r * sp, y: (c - (cols - 1) / 2) * sp });
    }
    // 讓陣型中心落在 (0,0)
    const back = (rows - 1) * sp / 2;
    out.forEach(p => p.x += back);
    return out;
  };

  G.formationGrid = grid;   // 拉線排陣型用（G.Squad.slots）
  G.FORMATIONS = {
    block:  { name: '方陣', slots: n => grid(n, Math.ceil(Math.sqrt(n * 1.4)), 15) },
    line:   { name: '橫隊', slots: n => grid(n, Math.ceil(n / 2), 15), flankTakenMul: 1.2 },
    column: { name: '縱隊', slots: n => grid(n, 2, 15), speedMul: 1.15, flankTakenMul: 1.25 },
    loose:  { name: '散開', slots: n => grid(n, Math.ceil(Math.sqrt(n * 1.4)), 28), rangedTakenMul: 0.7 },
    wedge:  {
      name: '楔形', chargeMul: 1.2,
      slots: n => {
        const out = []; let row = 0, i = 0;
        while (i < n) {
          for (let c = 0; c <= row && i < n; c++, i++) out.push({ x: -row * 18, y: (c - row / 2) * 18 });
          row++;
        }
        const back = (row - 1) * 18 / 2;
        out.forEach(p => p.x += back);
        return out;
      },
    },
  };
})();
