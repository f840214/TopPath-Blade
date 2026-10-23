/* ============ input.js — 鍵盤與滑鼠輸入 ============
 * G.Input.down(code)：是否按著；G.Input.pressed(code)：這一幀剛按下（每幀結束呼叫 endFrame 清掉）。
 * 戰鬥指揮命令（滑鼠點地面、HUD 上的指揮按鈕）放進 orders 佇列：G.Input.order(o) 加一筆、G.Input.orders() 取走全部
 *   o：{ a: 'group', g: 'escort'|'field' } 切換指揮對象；{ a: 'move', x, y } 移動到那裡；{ a: 'attack', x?, y? } 進攻；{ a: 'follow' } 隨身兵團回來跟隨；{ a: 'hold' } 原地駐守
 *      { a: 'rush' } 衝鋒；{ a: 'stand' } 固守；{ a: 'spread' } 散開／密集；{ a: 'focus', x, y } 集火那裡的敵軍（C）
 *      { a: 'line', x, y, x2, y2 } 沿著線排開（拖曳）；{ a: 'select', x, y, x2, y2 } 框選隨身兵團（Shift＋拖曳）
 * 戰場上（G.Input.mouseOrders 打開時）：左鍵點地面 = 走到那裡進攻（路上遇到敵人也會打）、拖曳 = 排成一條線、Shift＋拖曳 = 框選；右鍵按住 = 格擋；C = 集火滑鼠指著的敵軍
 */
G.Input = (() => {
  const held = new Set(), hit = new Set();
  addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    if (!held.has(e.code)) hit.add(e.code);
    held.add(e.code);
    if (['Tab', 'Space', 'F3'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => held.delete(e.code));
  addEventListener('blur', () => held.clear());
  let queue = [];
  const mouse = { x: 0, y: 0 };   // 滑鼠在畫面上的位置（C 集火用）
  const api = {
    mouseOrders: false,
    order: o => { if (queue.length < 20) queue.push(o); },
    orders: () => queue.splice(0),
  };
  addEventListener('DOMContentLoaded', () => {
    const cv = document.getElementById('game'); if (!cv) return;
    cv.addEventListener('contextmenu', e => { if (api.mouseOrders) e.preventDefault(); });
    cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    // 右鍵按住：格擋（當成一個叫 Mouse2 的按鍵，跟鍵盤一起送給伺服器）
    cv.addEventListener('mousedown', e => { if (e.button === 2 && api.mouseOrders) { if (!held.has('Mouse2')) hit.add('Mouse2'); held.add('Mouse2'); } });
    addEventListener('mouseup', e => { if (e.button === 2) held.delete('Mouse2'); });
    // C：集火滑鼠指著的敵軍
    addEventListener('keydown', e => {
      if (e.code !== 'KeyC' || e.repeat || !api.mouseOrders || e.target.tagName === 'INPUT') return;
      const p = G.Render.toWorld(mouse.x, mouse.y);
      api.order({ a: 'focus', x: Math.round(p.x), y: Math.round(p.y) });
    });
    // 左鍵：點一下 = 走到那裡進攻；拖一條線 = 兵團沿著這條線排開（線的長度決定陣型寬度、朝向是線的垂直方向）；
    //   Shift＋拖曳 = 框選自己的隨身兵團（之後的指令只給框到的）
    cv.addEventListener('mousedown', e => {
      if (!api.mouseOrders || e.button !== 0) return;
      api.drag = { sx: e.clientX, sy: e.clientY, ex: e.clientX, ey: e.clientY, box: e.shiftKey, moved: false };
    });
    addEventListener('mousemove', e => {
      const d = api.drag; if (!d) return;
      d.ex = e.clientX; d.ey = e.clientY; if (Math.hypot(d.ex - d.sx, d.ey - d.sy) > 10) d.moved = true;
    });
    addEventListener('mouseup', e => {
      const d = api.drag; if (!d || e.button !== 0) return;
      api.drag = null;
      if (!api.mouseOrders) return;
      const a = G.Render.toWorld(d.sx, d.sy), b = G.Render.toWorld(d.ex, d.ey), r = v => Math.round(v);
      if (!d.moved) {
        api.order({ a: 'attack', x: r(b.x), y: r(b.y) });
        mark(b.x, b.y, 'attack');
      } else if (d.box) api.order({ a: 'select', x: r(Math.min(a.x, b.x)), y: r(Math.min(a.y, b.y)), x2: r(Math.max(a.x, b.x)), y2: r(Math.max(a.y, b.y)) });
      else { api.order({ a: 'line', x: r(a.x), y: r(a.y), x2: r(b.x), y2: r(b.y) }); mark((a.x + b.x) / 2, (a.y + b.y) / 2, 'line'); }
    });
  });
  /** 目的地插旗（畫面上，幾秒後消失；js/game.js 畫） */
  const marks = [];
  function mark(x, y, kind) {
    marks.push({ x, y, kind, t: performance.now() });
    while (marks.length > 6) marks.shift();
    if (G.FX && G.FX.ring) G.FX.ring(x, y, 26, kind === 'attack' ? 'rgba(255,120,100,0.9)' : 'rgba(140,190,255,0.9)', 0.45);   // 點下去的地方閃一圈
  }
  return Object.assign(api, {
    drag: null,   // 拖曳中：{ sx, sy, ex, ey（螢幕座標）, box（Shift 框選）, moved }
    /** 還在顯示的目的地旗子（4 秒） */
    marks: () => { const now = performance.now(); while (marks.length && now - marks[0].t > 4000) marks.shift(); return marks; },
    down: c => held.has(c),
    pressed: c => hit.has(c),
    endFrame: () => hit.clear(),
  });
})();
