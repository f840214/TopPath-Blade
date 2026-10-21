/* ============ map.js — 地面、城牆、城門、主堡據點 ============
 * 地面用 Wang 轉角地磚（G.TILES，tools/import_tiles.py 產生）。
 * 攻城圖：城牆是一條橫跨地圖的牆（y = wallY），中間一個城門；
 *   城門關著或還沒被打破時不能通過；守方可以開關城門（出城）。
 * 城牆、城門樓、塔樓、樹木石頭是 PixelLab 生成的素材（assets/map/），透過 G.Render 跟單位一起依 y 排序繪製。
 * 裝飾物（樹、石頭、草叢）依種子隨機擺放，避開出生點、城牆和城門通道；小草直接畫進地面。
 */
G.Map = (() => {
  let ground = null, groundVer = 0, castle = null, decos = [];   // groundVer：地面 canvas 每重畫一次 +1，G.Render 據此重新上傳
  const art = {};
  for (const n of ['oak', 'pine', 'rocks', 'bush', 'grass', 'wall', 'gatehouse', 'tower']) { art[n] = new Image(); art[n].src = `assets/map/${n}.png`; }
  const ready = n => art[n].complete && art[n].naturalWidth > 0;
  // 城門樓圖上木門的位置（tools 量出來的）
  const DOOR = { x: 41, y: 59, w: 51, h: 55 };

  function buildGround(seed, dirtRects = [], avoid = []) {
    const { w, h, tile } = G.CONFIG.world, cols = Math.ceil(w / tile), rows = Math.ceil(h / tile);
    let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const blobs = Array.from({ length: 9 }, () => ({ x: rnd() * cols, y: rnd() * rows, r: 2 + rnd() * 5 }));
    const V = [];
    for (let y = 0; y <= rows; y++) {
      V.push([]);
      for (let x = 0; x <= cols; x++) {
        const px = x * tile, py = y * tile;
        const dirt = blobs.some(b => Math.hypot(x - b.x, y - b.y) < b.r) ||
          dirtRects.some(r => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
        V[y].push(dirt ? 'lower' : 'upper');
      }
    }
    const c = document.createElement('canvas'); c.width = cols * tile; c.height = rows * tile;
    const g = c.getContext('2d');
    const img = new Image(); img.src = 'assets/tiles/ground.png';
    // 裝飾物位置（先決定好，地面畫完再把小草疊上去）
    const isDirt = (px, py) => V[Math.min(rows, Math.round(py / tile))][Math.min(cols, Math.round(px / tile))] === 'lower';
    const clear = (px, py, r) => avoid.every(a => Math.hypot(px - a.x, py - a.y) > r) &&
      !(castle && Math.abs(py - castle.wallY) < 90) && !(castle && Math.abs(px - castle.gate.x) < 120);
    decos = []; const tufts = [], patches = [];
    for (let i = 0; i < 260; i++) {
      const px = rnd() * w, py = rnd() * h, edge = Math.min(px, py, w - px, h - py);
      const kind = rnd();
      if (kind < 0.35 && (edge < 260 || rnd() < 0.15)) { if (clear(px, py, 170) && !isDirt(px, py)) decos.push({ n: rnd() < 0.55 ? 'oak' : 'pine', x: px, y: py, flip: rnd() < 0.5 }); }
      else if (kind < 0.5) { if (clear(px, py, 110)) decos.push({ n: 'rocks', x: px, y: py, flip: rnd() < 0.5 }); }
      else if (kind < 0.7) { if (clear(px, py, 110) && !isDirt(px, py)) decos.push({ n: 'bush', x: px, y: py, flip: rnd() < 0.5 }); }
    }
    for (let i = 0; i < 420; i++) { const px = rnd() * w, py = rnd() * h; if (!isDirt(px, py)) tufts.push({ x: px, y: py, flip: rnd() < 0.5 }); }
    for (let i = 0; i < 70; i++) patches.push({ x: rnd() * w, y: rnd() * h, r: 30 + rnd() * 90, dark: rnd() < 0.6 });

    const paint = () => {
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const want = [V[y][x], V[y][x + 1], V[y + 1][x], V[y + 1][x + 1]];
        const t = G.TILES.find(t => t.c.every((v, i) => v === want[i]));
        if (t) g.drawImage(img, t.b[0], t.b[1], t.b[2], t.b[3], x * tile, y * tile, tile, tile);
      }
      // 大片明暗斑，打散地磚的重複感
      for (const p of patches) {
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        gr.addColorStop(0, p.dark ? 'rgba(20,35,10,0.18)' : 'rgba(255,240,180,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      const drawTufts = () => { for (const t of tufts) blit(g, art.grass, t.x, t.y, t.flip); groundVer++; };
      if (ready('grass')) drawTufts(); else art.grass.addEventListener('load', drawTufts);
      groundVer++;
    };
    if (img.complete) paint(); else img.onload = paint;
    ground = c;
  }

  /** 以腳底中心為錨點畫一張圖（flip 左右翻轉，只用在左右對稱也沒關係的裝飾物） */
  function blit(ctx, im, x, y, flip) {
    if (!(im.complete && im.naturalWidth)) return;
    const dx = Math.round(x - im.width / 2), dy = Math.round(y - im.height);
    if (!flip) { ctx.drawImage(im, dx, dy); return; }
    ctx.save(); ctx.translate(dx + im.width, dy); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0); ctx.restore();
  }

  /** 攻城圖的城堡設定 */
  function setupCastle(o) {
    castle = o ? {
      wallY: o.wallY, thick: 34,
      gate: { x: o.gateX, w: 50, hp: o.gateHp, maxHp: o.gateHp, open: false, flash: 0 },
      towers: o.towers,
      capture: { x: o.captureX, y: o.captureY, r: 60, progress: 0 },
      defender: o.defender,
    } : null;
  }

  /** 這個點是不是在牆裡（不能站） */
  function blocked(x, y) {
    if (!castle) return false;
    const c = castle;
    if (y < c.wallY - c.thick / 2 || y > c.wallY + c.thick / 2) return false;
    if (Math.abs(x - c.gate.x) < c.gate.w / 2) return !gatePassable();
    return true;
  }
  function gatePassable() { return castle && (castle.gate.hp <= 0 || castle.gate.open); }

  /** 把單位推出牆外，並回傳是否有被擋住 */
  function resolve(u) {
    if (!castle || !blocked(u.x, u.y)) return false;
    const c = castle;
    // 從牆的上下兩側選比較近的一邊推出去
    const top = c.wallY - c.thick / 2 - 0.5, bot = c.wallY + c.thick / 2 + 0.5;
    u.y = (u.y - top < bot - u.y) ? top : bot;
    return true;
  }

  /** 跨牆移動時先繞到城門：回傳實際要走去的點 */
  function route(u, tx, ty) {
    if (!castle) return { x: tx, y: ty };
    const c = castle, side = y => (y < c.wallY ? -1 : 1);
    if (side(u.y) === side(ty)) return { x: tx, y: ty };
    if (!gatePassable()) return { x: c.gate.x + G.U.clamp(tx - c.gate.x, -20, 20), y: c.wallY + side(u.y) * (c.thick / 2 + 10) };
    if (Math.abs(u.x - c.gate.x) > c.gate.w / 2 - 8 && Math.abs(u.y - c.wallY) > c.thick / 2)
      return { x: c.gate.x, y: c.wallY + side(u.y) * (c.thick / 2 + 4) };
    return { x: c.gate.x, y: ty };
  }

  function drawGround() { G.Render.ground(ground, groundVer); }

  /** 主堡據點：流動的虛線圈、佔領進度、旗子（畫在地面上、單位底下） */
  function drawCapture(t) {
    if (!castle) return;
    const cp = castle.capture, g = G.Render.under, rx = cp.r, ry = cp.r * 0.6;
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
      g.stroke({ width: 4, color: 0xe6463c, alpha: 0.9 });
    }
    // 旗桿
    g.rect(cp.x - 1, cp.y - 46, 2, 46).fill(0x5a4630);
    g.poly([cp.x + 1, cp.y - 46, cp.x + 22, cp.y - 40, cp.x + 1, cp.y - 33]).fill(cp.progress >= 1 ? 0xc0392b : 0x2f5fb0);
  }

  /** 以腳底中心為錨點放一張圖到依 y 排序層 */
  function put(im, x, y, flip) {
    if (!(im.complete && im.naturalWidth)) return;
    G.Render.image(im, Math.round(x - im.width / 2), Math.round(y - im.height), 1, flip);
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
    const M = 8, w = DOOR.w + M * 2, h = DOOR.h + 4;
    return G.Render.canvasTex('door:' + key, w, h, ctx => {
      const dx = M, dy = 0;
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
        ctx.strokeStyle = 'rgba(25,12,5,0.9)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < +key.slice(5); i++) {
          const sx = dx + 6 + (i * 13) % (DOOR.w - 12), sy = dy + 10 + (i * 11) % (DOOR.h - 20);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 6, sy + 8); ctx.lineTo(sx + 2, sy + 15); ctx.stroke();
        }
      }
    });
  }

  /** 用 PixelLab 素材畫城牆：牆片段橫向重複、中間城門樓、兩端塔樓；城門血條畫在上層 canvas */
  function drawWallArt(ctx, bot) {
    const c = castle, g = c.gate, W = G.CONFIG.world.w, wall = art.wall, gh = art.gatehouse, tw = art.tower, R = G.Render;
    const wy = bot + 4 - wall.height;
    for (let x = 0; x < W; x += wall.width) R.image(wall, x, wy);
    const gx = Math.round(g.x - gh.width / 2), gy = Math.round(bot + 10 - gh.height);
    R.image(gh, gx, gy);
    const dx = gx + DOOR.x - 8, dy = gy + DOOR.y, cracks = Math.floor((1 - g.hp / g.maxHp) * 8);
    if (g.hp <= 0) R.image(doorCanvas('broken'), dx, dy);
    else if (g.open) R.image(doorCanvas('open'), dx, dy);
    else {
      if (cracks) R.image(doorCanvas('crack' + cracks), dx, dy);
      if (g.flash > 0) R.image(doorCanvas('flash'), dx, dy, Math.min(1, g.flash * 3));
    }
    for (const tx of c.towers) R.image(tw, Math.round(tx - tw.width / 2), Math.round(bot + 8 - tw.height));
    if (g.hp > 0 && g.hp < g.maxHp) {
      ctx.fillStyle = '#000'; ctx.fillRect(g.x - 24, gy - 8, 48, 4);
      ctx.fillStyle = '#e0b040'; ctx.fillRect(g.x - 24, gy - 8, 48 * g.hp / g.maxHp, 4);
    }
  }

  return {
    buildGround, setupCastle, blocked, resolve, route, gatePassable,
    get castle() { return castle; },
    drawGround, drawCapture, wallDrawables,
  };
})();
