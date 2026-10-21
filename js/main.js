/* ============ main.js — 啟動：開場畫面（背景是自動對戰）→ 按任意鍵 → 出戰選單 ============ */
if (location.protocol === 'file:')
  document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:40% 0 auto;text-align:center;font-size:18px">請雙擊 serve.cmd 開啟遊戲伺服器（需要 Node.js），再到 http://localhost:8765/ 登入遊玩。</p>');
else G.Render.init().then(() => {   // PixiJS 初始化是非同步的，好了才開始
  G.Sprites.preload();
  G.Game.init();
  G.Game.startDemo();
  G.Menu.init();
});
