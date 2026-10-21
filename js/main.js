/* ============ main.js — 啟動：開場畫面（背景是自動對戰）→ 按任意鍵 → 出戰選單 ============ */
if (location.protocol === 'file:')
  document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:40% 0 auto;text-align:center;font-size:18px">WebGL 不能讀 file:// 的圖片，請雙擊 serve.cmd 用本機伺服器開（需要 Node.js）。</p>');
else G.Render.init().then(() => {   // PixiJS 初始化是非同步的，好了才開始
  G.Sprites.preload();
  G.Game.init();
  G.Game.startDemo();
  G.Menu.init();
});
