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
    const img = G.Assets.img(src);
    rec = { img, get ready() { return img.complete && img.naturalWidth > 0; } };
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
    const row = a.dirs === 1 ? 0 : G.U.dirRow(angle), k = G.CONFIG.artScale;   // 精靈圖是遊戲座標的 1.5 倍大
    const dx = x - a.ax * k, dy = y - a.ay * k, alpha = o.alpha ?? 1;
    G.Render.frame(rec.img, f * a.w, row * a.h, a.w, a.h, dx, dy, alpha, false, k, 0xffffff, o.rot || 0, a.ax, a.ay);   // o.rot：擊倒時躺平
    if (o.flash > 0) G.Render.frame(white(rec.img), f * a.w, row * a.h, a.w, a.h, dx, dy, Math.min(1, o.flash * 6) * alpha, false, k, 0xffffff, o.rot || 0, a.ax, a.ay);
    return a;
  }

  /** 兵種／武將的小圖示（Idle 朝南第一格、裁掉透明邊，放大 k 倍的 data URL，選單用）；圖還沒載好回傳空字串 */
  const icons = new Map();
  function icon(sprite, k = 2) {
    const id = sprite + k; if (icons.has(id)) return icons.get(id);
    const m = G.SPRITE_META[sprite], a = m && m.anims.Idle, im = a && G.Assets.img(`assets/units/${sprite}/Idle.png`);
    if (!im || !im.complete || !im.naturalWidth) return '';
    const c = document.createElement('canvas'); c.width = a.w; c.height = a.h;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0, a.w, a.h, 0, 0, a.w, a.h);
    const d = g.getImageData(0, 0, a.w, a.h).data; let x0 = a.w, y0 = a.h, x1 = 0, y1 = 0;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (d[(y * a.w + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, o = document.createElement('canvas'); o.width = w * k; o.height = h * k;
    const og = o.getContext('2d'); og.imageSmoothingEnabled = false; og.drawImage(c, x0, y0, w, h, 0, 0, w * k, h * k);
    const url = o.toDataURL(); icons.set(id, url); return url;
  }

  return { draw, duration, animOf, icon };
})();
