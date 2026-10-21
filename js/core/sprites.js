/* ============ sprites.js — 精靈圖 ============
 * assets/units/<sprite>/<Anim>.png：每列一個方向、每欄一格。
 *   列順序 0 南 · 1 東南 · 2 東 · 3 東北 · 4 北 · 5 西北 · 6 西 · 7 西南
 *   只有一個方向的動畫（例如技能）dirs = 1，任何朝向都用那一列。
 * 幾何資料在 G.SPRITE_META（js/data/sprites-meta.js，由 tools/import_pixellab.py 產生）：
 *   { anims: { Walk: { w, h, n, fps, loop, ax, ay, dirs, hit? } }, red: true, saddle: [[dx,dy] × 8] }
 * ax/ay 是腳底錨點：畫在世界座標 (x, y) 時，這一點會落在 (x, y)。
 * red: true 表示另有 red/<Anim>.png（敵軍配色）。
 */
G.Sprites = (() => {
  const imgs = new Map();
  const whites = new WeakMap();

  function load(src) {
    let rec = imgs.get(src);
    if (rec) return rec;
    rec = { img: new Image(), ready: false };
    rec.img.onload = () => rec.ready = true;
    rec.img.src = src;
    imgs.set(src, rec);
    return rec;
  }

  /** 受擊閃白用的白色版本（source-in 合成，不需要讀像素，所以 file:// 也能用） */
  function white(img) {
    let c = whites.get(img);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    whites.set(img, c);
    return c;
  }

  function animOf(sprite, anim) {
    const m = G.SPRITE_META[sprite];
    if (!m) return null;
    for (const a of [anim, 'Walk', 'Idle']) if (m.anims[a]) return { name: a, ...m.anims[a] };
    return null;
  }

  /** 先把所有圖排進下載，避免開打時才閃現 */
  function preload() {
    for (const [sprite, m] of Object.entries(G.SPRITE_META))
      for (const a of Object.keys(m.anims)) {
        load(`assets/units/${sprite}/${a}.png`);
        if (m.red) load(`assets/units/${sprite}/red/${a}.png`);
      }
  }

  /** 動畫長度（秒），一次性動畫用來判斷播完沒 */
  function duration(sprite, anim) { const a = animOf(sprite, anim); return a ? a.n / a.fps : 0; }

  /**
   * 畫一格（交給 G.Render 放進依 y 排序層）。t = 動畫已播放秒數；loop 動畫會循環，非 loop 停在最後一格。
   * 回傳實際使用的動畫資料（找不到時回傳 null）。
   */
  function draw(sprite, anim, angle, t, x, y, o = {}) {
    const a = animOf(sprite, anim);
    if (!a) return null;
    const rec = load(`assets/units/${sprite}/${o.red && G.SPRITE_META[sprite].red ? 'red/' : ''}${a.name}.png`);
    if (!rec.ready) return a;
    let f = Math.floor(t * a.fps);
    f = a.loop ? f % a.n : Math.min(f, a.n - 1);
    const row = a.dirs === 1 ? 0 : G.U.dirRow(angle);
    const dx = Math.round(x - a.ax), dy = Math.round(y - a.ay), alpha = o.alpha ?? 1;
    G.Render.frame(rec.img, f * a.w, row * a.h, a.w, a.h, dx, dy, alpha);
    if (o.flash > 0) G.Render.frame(white(rec.img), f * a.w, row * a.h, a.w, a.h, dx, dy, Math.min(1, o.flash * 6) * alpha);
    return a;
  }

  return { preload, draw, duration, animOf };
})();
