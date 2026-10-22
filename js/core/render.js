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
  let app, overlay, ctx, dpr = 1;   // dpr：上層 canvas 依螢幕像素密度畫，Retina 上文字才不會糊
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
    const resize = () => {
      app.renderer.resize(innerWidth, innerHeight);
      dpr = Math.min(3, window.devicePixelRatio || 1);
      overlay.width = Math.round(innerWidth * dpr); overlay.height = Math.round(innerHeight * dpr);
      overlay.style.width = innerWidth + 'px'; overlay.style.height = innerHeight + 'px';
    };
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
  let viewT = { zoom: 1, ox: 0, oy: 0 };
  /** 螢幕座標（CSS px）→ 世界座標（用上一幀的鏡頭） */
  const toWorld = (sx, sy) => ({ x: (sx - viewT.ox) / viewT.zoom, y: (sy - viewT.oy) / viewT.zoom });
  function begin(zoom, ox, oy) {
    viewT = { zoom, ox, oy };
    app.stage.scale.set(zoom); app.stage.position.set(ox, oy);
    for (const k in pools) pools[k].n = 0;
    layers.under.clear();
    if (terrSprite) terrSprite.visible = false;   // 領地圖只有大地圖每幀會打開
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, ox * dpr, oy * dpr); ctx.imageSmoothingEnabled = false;
  }

  function end() {
    for (const k in pools) { const p = pools[k]; for (let i = p.n; i < p.list.length; i++) p.list[i].visible = false; }
    app.renderer.render(app.stage);
  }

  /** 地面：整張預先畫好的 canvas（解析度是遊戲座標的 1 / artScale 倍）；version 變了（地磚、小草載入後重畫）就重新上傳 */
  /** 疊在地面上的領地色塊（大地圖）：canvas 一格是 scale 個遊戲像素，放大時用線性內插讓邊界柔和；version 變了才重傳 */
  let terrSprite = null, terrSrc = null, terrVer = -1;
  function territory(canvas, version, scale) {
    if (!canvas) return;
    if (canvas !== terrSrc) {
      if (terrSprite) terrSprite.destroy({ texture: true, textureSource: true });
      const tex = PIXI.Texture.from(canvas); tex.source.scaleMode = 'linear';
      terrSprite = new PIXI.Sprite(tex); layers.ground.addChild(terrSprite);
      terrSrc = canvas; terrVer = version;
    } else if (version !== terrVer) { terrSprite.texture.source.update(); terrVer = version; }
    layers.ground.addChild(terrSprite);   // 永遠在地面圖上面（地面圖重建時會被加到最後）
    terrSprite.scale.set(scale); terrSprite.visible = true;
  }
  /** 地面圖；scale 是畫布像素對遊戲座標的比例（大地圖的地面用一半解析度畫，省顯示記憶體） */
  function ground(canvas, version, scale = 1) {
    if (!canvas) return;
    if (canvas !== groundSrc) {
      // keep：會重複用的地面（大地圖）貼圖留著不銷毀，下次切回來不用重新上傳到顯示卡
      if (groundSprite) { const keep = groundSrc && groundSrc.keep; groundSprite.destroy({ texture: !keep, textureSource: !keep }); }
      const tex = canvas.keep ? (canvas.tex || (canvas.tex = PIXI.Texture.from(canvas))) : PIXI.Texture.from(canvas);
      groundSprite = new PIXI.Sprite(tex); groundSprite.scale.set(G.CONFIG.artScale / scale); layers.ground.addChild(groundSprite);
      if (canvas.keep && canvas.texVer !== version) { tex.source.update(); canvas.texVer = version; }
      groundSrc = canvas; groundVer = version;
    } else if (version !== groundVer) { groundSprite.texture.source.update(); groundVer = version; }
  }

  /** 腳底的橢圓影子 */
  function shadow(x, y, rx, ry, alpha) {
    const s = take(pools.shadows);
    s.texture = shadowTex; s.tint = 0x0a0c08; s.x = x - rx; s.y = y - ry; s.width = rx * 2; s.height = ry * 2; s.alpha = alpha;   // 白色貼圖要染成黑色（以前沒設，影子是淡灰色的一塊）
  }

  /** 地上的發光橢圓（火焰區），color 是 0xRRGGBB */
  function zone(x, y, rx, ry, color, alpha) {
    const s = take(pools.zones);
    s.texture = glowTex; s.tint = color; s.x = x - rx; s.y = y - ry; s.width = rx * 2; s.height = ry * 2; s.alpha = alpha;
  }

  /** 依 y 排序層：畫圖片的一塊（精靈圖的一格）；flip 左右翻轉；k 是縮放（PixelLab 美術用 G.CONFIG.artScale） */
  function frame(img, sx, sy, w, h, dx, dy, alpha = 1, flip = false, k = 1, tint = 0xffffff) {
    const s = take(pools.sorted);
    s.texture = texOf(img, sx, sy, w, h); s.alpha = alpha; s.tint = tint;
    s.scale.x = flip ? -k : k; s.scale.y = k;
    s.x = flip ? dx + w * k : dx; s.y = dy;
  }
  /** 依 y 排序層：畫整張圖 */
  function image(img, dx, dy, alpha = 1, flip = false, k = 1) { frame(img, 0, 0, img.width, img.height, dx, dy, alpha, flip, k); }
  /** 美術圖（縮成 artScale）：以腳底中心 (x, y) 為錨點 */
  function art(img, x, y, alpha = 1, flip = false, tint) {
    const k = G.CONFIG.artScale;
    frame(img, 0, 0, img.width, img.height, x - img.width * k / 2, y - img.height * k, alpha, flip, k, tint);
  }

  /** 程式畫的小貼圖（例如城門的各種狀態），依 key 快取，只在第一次用到時畫 */
  const drawn = new Map();
  function canvasTex(key, w, h, paint) {
    let c = drawn.get(key);
    if (!c) { c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d')); drawn.set(key, c); }
    return c;
  }

  return { toWorld,
    init, begin, end, ground, territory, shadow, zone, frame, image, art, canvasTex,
    get ctx() { return ctx; },
    get under() { return layers.under; },   // 地面上、影子下的 Graphics（每幀清空）：據點圈、武將光圈
    /** 上層 canvas 改用螢幕座標（CSS px）畫：特寫、提示這類不跟鏡頭走的東西 */
    screen() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); },
    get width() { return innerWidth; },
    get height() { return innerHeight; },
  };
})();
