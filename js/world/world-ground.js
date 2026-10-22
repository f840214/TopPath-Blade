/* ============ world-ground.js — 大地圖的地面：明暗、湖泊、平滑的泥土路 ============
 * 由 G.Map.buildGround 的 paint 掛勾呼叫（畫在草地地磚上、小草底下），座標是大地圖座標。
 * 顏色故意壓低彩度，配合整體偏暗、偏冷的調色（css 的 #game 濾鏡）。
 */
G.WorldGround = (() => {
  const W = () => G.WORLD;

  /** 這裡能不能放樹石草叢：不在湖裡、不在路上 */
  function ok(x, y) { const S = W().size; if (x < 90 || y < 200 || x > S.w - 90 || y > S.h - 70) return false;   // 外圍高崖上不放草叢
    if (W().inSnow(x, y) || W().inLake(x, y, 30) || W().nearRoad(x, y, 34) || W().nearRiver(x, y, 44)) return false;
    // 不跟其他東西重疊：台地邊緣到崖腳、斜坡口、樹林、山、城、營地
    for (const h of W().highlands || []) { const v = Math.hypot((x - h.x) / h.rx, (y - h.y - W().CLIFF * 0.5) / h.ry); if (Math.abs(v - 1) * Math.min(h.rx, h.ry) < 70) return false; }
    return !G.TOWNS.world.buildings.some(b => b.fw && Math.abs(x - b.x) < b.fw / 2 + 40 && y > b.y - b.fh - 70 && y < b.y + 40); }

  function soft(g, x, y, r, color) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /** 湖岸的形狀：橢圓加上幾個不同頻率的起伏 */
  function lakePath(g, l, k, seed) {
    g.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = i / 64 * Math.PI * 2, w = 1 + 0.07 * Math.sin(3 * a + seed) + 0.05 * Math.sin(5 * a + seed * 2.3) + 0.03 * Math.sin(9 * a + seed * 0.7);
      const x = l.x + Math.cos(a) * l.rx * k * w, y = l.y + Math.sin(a) * l.ry * k * w;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
  }

  function paint(g, tileOf) {
    const S = W().size;
    let s = 77031; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    // 1. 大片的色塊：深綠林地、橄欖色草原、乾黃坡地，讓草地不是一整片同樣的綠
    const tints = ['rgba(14,34,20,0.13)', 'rgba(14,34,20,0.09)', 'rgba(150,150,70,0.12)', 'rgba(170,150,90,0.1)', 'rgba(120,160,90,0.1)'];   // 亮色塊多一點，畫面才不會悶
    for (let i = 0; i < 320; i++) soft(g, rnd() * S.w, rnd() * S.h, 120 + rnd() * 340, tints[Math.floor(rnd() * tints.length)]);
    // 1b. 雪原：沿著不規則的邊界填雪，邊緣用一圈半透明的雪過渡，裡面加淡藍的陰影和亮點
    const sn = W().snow;
    if (sn) {
      const snowPath = k => { g.beginPath(); for (let a = 0; a <= 120; a++) { const t = a / 120 * Math.PI * 2, r = W().snowR(t) * k; const x = sn.x + Math.cos(t) * sn.rx * r, y = sn.y + Math.sin(t) * sn.ry * r; a ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
      for (const [k, a] of [[1.06, 0.18], [1.03, 0.35]]) { snowPath(k); g.fillStyle = `rgba(232,238,240,${a})`; g.fill(); }
      snowPath(1); g.fillStyle = '#e4eaec'; g.fill(); g.globalAlpha = 0.4; g.fillStyle = g.createPattern(tileOf('snow'), 'repeat'); g.fill(); g.globalAlpha = 1;   // 雪地貼圖（tex_snow）淡淡疊上去，看不出重複
      g.save(); snowPath(1); g.clip();
      for (let i = 0; i < 90; i++) soft(g, sn.x + (rnd() - 0.6) * sn.rx * 2, sn.y + (rnd() - 0.6) * sn.ry * 2, 80 + rnd() * 160, rnd() < 0.7 ? 'rgba(150,175,200,0.10)' : 'rgba(255,255,255,0.12)');   // 大片明暗，打散貼圖的重複感
      g.restore();
    }
    // 2. 山腳一圈灰褐色的碎石地、森林底下的深色陰影
    for (const b of G.TOWNS.world.buildings) {
      if (b.art.startsWith('mountain')) { soft(g, b.x, b.y - 14, 120, 'rgba(78,70,58,0.5)'); soft(g, b.x, b.y - 10, 70, 'rgba(60,54,46,0.35)'); }
      else if (b.art === 'forest2') soft(g, b.x, b.y - 20, 110, 'rgba(8,24,12,0.26)');
    }
    const dirtFill = g.createPattern(tileOf('lower'), 'repeat');
    // 2b. 高地（台地）：頂面是偏乾黃的草地，南半圈是一道有高度的岩壁（從邊緣往下 CLIFF px），岩壁上有直紋和碎石
    const CLIFF = W().CLIFF;
    (W().highlands || []).forEach((h, i) => {
      const pt = t => W().highlandPt(h, i, t);
      const edge = () => { g.beginPath(); for (let a = 0; a <= 96; a++) { const [x, y] = pt(a / 96 * Math.PI * 2); a ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
      // 岩壁：南半圈（t 從 0 到 π）的邊緣和往下平移 CLIFF 的邊緣之間
      const N = 60, top = [], bot = [];
      for (let a = 0; a <= N; a++) { const [x, y] = pt(a / N * Math.PI); top.push([x, y]); bot.push([x, y + CLIFF]); }
      soft(g, h.x, h.y + h.ry + CLIFF, h.rx * 0.9, 'rgba(20,24,12,0.25)');   // 岩壁腳下的陰影（岩壁本身是 PixelLab 的圖，js/scenes/world.js 的 highlandCliffs）
      // 台地的投影：整塊往右下偏一點的暗色，側邊沒有岩壁的地方也看得出台地是高起來的
      for (const [o, a] of [[14, 0.10], [8, 0.16], [4, 0.22]]) { g.save(); g.translate(o * 0.4, o); edge(); g.fillStyle = `rgba(18,26,12,${a})`; g.fill(); g.restore(); }
      // 頂面：跟平地同一種草（tex_grass），稍微亮一點，像頂面照到光
      edge(); g.fillStyle = g.createPattern(tileOf('grass'), 'repeat'); g.fill(); g.fillStyle = 'rgba(255,240,190,0.07)'; g.fill();
      // 斜坡是 PixelLab 的圖（assets/world/ramp1/2.png），在 js/scenes/world.js 的 highlandCliffs 跟岩壁一起畫
      g.save(); edge(); g.clip();
      for (let j = 0; j < 24; j++) soft(g, h.x + (rnd() - 0.5) * h.rx * 1.8, h.y + (rnd() - 0.5) * h.ry * 1.8, 70 + rnd() * 100, rnd() < 0.5 ? 'rgba(190,175,110,0.06)' : 'rgba(40,60,30,0.06)');
      g.restore();
      // 邊緣：外側一道細的深色線、內側一道淡淡的亮邊
      edge(); g.strokeStyle = 'rgba(30,38,20,0.45)'; g.lineWidth = 2; g.stroke();
      g.save(); edge(); g.clip(); edge(); g.strokeStyle = 'rgba(225,235,180,0.22)'; g.lineWidth = 5; g.stroke(); g.restore();
    });
    // 3. 河流（先畫，湖蓋在上面，河的兩端藏在湖裡）：沿著蜿蜒的線一圈圈蓋圓，寬度忽寬忽窄、岸邊不規則
    const dirt = g.createPattern(tileOf('lower'), 'repeat');
    const riverDraw = [];   // 河口：畫完湖之後再補一次水，河跟湖接起來（不然湖的沙岸會把河口切斷）
    W().rivers.forEach((r, ri) => {
      const pts = G.U.meander(G.U.smooth(r, 5), 26, ri * 3.1);
      let d = 0;
      const width = pts.map(([x, y], i) => { if (i) d += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]); return 20 + Math.sin(d / 70 + ri) * 4 + Math.sin(d / 23 + ri * 2) * 2; });
      const layer = (fill, extra, jitter) => { g.fillStyle = fill; pts.forEach(([x, y], i) => { g.beginPath(); g.arc(x, y, Math.max(2, width[i] + extra + (jitter ? (rnd() - 0.5) * jitter : 0)), 0, Math.PI * 2); g.fill(); }); };
      riverDraw.push({ pts, width });
      layer(dirt, 11, 6); layer('rgba(90,84,60,0.35)', 9, 4); layer('#35505a', 3, 2); layer('#29424c', 0, 0); layer('rgba(70,108,118,0.35)', -10, 0);
      g.strokeStyle = 'rgba(190,210,205,0.18)'; g.lineWidth = 2;
      for (let i = 6; i < pts.length - 6; i += 11) {   // 水流的反光：順著河的方向的短線
        const [x, y] = pts[i], [bx, by] = pts[i + 3], o = (rnd() - 0.5) * width[i];
        g.beginPath(); g.moveTo(x + o * 0.3, y + o); g.lineTo(bx + o * 0.3, by + o); g.stroke();
      }
    });
    // 3b. 湖泊：沙岸 → 深水 → 中間稍亮 → 岸邊的淺水線與水草
    W().lakes.forEach((l, i) => {
      const seed = i * 1.7 + 0.4;
      lakePath(g, l, 1.16, seed); g.fillStyle = dirt; g.fill(); g.fillStyle = 'rgba(90,84,60,0.45)'; g.fill();
      lakePath(g, l, 1.04, seed); g.fillStyle = '#35505a'; g.fill();
      lakePath(g, l, 1.0, seed); g.fillStyle = '#29424c'; g.fill();
      g.save(); lakePath(g, l, 1.0, seed); g.clip();
      soft(g, l.x - l.rx * 0.15, l.y - l.ry * 0.2, Math.max(l.rx, l.ry) * 0.9, 'rgba(70,108,118,0.55)');
      g.strokeStyle = 'rgba(190,210,205,0.16)'; g.lineWidth = 2;
      for (let j = 0; j < 14; j++) {   // 水面反光：短的橫線
        const x = l.x + (rnd() - 0.5) * l.rx * 1.4, y = l.y + (rnd() - 0.5) * l.ry * 1.3, w = 10 + rnd() * 26;
        g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x + w / 2, y); g.stroke();
      }
      g.restore();
      lakePath(g, l, 1.0, seed); g.strokeStyle = 'rgba(160,180,170,0.35)'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = 'rgba(40,60,30,0.8)'; g.lineWidth = 1.5;
      for (let j = 0; j < 60; j++) {   // 水草
        const a = rnd() * Math.PI * 2, x = l.x + Math.cos(a) * l.rx * 1.06, y = l.y + Math.sin(a) * l.ry * 1.06;
        for (let q = -1; q <= 1; q++) { g.beginPath(); g.moveTo(x + q * 2, y); g.lineTo(x + q * 3, y - 5 - rnd() * 4); g.stroke(); }
      }
    });
    // 淺色的河岸邊只補在湖外（不然湖面上會多一圈亮邊），深色的水一路補進湖裡
    for (const { pts, width } of riverDraw) for (const [fill, extra, inner] of [['#35505a', 3, 6], ['#29424c', 0, -6]]) {
      g.fillStyle = fill;
      pts.forEach(([x, y], i) => { if (!W().inLake(x, y, 60) || W().inLake(x, y, inner)) return; g.beginPath(); g.arc(x, y, Math.max(2, width[i] + extra), 0, Math.PI * 2); g.fill(); });
    }
    // 3d. 野花：一小叢一小叢的彩色點
    const FLOWERS = ['#c9b45a', '#b9574a', '#d8cfb8', '#8a6aa8'];
    for (let i = 0; i < 160; i++) {
      const x = rnd() * S.w, y = rnd() * S.h; if (!ok(x, y)) continue;
      g.fillStyle = FLOWERS[Math.floor(rnd() * FLOWERS.length)];
      for (let j = 0; j < 7; j++) g.fillRect(Math.round(x + (rnd() - 0.5) * 22), Math.round(y + (rnd() - 0.5) * 12), 2, 2);
    }
    // 4. 泥土路（PixelLab 的圖）：路面 tex_road、兩側撒 road_edge 打散邊線（草朝外）、終點城門前一塊空地 road_end
    const paths = W().roads.map((p, i) => G.U.meander(G.U.smooth(p), 12, i * 2.3 + 1));   // 路也稍微彎來彎去
    const img = n => { const im = G.Assets.img(`assets/world/${n}.png`); return im.complete && im.naturalWidth ? im : null; };
    const roadTex = img('tex_road'), edges = [1, 2, 3, 4, 5, 6, 7, 8].map(k => img(`road_edge${k}`)).filter(Boolean), plaza = img('road_end');
    for (const pts of paths) for (const [x, y] of pts) soft(g, x, y, 30, 'rgba(40,32,20,0.08)');   // 路肩淡淡的陰影
    g.fillStyle = roadTex ? g.createPattern(roadTex, 'repeat') : dirt;
    for (const pts of paths) pts.forEach(([x, y], i) => { g.beginPath(); g.arc(x, y, 17 + Math.sin(i * 0.7) * 1.5, 0, Math.PI * 2); g.fill(); });
    // 城門前的空地（路的終點）
    // 每條路的終點，加上王都城門（兩條往南的路從這裡出發）
    const plazas = [...W().roads.map(p => p[p.length - 1]), ...W().roads.filter(p => p[0][1] > W().cities.find(c => c.capital).y).map(p => p[0])].filter((p, i, a) => a.findIndex(q => q[0] === p[0] && q[1] === p[1]) === i);
    if (plaza) for (const [x, y] of plazas) { g.drawImage(plaza, Math.round(x - 90), Math.round(y - 86)); }   // 上緣貼著城牆腳（城的圖底下有一段透明）
    // 路邊：沿兩側每 ~20px 放一個小草叢／碎石，轉到草朝路外
    if (edges.length) for (const pts of paths) for (let i = 2; i < pts.length - 8; i++) {
      if (rnd() < 0.45) continue;
      const [x, y] = pts[i], [ax, ay] = pts[i - 1], [bx, by] = pts[i + 1], l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l, ny = (bx - ax) / l;
      if (W().nearRiver(x, y, 30) || plazas.some(([px, py]) => Math.hypot(px - x, py - y) < 110)) continue;   // 橋、城門前的空地不放
      for (const side of [-1, 1]) {
        if (rnd() < 0.3) continue;
        const e = edges[Math.floor(rnd() * edges.length)], ox = nx * side, oy = ny * side, d = 13 + rnd() * 3;
        if (paths.some(o => o !== pts && o.some(([qx, qy]) => Math.hypot(qx - x - ox * 22, qy - y - oy * 22) < 26))) continue;   // 兩條路交會的地方不放（草會長到另一條路上）
        g.save(); g.translate(x + ox * d, y + oy * d); g.rotate(Math.atan2(ox, -oy));
        if (rnd() < 0.5) g.scale(-1, 1);
        g.drawImage(e, -e.width / 2, -e.height * 0.55); g.restore();
      }
    }
    // 5. 橋：路跨過河的地方鋪木板橋
    for (const pts of paths) for (let i = 1; i < pts.length - 1; i += 3) {
      const [x, y] = pts[i];
      if (!W().nearRiver(x, y, 10)) continue;
      const [ax, ay] = pts[Math.max(0, i - 6)], [bx, by] = pts[Math.min(pts.length - 1, i + 6)], a = Math.atan2(by - ay, bx - ax);
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-44, -15, 88, 34);
      g.fillStyle = '#6b5236'; g.fillRect(-42, -16, 84, 32);
      g.fillStyle = '#4a3826'; for (let p = -42; p < 42; p += 7) g.fillRect(p, -16, 1, 32);
      g.fillStyle = '#3a2c1e'; g.fillRect(-42, -18, 84, 3); g.fillRect(-42, 15, 84, 3);   // 欄杆
      g.restore();
      i += 12;   // 同一座橋只畫一次
    }
    // 路邊的小石子
    g.fillStyle = 'rgba(150,140,120,0.55)';
    for (const pts of paths) for (let i = 0; i < pts.length; i += 5) {
      const [x, y] = pts[i], a = rnd() * Math.PI * 2, r = 20 + rnd() * 6;
      g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 2, 2);
    }
  }

  return { paint, ok, smooth: G.U.smooth };
})();
