/* ============ render.js — 繪圖層（PixiJS / WebGL ＋ 上層 Canvas 2D）============
 * 量大的東西交給 PixiJS 用 GPU 批次畫：地面、火焰區、影子、士兵／武將／樹石／城牆（依 y 排序）。
 * 量少的東西照舊用 Canvas 2D 畫在上層 #overlay：粒子、刀光、傷害數字、箭、兵團旗標、大招特寫、血條。
 *
 * 用法是「每幀從頭畫」：begin() → ground / zone / shadow / image / frame … → end()。
 * 每一層有一個 Sprite 池，每幀依呼叫順序借用，沒用到的隱藏；所以依 y 排序後依序呼叫，畫的順序就對了。
 *
 * 注意：WebGL 不能讀 file:// 的圖片，要用本機伺服器開（見 README）。
 */
G.Render = (() => {
  let app, overlay, ctx;
  let groundSprite = null, groundSrc = null, groundVer = -1;
  const layers = {};   // ground / zones / under（Graphics）/ shadows / sorted
  const pools = {};
  const sources = new WeakMap();   // 圖片或 canvas → { tex, frames: Map }
  let shadowTex, glowTex;

  async function init() {
    PIXI.TextureSource.defaultOptions.scaleMode = 'nearest';
    app = new PIXI.Application();
    await app.init({
      canvas: document.getElementById('game'), width: innerWidth, height: innerHeight,
      background: 0x1b1f17, antialias: false, autoStart: false, preference: 'webgl', resolution: 1, roundPixels: true,
    });
    overlay = document.getElementById('overlay'); ctx = overlay.getContext('2d');
    const world = app.stage;
    for (const k of ['ground', 'zones', 'under', 'shadows', 'sorted']) world.addChild(layers[k] = k === 'under' ? new PIXI.Graphics() : new PIXI.Container());
    for (const k of ['zones', 'shadows', 'sorted']) pools[k] = { c: layers[k], list: [], n: 0 };
    shadowTex = PIXI.Texture.from(ellipseCanvas(64, 16, false));
    glowTex = PIXI.Texture.from(ellipseCanvas(128, 128, true));
    const resize = () => { app.renderer.resize(innerWidth, innerHeight); overlay.width = innerWidth; overlay.height = innerHeight; };
    addEventListener('resize', resize); resize();
  }

  /** 影子（實心橢圓）和火焰區（中心亮、往外淡出）用的白色貼圖，用 tint 上色 */
  function ellipseCanvas(w, h, soft) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (soft) {
      const gr = g.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    } else {
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  /** 圖片（或 canvas）的某一塊 → Pixi Texture，依位置快取 */
  function texOf(img, sx = 0, sy = 0, w = img.width, h = img.height) {
    let rec = sources.get(img);
    if (!rec) sources.set(img, rec = { tex: PIXI.Texture.from(img), frames: new Map() });
    if (sx === 0 && sy === 0 && w === img.width && h === img.height) return rec.tex;
    const key = ((sx * 4096 + sy) * 256 + w) * 256 + h;
    let t = rec.frames.get(key);
    if (!t) rec.frames.set(key, t = new PIXI.Texture({ source: rec.tex.source, frame: new PIXI.Rectangle(sx, sy, w, h) }));
    return t;
  }

  function take(pool) {
    let s = pool.list[pool.n];
    if (!s) { s = new PIXI.Sprite(); pool.list.push(s); pool.c.addChild(s); }
    pool.n++; s.visible = true;
    return s;
  }

  /** 每幀開始：設定鏡頭（縮放＋位移，已含震動），清空上層 canvas 並套用同樣的轉換 */
  function begin(zoom, ox, oy) {
    app.stage.scale.set(zoom); app.stage.position.set(ox, oy);
    for (const k in pools) pools[k].n = 0;
    layers.under.clear();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.setTransform(zoom, 0, 0, zoom, ox, oy); ctx.imageSmoothingEnabled = false;
  }

  function end() {
    for (const k in pools) { const p = pools[k]; for (let i = p.n; i < p.list.length; i++) p.list[i].visible = false; }
    app.renderer.render(app.stage);
  }

  /** 地面：整張預先畫好的 canvas；version 變了（地磚、小草載入後重畫）就重新上傳 */
  function ground(canvas, version) {
    if (!canvas) return;
    if (canvas !== groundSrc) {
      if (groundSprite) groundSprite.destroy({ texture: true, textureSource: true });
      groundSprite = new PIXI.Sprite(PIXI.Texture.from(canvas)); layers.ground.addChild(groundSprite);
      groundSrc = canvas; groundVer = version;
    } else if (version !== groundVer) { groundSprite.texture.source.update(); groundVer = version; }
  }

  /** 腳底的橢圓影子 */
  function shadow(x, y, rx, ry, alpha) {
    const s = take(pools.shadows);
    s.texture = shadowTex; s.x = x - rx; s.y = y - ry; s.width = rx * 2; s.height = ry * 2; s.alpha = alpha;
  }

  /** 地上的發光橢圓（火焰區），color 是 0xRRGGBB */
  function zone(x, y, rx, ry, color, alpha) {
    const s = take(pools.zones);
    s.texture = glowTex; s.tint = color; s.x = x - rx; s.y = y - ry; s.width = rx * 2; s.height = ry * 2; s.alpha = alpha;
  }

  /** 依 y 排序層：畫圖片的一塊（精靈圖的一格）；flip 左右翻轉 */
  function frame(img, sx, sy, w, h, dx, dy, alpha = 1, flip = false) {
    const s = take(pools.sorted);
    s.texture = texOf(img, sx, sy, w, h); s.alpha = alpha;
    s.scale.x = flip ? -1 : 1; s.scale.y = 1;
    s.x = flip ? dx + w : dx; s.y = dy;
  }
  /** 依 y 排序層：畫整張圖 */
  function image(img, dx, dy, alpha = 1, flip = false) { frame(img, 0, 0, img.width, img.height, dx, dy, alpha, flip); }

  /** 程式畫的小貼圖（例如城門的各種狀態），依 key 快取，只在第一次用到時畫 */
  const drawn = new Map();
  function canvasTex(key, w, h, paint) {
    let c = drawn.get(key);
    if (!c) { c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d')); drawn.set(key, c); }
    return c;
  }

  return {
    init, begin, end, ground, shadow, zone, frame, image, canvasTex,
    get ctx() { return ctx; },
    get under() { return layers.under; },   // 地面上、影子下的 Graphics（每幀清空）：據點圈、武將光圈
    get width() { return overlay.width; },
    get height() { return overlay.height; },
  };
})();
