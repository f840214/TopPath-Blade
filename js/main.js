/* ============ main.js — 啟動：開場畫面（背景是自動對戰）→ 載完圖片 → 按任意鍵 → 登入 ============ */
if (location.protocol === 'file:')
  document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:40% 0 auto;text-align:center;font-size:18px">請雙擊 serve.cmd 開啟遊戲伺服器（需要 Node.js），再到 http://localhost:8765/ 登入遊玩。</p>');
else {
  // 開場畫面一出來就開始預先載入全部圖片（進度條在「按任意鍵開始」的位置，載完才能按）
  G.Assets.boot((k, text) => {
    document.getElementById('loadFill').style.width = `${Math.round(k * 100)}%`;
    document.getElementById('loadText').textContent = k < 1 ? `載入中・${text}` : '◆ 按任意鍵開始 ◆';
    if (k >= 1) document.querySelector('#title .press').classList.remove('loading');
  });
  G.Render.init().then(() => {   // PixiJS 初始化是非同步的，好了才開始
    G.Game.init();
    G.Game.startDemo();
    G.Menu.init();
    G.Town.bindHud();
    G.World.bindHud();
    G.Create.bind();
    G.Heraldry.bind();
    G.Net.bind();
  });
}
