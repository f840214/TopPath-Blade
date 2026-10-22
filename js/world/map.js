/* ============ map.js — 地面、城牆、城門、主堡據點 ============
 * 地面用 Wang 轉角地磚（G.TILES，tools/import_tiles.py 產生）。
 * 攻城圖：城牆是一條橫跨地圖的牆（y = wallY），牆上的「入口」（openings）才能通過：
 *   城門（打破或打開時）、可破壞的城牆段（打掉後變成缺口）、搭好的雲梯（窄、爬得慢）。
 *   守方可以開關城門（出城）。城內有依序佔領的多段據點（外城 → 內城 → 主堡）。
 * 城牆、城門樓、塔樓、樹木石頭是 PixelLab 生成的素材（assets/map/），透過 G.Render 跟單位一起依 y 排序繪製。
 * 裝飾物（樹、石頭、草叢）依種子隨機擺放，避開出生點、城牆和城門通道；小草直接畫進地面。
 * 城內有建築（js/data/town.js）：建築腳下的範圍不能站，尋路會繞過建築的角；道路是程式畫的石板（paving）。
 * PixelLab 美術是遊戲座標的 1.5 倍大，畫的時候縮成 G.CONFIG.artScale（地面 canvas 也是用美術原尺寸畫，再整張縮小）。
 */
G.Map = (() => {
  let ground = null, groundVer = 0, castle = null, decos = [], town = null;   // town：城內的建築與道路（G.TOWNS）   // groundVer：地面 canvas 每重畫一次 +1，G.Render 據此重新上傳
  const art = {};
  const K = () => G.CONFIG.artScale;
  const load = (n, src) => art[n] || (art[n] = G.Assets.img(src));
  for (const n of ['oak', 'pine', 'rocks', 'bush', 'grass', 'wall', 'gatehouse', 'tower']) load(n, `assets/map/${n}.png`);
  const ready = n => art[n].complete && art[n].naturalWidth > 0;
  // 城門樓圖上木門的位置（量 assets/map/gatehouse.png 得到的，美術原尺寸像素）
  const DOOR = { x: 104, y: 135, w: 57, h: 57 };

  /**
   * 地面：Wang 轉角地磚。頂點有三種地形：upper 草地、lower 泥土、road 石板路（道路一定要被泥土包著，
   * 先畫草地／泥土那一層，再把石板路地磚疊上去）。canvas 用美術原尺寸（一格 tile 像素 = tile × artScale 遊戲座標）。
   * roads：[{ x, y, w, h }] 石板路範圍；blobs：要不要隨機撒幾塊泥地（大地圖關掉，只留道路）
   */
  // cacheKey：同樣的地面（大地圖）只畫一次，之後直接拿畫好的 canvas（每次重畫要一兩百 ms，切場景會卡）
  const groundCache = {};
  function buildGround(seed, dirtRects = [], avoid = [], roads = [], opts = {}) {
    const hit = opts.cacheKey && groundCache[opts.cacheKey];
    if (hit) { ground = hit.ground; groundScale = hit.scale; decos = hit.decos; groundVer++; return; }
    buildGroundNow(seed, dirtRects, avoid, roads, opts);
    if (opts.cacheKey) { ground.keep = true; groundCache[opts.cacheKey] = { ground, scale: groundScale, decos }; }
  }
  /** 先在背景畫好某個有 cacheKey 的地面，畫完把現在場景的地面還原（在城裡時先把大地圖畫好） */
  function prebuildGround(useScale, ...args) {
    if (groundCache[args[4].cacheKey]) return;
    const saved = { ground, groundVer, groundScale, decos, world: G.CONFIG.world, art: G.CONFIG.artScale };
    G.useScale(useScale);
    try { buildGround(...args); }
    finally { ({ ground, groundVer, groundScale, decos } = saved); G.CONFIG.world = saved.world; G.CONFIG.artScale = saved.art; }
  }
  function buildGroundNow(seed, dirtRects = [], avoid = [], roads = [], opts = {}) {
    const { blobs = false, decos: decoN = 260, tufts: tuftN = 420, paint: paintExtra, ok = () => true, scale: gs = 1 } = opts;   // scale：畫布解析度（大地圖用 0.5）   // ok(x, y)：這裡能不能放樹石草叢
    const { w, h, tile } = G.CONFIG.world, ts = tile * K(), cols = Math.ceil(w / ts), rows = Math.ceil(h / ts);
    let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const spots = Array.from({ length: blobs ? 9 : 0 }, () => ({ x: rnd() * cols, y: rnd() * rows, r: 2 + rnd() * 5 }));
    const V = [];
    for (let y = 0; y <= rows; y++) {
      V.push([]);
      for (let x = 0; x <= cols; x++) {
        const px = x * ts, py = y * ts, inR = r => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
        const dirt = spots.some(b => Math.hypot(x - b.x, y - b.y) < b.r * 1.5) || dirtRects.some(inR);
        V[y].push(roads.some(inR) ? 'road' : dirt ? 'lower' : 'upper');
      }
    }
    const c = document.createElement('canvas'); c.width = Math.ceil(cols * tile * gs); c.height = Math.ceil(rows * tile * gs);
    const g = c.getContext('2d');
    g.scale(gs, gs);   // 下面都照全解析度的座標畫，縮小的部分交給畫布
    groundScale = gs;
    const img = G.Assets.img('assets/tiles/ground.png');
    // 裝飾物位置（先決定好，地面畫完再把小草疊上去）
    const isDirt = (px, py) => V[Math.min(rows, Math.round(py / ts))][Math.min(cols, Math.round(px / ts))] !== 'upper';
    const clear = (px, py, r) => ok(px, py) && avoid.every(a => Math.hypot(px - a.x, py - a.y) > r) &&
      !(castle && Math.abs(py - castle.wallY) < 90) && !(castle && Math.abs(px - castle.gate.x) < 120) &&
      !(town && castle && py < castle.wallY) &&   // 城內鋪石板，不放野外的樹石草叢
      !(town && town.buildings.some(b => px > b.x - b.fw / 2 - 40 && px < b.x + b.fw / 2 + 40 && py > b.y - b.fh - 40 && py < b.y + 40));
    decos = []; const tufts = [], patches = [];
    for (let i = 0; i < decoN; i++) {
      const px = rnd() * w, py = rnd() * h, edge = Math.min(px, py, w - px, h - py);
      const kind = rnd();
      if (kind < 0.35 && (edge < 260 || rnd() < 0.15)) { if (clear(px, py, 170) && !isDirt(px, py)) decos.push({ n: rnd() < 0.55 ? 'oak' : 'pine', x: px, y: py, flip: rnd() < 0.5 }); }
      else if (kind < 0.5) continue;   // 石頭改成擋路的障礙（setupField 的 rocks），不再隨機撒
      // 圓形灌木（bush）不放了（太突兀）；野戰地面改成泥巴地、水窪、踩出來的土路（下面 paint 的 mud）
    }
    // 戰場地形：擋路的石堆、樹林裡的樹（位置由 setupField 決定，伺服器和瀏覽器一樣）
    for (const r of rocks) decos.push({ n: 'rocks', x: r.x, y: r.y, flip: r.flip });
    for (const z of zones) if (z.kind === 'forest') {
      let zs = z.x * 7 + z.y * 13; const zr = () => (zs = (zs * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < z.r / 9; i++) { const a = zr() * Math.PI * 2, d = Math.sqrt(zr()) * z.r * 0.92; decos.push({ n: zr() < 0.55 ? 'pine' : 'oak', x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d * 0.62, flip: zr() < 0.5 }); }
    }
    for (let i = 0; i < tuftN; i++) { const px = rnd() * w, py = rnd() * h; if (!isDirt(px, py) && ok(px, py)) tufts.push({ x: px, y: py, flip: rnd() < 0.5 }); }
    for (let i = 0; i < 70; i++) patches.push({ x: rnd() * w, y: rnd() * h, r: 30 + rnd() * 90, dark: rnd() < 0.6 });
    // 野戰（不是城內、不是大地圖）：一條橫過戰場、兩軍踩出來的土路，和幾塊泥巴地（有的積水）
    const field = !paintExtra && !town;
    const track = field ? Array.from({ length: 41 }, (_, i) => { const x = (i / 40) * (w + 200) - 100; return [x, h * 0.52 + Math.sin(i * 0.35 + seed) * h * 0.08 + Math.sin(i * 0.9) * 14]; }) : [];
    const muds = [];
    if (field) for (let i = 0; i < 40 && muds.length < 11; i++) {
      const x = 120 + rnd() * (w - 240), y = 120 + rnd() * (h - 240), r = 40 + rnd() * 60;
      if (avoid.some(a => Math.hypot(a.x - x, a.y - y) < r + 60) || muds.some(m => Math.hypot(m.x - x, m.y - y) < m.r + r + 40)) continue;
      muds.push({ x, y, r, seed: rnd() * 10, pond: rnd() < 0.6 });
    }
    // 土路、泥巴地上不長草叢、不放零星的樹
    const onMud = (x, y) => muds.some(m => Math.hypot(x - m.x, (y - m.y) / 0.62) < m.r * 1.15) || track.some(([tx, ty]) => Math.abs(tx - x) < 32 && Math.abs(ty - y) < 30);
    if (field) { for (let i = tufts.length - 1; i >= 0; i--) if (onMud(tufts[i].x, tufts[i].y)) tufts.splice(i, 1); decos = decos.filter(d => d.n === 'rocks' || !onMud(d.x, d.y)); }
    // 泥巴地的邊上長一圈草叢，邊緣才不會像剪下來的一塊
    for (const m of muds) for (let a = 0; a < 14; a++) { if (rnd() < 0.35) continue; const t = a / 14 * Math.PI * 2 + rnd() * 0.3; tufts.push({ x: m.x + Math.cos(t) * m.r * 1.02, y: m.y + Math.sin(t) * m.r * 0.62 * 1.02 + 6, flip: rnd() < 0.5 }); }

    const paint = () => {
      // 草地：程式畫的平滑紋理（地磚的雜點太多）；泥地：用模糊過的遮罩疊上去，邊緣是自然的漸層
      g.fillStyle = g.createPattern(grassTex(), 'repeat'); g.fillRect(0, 0, cols * tile, rows * tile);
      const dirtV = []; for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) if (V[y][x] !== 'upper') dirtV.push([x * tile, y * tile]);
      if (dirtV.length) {
        // 柔邊圓（中心不透明、往外淡出）蓋在每個泥地頂點上，連起來就是邊緣柔和的泥地；不用 blur 濾鏡（大畫布用濾鏡會讓 WebGL 掛掉）
        const R = Math.round(tile * 0.95), stamp = document.createElement('canvas'); stamp.width = stamp.height = R * 2;
        const sg = stamp.getContext('2d'), rg = sg.createRadialGradient(R, R, 0, R, R, R);
        rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.55, 'rgba(255,255,255,0.95)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
        sg.fillStyle = rg; sg.fillRect(0, 0, R * 2, R * 2);
        const layer = document.createElement('canvas'); layer.width = cols * tile; layer.height = rows * tile;
        const lg = layer.getContext('2d');
        for (const [x, y] of dirtV) lg.drawImage(stamp, x - R, y - R);
        lg.globalCompositeOperation = 'source-in';
        lg.fillStyle = lg.createPattern(dirtTex(), 'repeat'); lg.fillRect(0, 0, layer.width, layer.height);
        g.drawImage(layer, 0, 0);
        layer.width = layer.height = 0;   // 馬上釋放大畫布的記憶體
      }
      // 石板路：程式畫的大塊石板（低對比，比地磚平滑），鋪滿 roads 的範圍
      if (roads.length) {
        g.fillStyle = g.createPattern(paving(), 'repeat');
        for (const r of roads) g.fillRect(Math.round(r.x / K()), Math.round(r.y / K()), Math.ceil(r.w / K()), Math.ceil(r.h / K()));
      }
      // 額外的地面畫法（大地圖的道路、湖泊、明暗）：拿到整格地磚的貼圖，座標是遊戲座標
      if (paintExtra) {
        const tileOf = kind => kind === 'lower' ? dirtTex() : kind === 'plateau' || kind === 'snow' ? texImg(kind) || grassTex() : grassTex();
        g.save(); g.scale(1 / K(), 1 / K()); paintExtra(g, tileOf); g.restore();
      }
      // 大片明暗斑，打散地磚的重複感（座標換成 canvas 像素）
      g.save(); g.scale(1 / K(), 1 / K());
      for (const p of patches) {
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        gr.addColorStop(0, p.dark ? 'rgba(20,35,10,0.12)' : 'rgba(255,240,180,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      // 土路：路面貼圖（大地圖同一張 tex_road），兩側一圈淡淡的陰影
      const roadIm = G.Assets.img('assets/world/tex_road.png'), dirtFill = g.createPattern(roadIm.complete && roadIm.naturalWidth ? roadIm : dirtTex(), 'repeat');
      if (track.length) {
        for (const [x, y] of track) { const gr = g.createRadialGradient(x, y, 10, x, y, 44); gr.addColorStop(0, 'rgba(40,32,20,0.18)'); gr.addColorStop(1, 'rgba(40,32,20,0)'); g.fillStyle = gr; g.fillRect(x - 44, y - 44, 88, 88); }
        g.fillStyle = dirtFill;
        for (let i = 0; i < track.length - 1; i++) for (let t = 0; t < 1; t += 0.2) {
          const x = track[i][0] + (track[i + 1][0] - track[i][0]) * t, y = track[i][1] + (track[i + 1][1] - track[i][1]) * t;
          g.beginPath(); g.arc(x, y, 20 + Math.sin(i * 1.3 + t * 3) * 3, 0, Math.PI * 2); g.fill();
        }
        g.strokeStyle = 'rgba(60,46,30,0.35)'; g.lineWidth = 2;   // 車轍：兩道淡淡的線
        for (const off of [-7, 7]) { g.beginPath(); track.forEach(([x, y], i) => i ? g.lineTo(x, y + off) : g.moveTo(x, y + off)); g.stroke(); }
      }
      // 泥巴地：不規則的一塊泥、中間顏色深（濕），有的中間積了一窪水
      for (const m of muds) {
        const shape = (k, dy = 0) => { g.beginPath(); for (let a = 0; a <= 40; a++) { const t = a / 40 * Math.PI * 2, wv = 1 + 0.14 * Math.sin(3 * t + m.seed) + 0.08 * Math.sin(5 * t + m.seed * 2);
          const px = m.x + Math.cos(t) * m.r * k * wv, py = m.y + dy + Math.sin(t) * m.r * 0.62 * k * wv; a ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); };
        g.globalAlpha = 0.55; shape(1.06); g.fillStyle = dirtFill; g.fill(); g.globalAlpha = 1;   // 外圈半透明，跟草地過渡（不畫深色外框）
        shape(0.94); g.fillStyle = dirtFill; g.fill();
        g.fillStyle = 'rgba(52,40,26,0.25)'; shape(0.66); g.fill(); shape(0.5); g.fill();   // 越往中間越濕、越深
        if (m.pond) {
          shape(0.5, 2); g.fillStyle = '#3a5560'; g.fill();
          shape(0.42, 2); g.fillStyle = '#2c4550'; g.fill();
          g.strokeStyle = 'rgba(200,220,215,0.22)'; g.lineWidth = 1.5;
          for (let j = 0; j < 3; j++) { const lx = m.x + (j - 1) * m.r * 0.18, ly = m.y - m.r * 0.08 + j * 4; g.beginPath(); g.moveTo(lx - 7, ly); g.lineTo(lx + 7, ly); g.stroke(); }
        }
      }
      // 樹林：深色的林地。高地：亮一點、偏乾黃的台地，南邊一道土坡、坡腳有碎石，北邊一道亮邊（緩坡，可以直接走上去）
      for (const z of zones) {
        if (z.kind === 'forest') {
          const gr = g.createRadialGradient(z.x, z.y, z.r * 0.2, z.x, z.y, z.r * 1.1);
          gr.addColorStop(0, 'rgba(10,30,14,0.45)'); gr.addColorStop(1, 'rgba(10,30,14,0)');
          g.save(); g.translate(z.x, z.y); g.scale(1, 0.62); g.translate(-z.x, -z.y);
          g.fillStyle = gr; g.fillRect(z.x - z.r * 1.2, z.y - z.r * 1.2, z.r * 2.4, z.r * 2.4); g.restore();
          continue;
        }
        // 小山丘（緩坡，可以直接走上去）：只用平滑的漸層，頂面亮一點、南邊坡面暗一點，看起來是慢慢隆起的（沒有邊線、沒有一圈圈的色階）
        const ry = z.r * 0.62;
        const blob = (cx, cy, r, stops) => {   // 壓扁成橢圓的放射漸層，沒有邊線
          g.save(); g.translate(cx, cy); g.scale(1, 0.62);
          const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); for (const [o, c] of stops) gr.addColorStop(o, c);
          g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2); g.restore();
        };
        blob(z.x, z.y + ry * 0.35, z.r * 1.25, [[0, 'rgba(16,26,10,0.16)'], [0.7, 'rgba(16,26,10,0.08)'], [1, 'rgba(16,26,10,0)']]);   // 南邊坡面的陰影
        blob(z.x, z.y - ry * 0.12, z.r * 1.05, [[0, 'rgba(225,220,160,0.26)'], [0.55, 'rgba(225,220,160,0.14)'], [1, 'rgba(225,220,160,0)']]);   // 頂面照到光
      }
      g.restore();
      const drawTufts = () => { for (const t of tufts) blit(g, art.grass, t.x / K(), t.y / K(), t.flip); groundVer++; };
      if (ready('grass')) drawTufts(); else art.grass.addEventListener('load', drawTufts);
      groundVer++;
    };
    if (img.complete) paint(); else img.addEventListener('load', paint, { once: true });
    ground = c;
  }

  /** 平滑的草地紋理（可以無縫重複）：一個底色，加上很淡的明暗點和零星的短草 */
  let grassC = null, dirtC = null;
  function noiseTex(base, dots, blades) {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    let s = 1777; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    for (const [color, n, size] of dots) { g.fillStyle = color; for (let i = 0; i < n; i++) g.fillRect(Math.floor(rnd() * S), Math.floor(rnd() * S), size, size); }
    if (blades) for (let i = 0; i < blades; i++) { const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S); g.fillStyle = rnd() < 0.5 ? 'rgba(20,40,14,0.22)' : 'rgba(170,200,110,0.16)'; g.fillRect(x, y, 1, 3); }
    return c;
  }
  // 地面貼圖：PixelLab 生的無縫圖（assets/world/tex_*.png，128px）；還沒載好就先用程式畫的雜訊
  const texImg = n => { const im = G.Assets.img(`assets/world/tex_${n}.png`); return im.complete && im.naturalWidth ? im : null; };
  const grassTex = () => texImg('grass') || grassC || (grassC = noiseTex('#5f8144', [['rgba(30,50,20,0.10)', 900, 2], ['rgba(140,170,90,0.07)', 700, 2], ['rgba(20,35,14,0.08)', 300, 3]], 120));
  const dirtTex = () => texImg('dirt') || dirtC || (dirtC = noiseTex('#6f5638', [['rgba(40,28,16,0.18)', 700, 2], ['rgba(170,140,100,0.14)', 500, 2], ['rgba(140,130,115,0.5)', 60, 2]], 0));

  /**
   * 石板花紋（可以無縫重複）：一列列交錯的長方形石板，寬度不一，顏色只差一點點；
   * 石縫是 1px 的深色線，每塊上緣一條很淡的亮線，偶爾一塊稍暗或有裂縫。
   */
  let pavingTex = null;
  function paving() {
    if (pavingTex) return pavingTex;
    const S = 192, RH = 16, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    let s = 4242; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    g.fillStyle = '#3e3d3a'; g.fillRect(0, 0, S, S);   // 石縫的顏色
    for (let row = 0; row < S / RH; row++) {
      let x = -Math.floor(rnd() * 30);
      const y = row * RH;
      while (x < S) {
        const w = 22 + Math.floor(rnd() * 22), v = Math.floor(rnd() * 9) - 4, dark = rnd() < 0.08 ? -7 : 0;
        const base = [92 + v + dark, 90 + v + dark, 85 + v + dark];
        // 超出右邊的部分畫回左邊，花紋才接得起來
        for (const ox of [0, -S]) {
          const x0 = x + ox + 1, ww = w - 1;
          g.fillStyle = `rgb(${base})`; g.fillRect(x0, y + 1, ww, RH - 1);
          g.fillStyle = 'rgba(255,250,235,0.07)'; g.fillRect(x0, y + 1, ww, 1);
          g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x0, y + RH - 2, ww, 1);
          if (rnd() < 0.06) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x0 + Math.floor(ww * 0.3), y + 4, 1, 4); g.fillRect(x0 + Math.floor(ww * 0.3) + 1, y + 8, 1, 3); }
        }
        x += w;
      }
    }
    // 細微的顆粒，讓石面不是死平的一塊
    for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)'; g.fillRect(Math.floor(rnd() * S), Math.floor(rnd() * S), 1, 1); }
    return pavingTex = c;
  }

  /** 以腳底中心為錨點畫一張圖（flip 左右翻轉，只用在左右對稱也沒關係的裝飾物） */
  function blit(ctx, im, x, y, flip) {
    if (!(im.complete && im.naturalWidth)) return;
    const dx = Math.round(x - im.width / 2), dy = Math.round(y - im.height);
    if (!flip) { ctx.drawImage(im, dx, dy); return; }
    ctx.save(); ctx.translate(dx + im.width, dy); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0); ctx.restore();
  }

  /**
   * 攻城圖的城堡設定。o.walls：可破壞的城牆段 [{ x, w }]；o.points：依序佔領的據點 [{ name, x, y }]
   * castle.capture 是目前要搶的據點（前面的都佔下了才輪到它），castle.rally 是攻方最後佔下的據點（重生點）
   */
  function setupCastle(o) {
    town = o && o.town ? G.TOWNS[o.town] : null;
    rocks = []; zones = [];
    G.Nav.reset();
    if (!o) { castle = null; return; }
    const gate = { kind: 'gate', x: o.gateX, w: 50, hp: o.gateHp, maxHp: o.gateHp, open: false, flash: 0 };
    const walls = (o.walls || []).map(s => ({ kind: 'wall', x: s.x, w: s.w, hp: G.SIEGE.wallHp, maxHp: G.SIEGE.wallHp, flash: 0 }));
    // 不能站的牆帶：牆腳（o.wallY + 17）往上到牆面頂端，牆後面的兵才不會腳被牆面蓋住、看起來像站在牆上
    const thick = 52;
    castle = {
      wallY: o.wallY + 17 - thick / 2, thick, gate, openings: [gate, ...walls],
      towers: o.towers,
      points: (o.points || []).map(p => ({ name: p.name, x: p.x, y: p.y, r: p.r || 60, progress: 0, taken: false })),
      defender: o.defender,
      get capture() { return this.points.find(p => !p.taken) || null; },
      get rally() { return this.points.filter(p => p.taken).pop() || null; },
    };
  }

  /** 入口能不能通過 */
  function passable(o) { return o.kind === 'gate' ? o.hp <= 0 || o.open : o.kind === 'wall' ? o.hp <= 0 : o.up; }
  const inBand = y => Math.abs(y - castle.wallY) <= castle.thick / 2;
  /** (x, y) 所在的可通行入口（不在牆裡就是 null） */
  function openingAt(x, y) { return castle && inBand(y) ? castle.openings.find(o => passable(o) && Math.abs(x - o.x) < o.w / 2) || null : null; }

  /** 建築腳下的範圍（以圖的腳底中心 (x, y) 為準，往上 fh、左右各 fw / 2） */
  const foot = (b, m = 0) => ({ x0: b.x - b.fw / 2 - m, x1: b.x + b.fw / 2 + m, y0: b.y - b.fh - m, y1: b.y + m });
  const inFoot = (f, x, y) => x > f.x0 && x < f.x1 && y > f.y0 && y < f.y1;
  /** ellipse：橢圓形的障礙（湖），fw × fh 是外接的長方形 */
  const ellipseV = (b, x, y) => ((x - b.x) / (b.fw / 2)) ** 2 + ((y - b.y + b.fh / 2) / (b.fh / 2)) ** 2;
  const inside = (b, x, y) => b.ellipse ? ellipseV(b, x, y) < 1 : inFoot(foot(b), x, y);
  function building(x, y) { return (town && town.buildings.find(b => b.fw && inside(b, x, y))) || rocks.find(b => inside(b, x, y)) || null; }
  /**
   * 尋路用的整張網格（G.Nav）：每格中心被擋住就是 1，結果跟一格一格問 blocked() 一樣。
   * 反過來做：每個障礙物只檢查自己外接方框裡的格子（大地圖 9 萬格 × 2300 個障礙物一格一格問要 3 秒，這樣幾十 ms）
   */
  function blockedGrid(cols, rows, C) {
    const g = new Uint8Array(cols * rows);
    const mark = b => {
      const x0 = Math.max(0, Math.floor((b.x - b.fw / 2) / C)), x1 = Math.min(cols - 1, Math.floor((b.x + b.fw / 2) / C));
      const y0 = Math.max(0, Math.floor((b.y - b.fh) / C)), y1 = Math.min(rows - 1, Math.floor(b.y / C));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * cols + x; if (!g[i] && inside(b, x * C + C / 2, y * C + C / 2)) g[i] = 1; }
    };
    if (town) for (const b of town.buildings) if (b.fw) mark(b);
    for (const b of rocks) mark(b);
    if (castle) for (let y = 0; y < rows; y++) {
      const cy = y * C + C / 2; if (!inBand(cy)) continue;
      for (let x = 0; x < cols; x++) if (!openingAt(x * C + C / 2, cy)) g[y * cols + x] = 1;
    }
    return g;
  }

  /* ---------- 戰場地形（js/battle/sim.js 開戰時呼叫，伺服器和瀏覽器結果一樣） ----------
   * rocks：擋路的石堆（橢圓障礙）；zones：樹林 forest（移動 ×0.75、遠程傷害 ×0.6）、高地 hill（遠程傷害 ×1.2）
   */
  let rocks = [], zones = [];
  function setupField(seed, avoid = [], terrain = []) {
    zones = terrain.map(z => ({ ...z }));
    rocks = [];
    const { w, h } = G.CONFIG.world;
    let s = seed * 9301 + 49297; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 60 && rocks.length < 12; i++) {
      const x = 120 + rnd() * (w - 240), y = 120 + rnd() * (h - 240);
      if (castle && y < castle.wallY + 120) continue;   // 城內和城牆附近不放
      if (avoid.some(a => Math.hypot(a.x - x, a.y - y) < 170) || zones.some(z => Math.hypot(z.x - x, (z.y - y) / 0.62) < z.r + 40) || rocks.some(r => Math.hypot(r.x - x, r.y - y) < 220)) continue;
      rocks.push({ x: Math.round(x), y: Math.round(y), fw: 30, fh: 14, ellipse: true, flip: rnd() < 0.5 });
    }
    G.Nav.reset();
  }
  /** 這個點在哪種地形上（沒有就是 null） */
  function terrainAt(x, y) { for (const z of zones) if (Math.hypot(z.x - x, (z.y - y) / 0.62) < z.r) return z.kind; return null; }
  const terrainSpeed = u => terrainAt(u.x, u.y) === 'forest' ? 0.75 : 1;

  /** 這個點是不是在牆裡或建築裡（不能站） */
  function blocked(x, y) { return (!!castle && inBand(y) && !openingAt(x, y)) || !!building(x, y); }
  function gatePassable() { return castle && passable(castle.gate); }
  function anyPassable() { return !!castle && castle.openings.some(passable); }
  /** 爬雲梯時移動變慢 */
  function climbMul(u) { const o = openingAt(u.x, u.y); return o && o.kind === 'ladder' ? G.SIEGE.ladder.climbMul : 1; }
  /** 雲梯搭好：在牆上加一個窄入口（之後一直都在） */
  function addLadder(x) { const o = { kind: 'ladder', x, w: G.SIEGE.ladder.width, up: true }; castle.openings.push(o); return o; }

  /** 把單位推出牆外、建築外，並回傳是否有被擋住 */
  function resolve(u) {
    const b = building(u.x, u.y);
    if (b && b.ellipse) {   // 湖：沿著從中心出去的方向推到岸上
      const cy = b.y - b.fh / 2, k = 1 / Math.sqrt(Math.max(1e-6, ellipseV(b, u.x, u.y))) + 0.01;
      if (u.x === b.x && u.y === cy) u.y += 1;
      u.x = b.x + (u.x - b.x) * k; u.y = cy + (u.y - cy) * k;
      return true;
    } else if (b) {   // 建築：往最近的邊推出去
      const f = foot(b), d = [u.x - f.x0, f.x1 - u.x, u.y - f.y0, f.y1 - u.y], m = Math.min(...d);
      if (m === d[0]) u.x = f.x0 - 0.5; else if (m === d[1]) u.x = f.x1 + 0.5; else if (m === d[2]) u.y = f.y0 - 0.5; else u.y = f.y1 + 0.5;
      return true;
    }
    if (!castle) return false;
    const c = castle;
    if (!inBand(u.y)) { u.wallSide = u.y < c.wallY ? -1 : 1; return false; }   // 記住在牆的哪一側
    if (openingAt(u.x, u.y)) return false;
    // 推回原本那一側（被人擠進牆裡時不會被推穿到另一邊）；還沒有紀錄（例如一出生就在牆裡）就推回兵團那一側
    const top = c.wallY - c.thick / 2 - 0.5, bot = c.wallY + c.thick / 2 + 0.5;
    const side = u.wallSide || (u.squad ? (u.squad.home.y < c.wallY ? -1 : 1) : u.y - top < bot - u.y ? -1 : 1);
    u.y = side < 0 ? top : bot;
    return true;
  }

  /**
   * 陣型裡某個兵的站位 (x, y)：落在牆裡、或跟陣型中心 (ax, ay) 不在牆的同一側時，夾回中心那一側的牆邊。
   * 不然靠牆列陣時，後排的兵會被排到牆裡或牆外，一直貼著牆站。
   */
  function sameSide(x, y, ax, ay) {
    if (!castle || openingAt(x, y) || openingAt(ax, ay)) return { x, y };
    const c = castle, s = ay < c.wallY ? -1 : 1;
    if (!inBand(y) && (y < c.wallY ? -1 : 1) === s) return { x, y };
    return { x, y: s < 0 ? c.wallY - c.thick / 2 - 3 : c.wallY + c.thick / 2 + 3 };
  }

  /** 直線走過去會撞到建築時，改走建築（往外多留 m）最划算的那個角 */
  function aroundBuildings(u, tx, ty) {
    if (!town) return null;
    const m = (u.radius || 6) + 6;
    for (const b of town.buildings) {
      if (!b.fw) continue;
      const f = foot(b, m);
      if (inFoot(f, u.x, u.y) || !segHits(f, u.x, u.y, tx, ty)) continue;
      let best = null, bc = Infinity;
      for (const [cx, cy] of [[f.x0 - 2, f.y0 - 2], [f.x1 + 2, f.y0 - 2], [f.x0 - 2, f.y1 + 2], [f.x1 + 2, f.y1 + 2]]) {
        if (segHits(foot(b, m - 1), u.x, u.y, cx, cy)) continue;   // 這個角被建築自己擋住，看不到
        const cost = Math.hypot(cx - u.x, cy - u.y) + Math.hypot(tx - cx, ty - cy);
        if (cost < bc) { bc = cost; best = { x: cx, y: cy }; }
      }
      if (best) return best;
    }
    return null;
  }
  /** 線段 (x0,y0)→(x1,y1) 有沒有穿過矩形 f（Liang–Barsky） */
  function segHits(f, x0, y0, x1, y1) {
    let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
    for (const [p, q] of [[-dx, x0 - f.x0], [dx, f.x1 - x0], [-dy, y0 - f.y0], [dy, f.y1 - y0]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return true;
  }

  /**
   * 回傳實際要走去的點。空地直接直線走；有城牆或建築時，遠的目標和要穿牆的目標走流場（G.Nav），
   * 近的目標直線走、擋路的建築從角繞過去；流場走不到（牆上沒有入口）時先到城門前等。
   */
  function route(u, tx, ty) {
    if (!castle && !town) return { x: tx, y: ty };
    const across = castle && !openingAt(u.x, u.y) && (u.y < castle.wallY) !== (ty < castle.wallY);
    if (across || Math.hypot(tx - u.x, ty - u.y) > 80) { const s = G.Nav.step(u.x, u.y, tx, ty); if (s) return s; }
    const r = wallRoute(u, tx, ty);
    return aroundBuildings(u, r.x, r.y) || r;
  }
  function wallRoute(u, tx, ty) {
    if (!castle) return { x: tx, y: ty };
    const c = castle, side = y => (y < c.wallY ? -1 : 1);
    // 已經在入口裡：直直穿過去
    const here = openingAt(u.x, u.y);
    if (here) return { x: G.U.clamp(u.x, here.x - here.w / 2 + 3, here.x + here.w / 2 - 3), y: ty };
    if (side(u.y) === side(ty)) return { x: tx, y: ty };
    let best = null, bc = Infinity;
    for (const o of c.openings) if (passable(o)) {
      const cost = Math.abs(u.x - o.x) + Math.abs(tx - o.x) + (o.kind === 'ladder' ? 120 : 0);
      if (cost < bc) { bc = cost; best = o; }
    }
    if (!best) return { x: c.gate.x + G.U.clamp(tx - c.gate.x, -20, 20), y: c.wallY + side(u.y) * (c.thick / 2 + 10) };
    const m = Math.min(8, best.w / 4), lo = best.x - best.w / 2 + m, hi = best.x + best.w / 2 - m;
    if (u.x < lo || u.x > hi) return { x: G.U.clamp(u.x, lo, hi), y: c.wallY + side(u.y) * (c.thick / 2 + 4) };
    return { x: u.x, y: ty };
  }

  let groundScale = 1;
  function drawGround() { G.Render.ground(ground, groundVer, groundScale); }

  /** 據點：目前要搶的那個有流動的虛線圈和佔領進度；每個據點都有旗子（畫在地面上、單位底下） */
  function drawCapture(t) {
    if (!castle) return;
    const g = G.Render.under, att = 1 - castle.defender;
    for (const p of castle.points) {   // 旗桿：藍色我方、紅色敵方
      const mine = (p.taken ? att : castle.defender) === 0;
      g.rect(p.x - 1, p.y - 46, 2, 46).fill(0x5a4630);
      g.poly([p.x + 1, p.y - 46, p.x + 22, p.y - 40, p.x + 1, p.y - 33]).fill(mine ? 0x2f5fb0 : 0xc0392b);
    }
    const cp = castle.capture; if (!cp) return;
    const rx = cp.r, ry = cp.r * 0.6;
    const at = a => [cp.x + Math.cos(a) * rx, cp.y + Math.sin(a) * ry];
    // 虛線：每 10px 畫 6px，隨時間往前流動
    const n = Math.round(2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2) / 10), off = (t * 2) % 1;
    for (let i = 0; i < n; i++) {
      const p = at((i + off) / n * Math.PI * 2), q = at((i + off + 0.6) / n * Math.PI * 2);
      g.moveTo(p[0], p[1]).lineTo(q[0], q[1]);
    }
    g.stroke({ width: 2, color: 0xffd778, alpha: 0.85 });
    if (cp.progress > 0) {
      const a0 = -Math.PI / 2, steps = Math.max(2, Math.ceil(48 * cp.progress));
      for (let i = 0; i <= steps; i++) { const p = at(a0 + Math.PI * 2 * cp.progress * i / steps); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
      g.stroke({ width: 4, color: att === 0 ? 0x4a8ae6 : 0xe6463c, alpha: 0.9 });
    }
  }

  /** 建築的圖：b.src 有給就用它（大地圖），否則是 assets/map/town/<art>.png */
  function artFor(b) { const src = b.src || `assets/map/town/${b.art}.png`; return load(src, src); }
  /** 大地圖：只有地形（G.TOWNS[key] 的 buildings 當障礙物），沒有城牆 */
  function setupTerrain(key) { castle = null; town = key ? G.TOWNS[key] : null; rocks = []; zones = []; G.Nav.reset(); }

  /** 以腳底中心為錨點放一張美術圖到依 y 排序層 */
  function put(im, x, y, flip, tint) {
    if (im.complete && im.naturalWidth) G.Render.art(im, x, y, 1, flip, tint);
  }

  /** 樹石、城牆要跟單位一起依 y 排序，回傳可繪製物件（draw 收到的 ctx 是上層 canvas） */
  function wallDrawables(view) {
    const out = [];
    for (const d of decos) {
      if (view && (d.x < view.x - 100 || d.x > view.x + view.w + 100 || d.y < view.y - 20 || d.y > view.y + view.h + 140)) continue;
      out.push({ y: d.y, draw: () => {
        const r = d.n === 'oak' ? 22 : d.n === 'pine' ? 14 : 12;
        G.Render.shadow(d.x, d.y - 2, r, r * 0.35, 0.22);
        put(art[d.n], d.x, d.y, d.flip);
      } });
    }
    // 城內建築（大地圖是城池、山、森林）：排序用腳底的 y
    if (town) for (const b of town.buildings) {
      if (b.hidden) continue;   // 只擋路、不畫圖（湖泊）
      const im = artFor(b);
      if (view && (b.x < view.x - 200 || b.x > view.x + view.w + 200 || b.y < view.y - 20 || b.y > view.y + view.h + 260)) continue;
      out.push({ y: b.flat ? b.y - 1e6 : b.y, draw: () => put(im, b.x, b.y, b.flip, b.tint) });   // 建築圖自己有底部陰影，不再加橢圓影子；flat（田、水田）貼在地上，永遠畫在最底下
    }
    if (!castle) return out;
    const c = castle, bot = c.wallY + c.thick / 2;
    out.push({ y: bot, draw: ctx => { if (ready('wall') && ready('gatehouse') && ready('tower')) drawWallArt(ctx, bot); } });
    return out;
  }

  /**
   * 城門門洞的各種狀態，畫成小貼圖快取起來（貼圖比門洞左右各寬 8px，放得下散落的碎木板）。
   * key：open 開門、broken 破門、crack<n> 有 n 道裂痕、flash 受擊閃白
   */
  function doorCanvas(key) {
    const D = { w: Math.round(DOOR.w * K()), h: Math.round(DOOR.h * K()) };
    const M = 8, w = D.w + M * 2, h = D.h + 4;
    return G.Render.canvasTex('door:' + key, w, h, ctx => {
      const dx = M, dy = 0, DOOR = D;
      if (key === 'open' || key === 'broken') {
        ctx.fillStyle = '#1a140f'; ctx.fillRect(dx, dy, DOOR.w, DOOR.h);
        if (key === 'broken') {   // 碎木板散在門口
          ctx.fillStyle = '#6b4a2c';
          for (let i = 0; i < 7; i++) ctx.fillRect(dx + 3 + i * 7, dy + DOOR.h - 6 + (i % 3) * 3, 9, 3);
          ctx.fillStyle = '#4a3220'; ctx.fillRect(dx - 6, dy + DOOR.h - 2, 14, 4); ctx.fillRect(dx + DOOR.w - 8, dy + DOOR.h - 3, 16, 4);
        } else {                  // 兩扇門板往內收
          ctx.fillStyle = '#5b3a22'; ctx.fillRect(dx, dy + 4, 6, DOOR.h - 4); ctx.fillRect(dx + DOOR.w - 6, dy + 4, 6, DOOR.h - 4);
        }
      } else if (key === 'flash') {
        ctx.fillStyle = '#fff'; ctx.fillRect(dx, dy, DOOR.w, DOOR.h);
      } else {
        const n = +key.slice(5);
        ctx.strokeStyle = 'rgba(25,12,5,0.9)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < n; i++) {
          const sx = dx + 6 + (i * 13) % (DOOR.w - 12), sy = dy + 10 + (i * 11) % (DOOR.h - 20);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 6, sy + 8); ctx.lineTo(sx + 2, sy + 15); ctx.stroke();
        }
        // 分段破損：3 以上木板裂開、5 以上破洞、7 以上大洞＋一塊門板歪掉
        ctx.fillStyle = '#e8c690';
        if (n >= 3) for (let i = 0; i < 4; i++) ctx.fillRect(dx + 8 + i * 11, dy + 18 + (i % 2) * 14, 3, 2);
        ctx.fillStyle = '#1a140f';
        if (n >= 5) { ctx.fillRect(dx + 14, dy + 20, 9, 7); ctx.fillRect(dx + 32, dy + 34, 7, 6); }
        if (n >= 7) {
          ctx.fillRect(dx + 18, dy + 12, 16, 22);
          ctx.save(); ctx.translate(dx + DOOR.w - 14, dy + 8); ctx.rotate(0.25);
          ctx.fillStyle = '#6b4a2c'; ctx.fillRect(0, 0, 8, 24); ctx.restore();
        }
      }
    });
  }

  /** 可破壞城牆段：顏色較深、有補過的石塊和裂縫（stage 0～4 越來越破），讓玩家看得出這段打得動 */
  function weakCanvas(w, h, stage) {
    return G.Render.canvasTex(`weak:${w}:${stage}`, w, h, ctx => {
      ctx.fillStyle = 'rgba(30,22,16,0.28)'; ctx.fillRect(0, 6, w, h - 8);
      ctx.fillStyle = 'rgba(70,60,50,0.55)';
      for (let i = 0; i < w / 9; i++) ctx.fillRect((i * 17) % (w - 8), 10 + (i * 13) % (h - 20), 8, 5);
      ctx.strokeStyle = 'rgba(15,10,6,0.9)'; ctx.lineWidth = 1;
      for (let i = 0; i < 2 + stage * 3; i++) {
        const sx = 4 + (i * 23) % (w - 8), sy = 8 + (i * 7) % (h - 24);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 4, sy + 7); ctx.lineTo(sx - 1, sy + 13); ctx.lineTo(sx + 3, sy + 18); ctx.stroke();
      }
      ctx.fillStyle = '#1d1712';   // 崩掉的石塊
      for (let i = 0; i < (stage - 1) * 2; i++) ctx.fillRect(6 + (i * 19) % (w - 14), 12 + (i * 11) % (h - 26), 7, 6);
    });
  }
  /** 打掉的城牆段：缺口裡的瓦礫堆 */
  function rubbleCanvas(w) {
    return G.Render.canvasTex(`rubble:${w}`, w + 12, 26, ctx => {
      let s = w * 7 + 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < w / 2; i++) {
        const x = r() * (w + 4), y = 4 + r() * 18, sz = 3 + r() * 6;
        ctx.fillStyle = ['#7d746a', '#5f574e', '#948a7d', '#4a433c'][i % 4]; ctx.fillRect(Math.round(x), Math.round(y), Math.round(sz), Math.round(sz * 0.7));
      }
    });
  }

  /** 用 PixelLab 素材畫城牆：牆片段橫向重複（打掉的段落空出來放瓦礫）、中間城門樓、兩端塔樓；血條畫在上層 canvas */
  function drawWallArt(ctx, bot) {
    const c = castle, g = c.gate, W = G.CONFIG.world.w, wall = art.wall, gh = art.gatehouse, tw = art.tower, R = G.Render, k = K();
    const ww = wall.width * k, wh = Math.round(wall.height * k), wy = bot + 4 - wh, segs = c.openings.filter(o => o.kind === 'wall');
    for (let x = 0; x < W; x += ww) {
      const cx = x + ww / 2;
      if (!segs.some(o => o.hp <= 0 && Math.abs(cx - o.x) < o.w / 2)) R.image(wall, x, wy, 1, false, k);
    }
    for (const o of segs) {
      const x0 = Math.round(o.x - o.w / 2);
      if (o.hp <= 0) { R.image(rubbleCanvas(o.w), x0 - 6, bot - 22); continue; }
      R.image(weakCanvas(o.w, wh, Math.min(4, Math.floor((1 - o.hp / o.maxHp) * 5))), x0, wy);
      if (o.flash > 0) R.image(G.Render.canvasTex(`flash:${o.w}:${wh}`, o.w, wh, f => { f.fillStyle = '#fff'; f.fillRect(0, 6, o.w, wh - 8); }), x0, wy, Math.min(1, o.flash * 3));
      if (o.hp < o.maxHp) {
        ctx.fillStyle = '#000'; ctx.fillRect(o.x - 24, wy - 6, 48, 4);
        ctx.fillStyle = '#c9b48a'; ctx.fillRect(o.x - 24, wy - 6, 48 * o.hp / o.maxHp, 4);
      }
    }
    const gx = g.x - gh.width * k / 2, gy = bot + 10 - gh.height * k;
    R.image(gh, gx, gy, 1, false, k);
    const dx = Math.round(gx + DOOR.x * k - 8), dy = Math.round(gy + DOOR.y * k), cracks = Math.floor((1 - g.hp / g.maxHp) * 8);
    if (g.hp <= 0) R.image(doorCanvas('broken'), dx, dy);
    else if (g.open) R.image(doorCanvas('open'), dx, dy);
    else {
      if (cracks) R.image(doorCanvas('crack' + cracks), dx, dy);
      if (g.flash > 0) R.image(doorCanvas('flash'), dx, dy, Math.min(1, g.flash * 3));
    }
    for (const tx of c.towers) R.art(tw, tx, bot + 8);
    if (g.hp > 0 && g.hp < g.maxHp) {
      ctx.fillStyle = '#000'; ctx.fillRect(g.x - 24, gy - 8, 48, 4);
      ctx.fillStyle = '#e0b040'; ctx.fillRect(g.x - 24, gy - 8, 48 * g.hp / g.maxHp, 4);
    }
  }

  return {
    buildGround, prebuildGround, setupCastle, setupTerrain, setupField, terrainAt, terrainSpeed, get zones() { return zones; }, artFor, blocked, blockedGrid, building, resolve, route, sameSide, gatePassable, anyPassable, passable, openingAt, climbMul, addLadder,
    get castle() { return castle; },
    get town() { return town; },

    drawGround, drawCapture, wallDrawables,
  };
})();
