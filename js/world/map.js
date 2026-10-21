/* ============ map.js — 地面、城牆、城門、主堡據點 ============
 * 地面用 Wang 轉角地磚（G.TILES，tools/import_tiles.py 產生）。
 * 攻城圖：城牆是一條橫跨地圖的牆（y = wallY），中間一個城門；
 *   城門關著或還沒被打破時不能通過；守方可以開關城門（出城）。
 * 城牆、城門樓、塔樓、樹木石頭是 PixelLab 生成的素材（assets/map/），圖還沒載入時退回程式繪製。
 * 裝飾物（樹、石頭、草叢）依種子隨機擺放，避開出生點、城牆和城門通道；小草直接畫進地面。
 */
G.Map = (() => {
  let ground = null, castle = null, decos = [];
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
      const drawTufts = () => { for (const t of tufts) blit(g, art.grass, t.x, t.y, t.flip); };
      if (ready('grass')) drawTufts(); else art.grass.addEventListener('load', drawTufts);
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

  function drawGround(ctx) { if (ground) ctx.drawImage(ground, 0, 0); }

  function drawCapture(ctx, t) {
    if (!castle) return;
    const cp = castle.capture;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,215,120,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.ellipse(cp.x, cp.y, cp.r, cp.r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    if (cp.progress > 0) {
      ctx.setLineDash([]); ctx.strokeStyle = 'rgba(230,70,60,0.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(cp.x, cp.y, cp.r, cp.r * 0.6, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cp.progress); ctx.stroke();
    }
    ctx.restore();
    // 旗桿
    ctx.fillStyle = '#5a4630'; ctx.fillRect(cp.x - 1, cp.y - 46, 2, 46);
    ctx.fillStyle = cp.progress >= 1 ? '#c0392b' : '#2f5fb0';
    ctx.beginPath(); ctx.moveTo(cp.x + 1, cp.y - 46); ctx.lineTo(cp.x + 22, cp.y - 40); ctx.lineTo(cp.x + 1, cp.y - 33); ctx.fill();
  }

  /** 城牆要跟單位一起依 y 排序，回傳可繪製物件 */
  function wallDrawables(view) {
    const out = [];
    for (const d of decos) {
      if (view && (d.x < view.x - 100 || d.x > view.x + view.w + 100 || d.y < view.y - 20 || d.y > view.y + view.h + 140)) continue;
      out.push({ y: d.y, draw: ctx => {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        const r = d.n === 'oak' ? 22 : d.n === 'pine' ? 14 : 12;
        ctx.beginPath(); ctx.ellipse(d.x, d.y - 2, r, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        blit(ctx, art[d.n], d.x, d.y, d.flip);
      } });
    }
    if (!castle) return out;
    const c = castle, top = c.wallY - c.thick / 2, bot = c.wallY + c.thick / 2;
    out.push({ y: bot, draw: ctx => (ready('wall') && ready('gatehouse') && ready('tower') ? drawWallArt : drawWall)(ctx, top, bot) });
    return out;
  }

  /** 用 PixelLab 素材畫城牆：牆片段橫向重複、中間城門樓、兩端塔樓 */
  function drawWallArt(ctx, top, bot) {
    const c = castle, g = c.gate, W = G.CONFIG.world.w, wall = art.wall, gh = art.gatehouse, tw = art.tower;
    const wy = bot + 4 - wall.height;
    for (let x = 0; x < W; x += wall.width) ctx.drawImage(wall, x, wy);
    const gx = Math.round(g.x - gh.width / 2), gy = Math.round(bot + 10 - gh.height);
    ctx.drawImage(gh, gx, gy);
    const dx = gx + DOOR.x, dy = gy + DOOR.y;
    if (g.hp <= 0 || g.open) {
      ctx.fillStyle = '#1a140f'; ctx.fillRect(dx, dy, DOOR.w, DOOR.h);
      if (g.hp <= 0) {   // 破門：碎木板散在門口
        ctx.fillStyle = '#6b4a2c';
        for (let i = 0; i < 7; i++) ctx.fillRect(dx + 3 + i * 7, dy + DOOR.h - 6 + (i % 3) * 3, 9, 3);
        ctx.fillStyle = '#4a3220'; ctx.fillRect(dx - 6, dy + DOOR.h - 2, 14, 4); ctx.fillRect(dx + DOOR.w - 8, dy + DOOR.h - 3, 16, 4);
      } else {           // 開門：兩扇門板往內收
        ctx.fillStyle = '#5b3a22'; ctx.fillRect(dx, dy + 4, 6, DOOR.h - 4); ctx.fillRect(dx + DOOR.w - 6, dy + 4, 6, DOOR.h - 4);
      }
    } else {
      const dmg = 1 - g.hp / g.maxHp;
      ctx.strokeStyle = 'rgba(25,12,5,0.9)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < Math.floor(dmg * 8); i++) {
        const sx = dx + 6 + (i * 13) % (DOOR.w - 12), sy = dy + 10 + (i * 11) % (DOOR.h - 20);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 6, sy + 8); ctx.lineTo(sx + 2, sy + 15); ctx.stroke();
      }
      if (g.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${g.flash * 3})`; ctx.fillRect(dx, dy, DOOR.w, DOOR.h); }
    }
    for (const tx of c.towers) ctx.drawImage(tw, Math.round(tx - tw.width / 2), Math.round(bot + 8 - tw.height));
    if (g.hp > 0 && g.hp < g.maxHp) {
      ctx.fillStyle = '#000'; ctx.fillRect(g.x - 24, gy - 8, 48, 4);
      ctx.fillStyle = '#e0b040'; ctx.fillRect(g.x - 24, gy - 8, 48 * g.hp / g.maxHp, 4);
    }
  }

  function stoneBlock(ctx, x, y, w, h, base) {
    ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
    for (let yy = y + 6; yy < y + h; yy += 6) {
      ctx.beginPath(); ctx.moveTo(x, yy + 0.5); ctx.lineTo(x + w, yy + 0.5); ctx.stroke();
      const off = ((yy / 6) % 2) * 6;
      for (let xx = x + off; xx < x + w; xx += 12) { ctx.beginPath(); ctx.moveTo(xx + 0.5, yy - 6); ctx.lineTo(xx + 0.5, yy); ctx.stroke(); }
    }
  }

  function drawWall(ctx, top, bot) {
    const c = castle, W = G.CONFIG.world.w, g = c.gate;
    // 牆頂走道（往後退一點，做出俯視的厚度）
    ctx.fillStyle = '#6f727a'; ctx.fillRect(0, top - 10, W, 12);
    // 牆面
    stoneBlock(ctx, 0, top, g.x - g.w / 2, bot - top, '#8d9099');
    stoneBlock(ctx, g.x + g.w / 2, top, W - g.x - g.w / 2, bot - top, '#8d9099');
    // 垛口
    ctx.fillStyle = '#a2a5ad';
    for (let x = 0; x < W; x += 14) if (Math.abs(x + 4 - g.x) > g.w / 2 + 14) ctx.fillRect(x, top - 16, 8, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, bot - 3, W, 3);
    // 城門
    const gx = g.x - g.w / 2;
    stoneBlock(ctx, gx - 18, top - 22, g.w + 36, bot - top + 22, '#9a9da6');
    if (g.hp > 0) {
      ctx.fillStyle = g.open ? '#1d1712' : '#5b3a22';
      ctx.fillRect(gx, top - 4, g.w, bot - top + 4);
      if (!g.open) {
        ctx.fillStyle = '#3e2716';
        for (let x = gx + 6; x < gx + g.w; x += 10) ctx.fillRect(x, top - 4, 2, bot - top + 4);
        ctx.fillStyle = '#2b2b2b'; ctx.fillRect(gx, top + 6, g.w, 3); ctx.fillRect(gx, bot - 9, g.w, 3);
        // 受損裂痕
        const dmg = 1 - g.hp / g.maxHp;
        ctx.strokeStyle = 'rgba(20,10,5,0.9)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < Math.floor(dmg * 6); i++) {
          const sx = gx + 8 + (i * 13) % (g.w - 12), sy = top + 4 + (i * 7) % 18;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 6, sy + 8); ctx.lineTo(sx + 2, sy + 14); ctx.stroke();
        }
      }
      if (g.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${g.flash * 3})`; ctx.fillRect(gx, top - 4, g.w, bot - top + 4); }
    } else {
      ctx.fillStyle = '#1d1712'; ctx.fillRect(gx, top - 4, g.w, bot - top + 4);
      ctx.fillStyle = '#5b3a22';
      for (let i = 0; i < 6; i++) ctx.fillRect(gx + 4 + i * 9, bot - 6 + (i % 2) * 3, 8, 3);
    }
    // 門樓塔頂
    for (const tx of [gx - 18, gx + g.w + 2]) {
      ctx.fillStyle = '#4a5a78';
      ctx.beginPath(); ctx.moveTo(tx - 4, top - 22); ctx.lineTo(tx + 8, top - 44); ctx.lineTo(tx + 20, top - 22); ctx.fill();
    }
    // 兩端塔樓
    for (const tx of c.towers) {
      stoneBlock(ctx, tx - 20, top - 26, 40, bot - top + 26, '#9a9da6');
      ctx.fillStyle = '#4a5a78';
      ctx.beginPath(); ctx.moveTo(tx - 24, top - 26); ctx.lineTo(tx, top - 56); ctx.lineTo(tx + 24, top - 26); ctx.fill();
    }
    // 城門血條
    if (g.hp > 0 && g.hp < g.maxHp) {
      ctx.fillStyle = '#000'; ctx.fillRect(g.x - 24, top - 30, 48, 4);
      ctx.fillStyle = '#e0b040'; ctx.fillRect(g.x - 24, top - 30, 48 * g.hp / g.maxHp, 4);
    }
  }

  return {
    buildGround, setupCastle, blocked, resolve, route, gatePassable,
    get castle() { return castle; },
    drawGround, drawCapture, wallDrawables,
  };
})();
