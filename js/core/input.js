/* ============ input.js — 鍵盤輸入（遊戲中不用滑鼠）============
 * G.Input.down(code)：是否按著；G.Input.pressed(code)：這一幀剛按下（每幀結束呼叫 endFrame 清掉）。
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
  return {
    down: c => held.has(c),
    pressed: c => hit.has(c),
    endFrame: () => hit.clear(),
  };
})();
