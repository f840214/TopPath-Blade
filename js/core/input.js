/* ============ input.js — 鍵盤與滑鼠輸入 ============
 * G.Input.down(code)：是否按著；G.Input.pressed(code)：這一幀剛按下（每幀結束呼叫 endFrame 清掉）。
 * 戰鬥指揮命令（滑鼠點地面、HUD 上的指揮按鈕）放進 orders 佇列：G.Input.order(o) 加一筆、G.Input.orders() 取走全部
 *   o：{ a: 'group', g: 'escort'|'field' } 切換指揮對象；{ a: 'move', x, y } 移動到那裡；{ a: 'attack', x?, y? } 進攻；{ a: 'follow' } 隨身兵團回來跟隨；{ a: 'hold' } 原地駐守
 * 戰場上（G.Input.mouseOrders 打開時）：左鍵 = 移動到那裡，右鍵 = 往那裡進攻
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
  const api = {
    mouseOrders: false,
    order: o => { if (queue.length < 20) queue.push(o); },
    orders: () => queue.splice(0),
  };
  addEventListener('DOMContentLoaded', () => {
    const cv = document.getElementById('game'); if (!cv) return;
    cv.addEventListener('contextmenu', e => { if (api.mouseOrders) e.preventDefault(); });
    cv.addEventListener('mousedown', e => {
      if (!api.mouseOrders || (e.button !== 0 && e.button !== 2)) return;
      const p = G.Render.toWorld(e.clientX, e.clientY);
      api.order({ a: e.button === 0 ? 'move' : 'attack', x: Math.round(p.x), y: Math.round(p.y) });
      if (G.FX && G.FX.ring) G.FX.ring(p.x, p.y, 26, e.button === 0 ? 'rgba(140,190,255,0.9)' : 'rgba(255,120,100,0.9)', 0.45);   // 點下去的地方閃一圈
    });
  });
  return Object.assign(api, {
    down: c => held.has(c),
    pressed: c => hit.has(c),
    endFrame: () => hit.clear(),
  });
})();
