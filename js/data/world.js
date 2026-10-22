/* ============ world.js — 城外大地圖：城池、守軍、強盜、道路、地形 ============
 * 座標是大地圖自己的座標（G.WORLD.size），美術在大地圖上用原尺寸畫（artScale 1）。
 * cities：owner 0 我方、1 北境聯軍；garrison 是守城兵團 [兵種 key, 人數]，越遠越強；
 *   hero 是守將的武器、gold 是攻下後的獎賞；town 是佔領後進城用的城內配置（G.TOWNS）。
 * camps：強盜營地，每個營地同時最多一隊在附近遊蕩；隊伍打掉後 respawnH 遊戲小時再生一隊。
 * roads：泥土路，依序連起來的點；山脈、森林依種子產生（同一個種子每次都一樣）。
 */
G.WORLD = {
  size: { w: 6144, h: 3840 },
  layout: 10,   // 地圖配置的版本：改了城池、地形位置就加 1，舊存檔的位置和強盜會重置
  minutesPerSec: 10,      // ×1 速度時，現實 1 秒 = 遊戲 10 分鐘（一天約 2.4 分鐘）
  armySpeed: 260,         // 我方軍隊在大地圖上的速度（騎馬，每秒 px，×1；×2 ×4 會跟著變快）
  mount: 'heavycav',      // 大地圖上武將騎的馬（用騎兵的精靈圖）
  banditChase: 170,       // 強盜追人的速度（比騎馬慢，跑得掉）
  factions: ['我方', '北境聯軍'],
  // 佔領的城池可以選的城堡樣子（assets/world/<key>.png）
  castleArts: [
    { key: 'castle_stone', name: '歐式石堡' }, { key: 'castle_east', name: '東方城郭' }, { key: 'castle_north', name: '北方木寨' },
    { key: 'castle_white', name: '白色階城' }, { key: 'city_capital', name: '王城' },
  ],
  // 王都在地圖正中間；10 座小城不規則地散在四周（有近有遠）。tier 越高守軍越強、獎賞越多（離王都遠的、北邊的比較強）
  cities: [
    { id: 'capital', name: '王都', x: 3072, y: 1950, owner: 0, art: 'city_capital', town: 'main', capital: true },
    { id: 'qingshi', name: '青石鎮', x: 3700, y: 2750, owner: 1, art: 'castle_stone', town: 'small', hero: 'sword', lord: '青石守將', gold: 300,
      garrison: [['militia', 30], ['pikeman', 20], ['archer', 16]] },
    { id: 'liuying', name: '柳營', x: 2000, y: 2950, owner: 1, art: 'castle_north', town: 'small', hero: 'sword', lord: '柳營守將', gold: 300,
      garrison: [['militia', 30], ['shieldman', 16], ['javelineer', 16]] },
    { id: 'yingzui', name: '鷹嘴堡', x: 700, y: 2600, owner: 1, art: 'castle_north', town: 'small', hero: 'sword', lord: '鷹嘴堡主', gold: 350,
      garrison: [['pikeman', 20], ['axeman', 14], ['archer', 16]] },
    { id: 'baihe', name: '白河城', x: 4700, y: 3400, owner: 1, art: 'castle_east', town: 'small', hero: 'sword', lord: '白河守將', gold: 450,
      garrison: [['shieldman', 16], ['pikeman', 20], ['archer', 16], ['crossbowman', 16]] },
    { id: 'donggang', name: '東崗鎮', x: 4250, y: 1350, owner: 1, art: 'castle_stone', town: 'small', hero: 'glaive', lord: '東崗守將', gold: 450,
      garrison: [['swordshield', 18], ['halberdier', 18], ['longbowman', 16]] },
    { id: 'heiyan', name: '雪原城', x: 820, y: 760, owner: 1, art: 'castle_north', town: 'small', hero: 'glaive', lord: '雪原城主', gold: 600,
      garrison: [['maceman', 14], ['pavise', 14], ['arquebusier', 16], ['shieldman', 16]] },
    { id: 'fenglin', name: '楓林城', x: 2160, y: 700, owner: 1, art: 'castle_east', town: 'small', hero: 'glaive', lord: '楓林城主', gold: 550,
      garrison: [['halberdier', 18], ['swordshield', 18], ['longbowman', 16], ['cavalry', 10]] },
    { id: 'langgu', name: '狼谷城', x: 5350, y: 2150, owner: 1, art: 'castle_north', town: 'small', hero: 'glaive', lord: '狼谷城主', gold: 700,
      garrison: [['axeman', 14], ['greatsword', 14], ['horsearcher', 12], ['heavycav', 10]] },
    { id: 'shuangfeng', name: '霜峰堡', x: 5000, y: 720, owner: 1, art: 'castle_white', town: 'small', hero: 'glaive', lord: '霜峰堡主', gold: 900,
      garrison: [['modao', 14], ['pavise', 14], ['arquebusier', 16], ['grenadier', 12], ['cavalry', 10]] },
    { id: 'beijing', name: '北境王城', x: 3600, y: 560, owner: 1, art: 'castle_white', town: 'small', hero: 'glaive', lord: '北境王', gold: 1200,
      garrison: [['modao', 14], ['greatsword', 14], ['arquebusier', 16], ['grenadier', 12], ['heavycav', 10], ['horsearcher', 12]] },
  ],
  camps: [
    { id: 'camp1', name: '亂石崗', x: 1700, y: 1900, tier: 1 },
    { id: 'camp2', name: '黑風林', x: 4050, y: 2350, tier: 2 },
    { id: 'camp3', name: '狼牙寨', x: 2700, y: 3350, tier: 1 },
    { id: 'camp4', name: '斷崖寨', x: 4250, y: 800, tier: 3 },
    { id: 'camp5', name: '荒丘寨', x: 1200, y: 1500, tier: 1 },
    { id: 'camp6', name: '青嶺寨', x: 4900, y: 1500, tier: 2 },
    { id: 'camp7', name: '赤沙營', x: 5600, y: 2900, tier: 2 },
    { id: 'camp8', name: '蘆葦蕩', x: 1300, y: 3250, tier: 1 },
    { id: 'camp9', name: '野狐嶺', x: 3400, y: 3300, tier: 2 },
    { id: 'camp10', name: '鷲巢寨', x: 5500, y: 1200, tier: 3 },
    { id: 'camp11', name: '枯木林', x: 600, y: 1700, tier: 1 },
  ],
  // 強盜隊伍的組成（依營地 tier）：[兵種, 人數]
  bandits: {
    // 戰鬥裡的強盜不要太多：小股的流寇，兩三隊、每隊人數比正規兵團少
    1: [[['militia', 14], ['javelineer', 8]], [['militia', 16], ['axeman', 6]]],
    2: [[['axeman', 8], ['militia', 14], ['archer', 8]], [['javelineer', 10], ['swordshield', 8], ['militia', 12]]],
    3: [[['axeman', 8], ['crossbowman', 8], ['horsearcher', 6], ['militia', 14]], [['greatsword', 8], ['javelineer', 10], ['cavalry', 6]]],
  },
  banditGold: { 1: 80, 2: 140, 3: 220 },
  raidGold: 200,   // 攔截北境聯軍打贏的獎賞
  /** 佔領的城每小時的收入（金） */
  incomeOf: c => Math.round((c.gold || 300) / 5),
  foodPrice: 0.5,   // 一份糧食幾金
  respawnH: 12,
  // 高地（台地）：頂面是乾草地，整圈邊緣擋路（南半圈畫成岩壁），只能從斜坡（ramps，邊緣上的角度，放在 1.1～2.1 之間：南邊比較平的地方，斜坡圖才接得平）上下；在上面行軍 ×0.85
  highlands: [   // 楓林城、霜峰堡、狼谷城、鷹嘴堡蓋在台地上
    { x: 2160, y: 680, rx: 460, ry: 300, ramps: [1.2, 1.95], city: 'fenglin' },   // 東邊留給河，台地邊緣離河至少 150px,
    { x: 5000, y: 700, rx: 480, ry: 290, ramps: [1.25, 2.0], city: 'shuangfeng' },
    { x: 5350, y: 2130, rx: 500, ry: 310, ramps: [1.15, 1.9], city: 'langgu' },
    { x: 700, y: 2580, rx: 460, ry: 280, ramps: [1.3, 2.05], city: 'yingzui' },
  ],


  // 雪原（左上角）：邊界不規則；地面是雪、樹帶冷色調、在上面行軍 ×0.8
  snow: { x: 520, y: 600, rx: 980, ry: 900 },
  // 湖泊（擋路）：中心、半徑；岸邊的形狀依種子扭曲（js/world/world-ground.js）
  lakes: [
    { x: 2400, y: 2070, rx: 230, ry: 122 },
    { x: 4125, y: 3525, rx: 270, ry: 108 },
    { x: 5475, y: 3525, rx: 216, ry: 108 },
    { x: 4350, y: 1875, rx: 202, ry: 108 },
  ],
  // 河流（擋路，路經過的地方有橋）：依序連起來的點，會畫成平滑的曲線
  rivers: [
    [[2950, -60], [2850, 650], [2650, 1250], [2440, 1850], [2405, 2055]],   // 河的兩端伸進湖裡，看不到河的盡頭
    [[2400, 2100], [2415, 2280], [2580, 2850], [2925, 3450], [2850, 3960]],
  ],
  // 道路：只有王都往外的幾條大路（不是每座城都有路，其他地方騎馬直接穿過去）；最後一點是終點城的城門前（城的 y + 50），那裡畫一塊城門前的空地
  roads: [
    [[3072, 2010], [3350, 2400], [3700, 2800]],
    [[3072, 1950], [3650, 1650], [4250, 1400]],
    [[3072, 2010], [2550, 2500], [2000, 3000]],
    [[3072, 1890], [3300, 1150], [3600, 610]],
  ],

};

/* 地形：山脈（擋路）、湖泊（擋路）、丘陵、森林（不擋路）。避開城池、營地和道路 */
(() => {
  const W = G.WORLD, out = [];
  let s = 20261022; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const nearRoad = (x, y, r) => W.roads.some(path => path.some((p, i) => {
    if (!i) return false;
    const [ax, ay] = path[i - 1], [bx, by] = p, dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (ax + dx * t), y - (ay + dy * t)) < r;
  }));
  const inSnow0 = (x, y) => W.inSnow(x, y);   // 雪原裡的樹（W.inSnow 在下面定義，用的時候已經有了）
  const inLake = (x, y, m = 0) => W.lakes.some(l => ((x - l.x) / (l.rx + m)) ** 2 + ((y - l.y) / (l.ry + m)) ** 2 < 1);
  const riverPts = W.rivers.map((r, i) => G.U.meander(G.U.smooth(r, 16), 26, i * 3.1));   // 跟畫出來的河同一條蜿蜒的線
  const nearRiver = (x, y, r) => riverPts.some(pts => pts.some(([px, py]) => Math.abs(px - x) < r && Math.abs(py - y) < r && Math.hypot(px - x, py - y) < r));
  W.nearRoad = nearRoad; W.inLake = inLake; W.nearRiver = nearRiver;
  /** 高地邊緣上角度 t 的點（畫圖和擋路共用）；i 是第幾塊高地 */
  W.highlandPt = (h, i, t) => { const w = 1 + 0.08 * Math.sin(3 * t + i) + 0.05 * Math.sin(7 * t + i * 2); return [h.x + Math.cos(t) * h.rx * w, h.y + Math.sin(t) * h.ry * w]; };
  W.CLIFF = 60;   // 高地岩壁的高度（用 assets/world/cliff_low*.png 切成直條排出來）
  /** 雪原的邊界：橢圓加上幾個不同頻率的起伏（畫圖和判斷共用） */
  W.snowR = a => 1 + 0.12 * Math.sin(3 * a + 1) + 0.07 * Math.sin(7 * a + 2) + 0.04 * Math.sin(13 * a);
  W.inSnow = (x, y) => { const s = W.snow, dx = (x - s.x) / s.rx, dy = (y - s.y) / s.ry; return Math.hypot(dx, dy) < W.snowR(Math.atan2(dy, dx)); };
  W.inHighland = (x, y) => W.highlands.some(h => ((x - h.x) / h.rx) ** 2 + ((y - h.y) / h.ry) ** 2 < 1);
  // 高地邊緣（岩壁、斜坡）那一圈不放山和樹，不然會一半在台地上、一半在下面
  const nearCliff = (x, y, r) => W.highlands.some(h => { const v = Math.hypot((x - h.x) / h.rx, (y - h.y) / h.ry); return Math.abs(v - 1) * Math.min(h.rx, h.ry) < r + 40; });
  const inBorder = (x, y, r) => x < 110 + r || y < 220 + r || x > W.size.w - 110 - r || y > W.size.h - 90 - r;   // 外圍岩壁那一圈不放東西
  // 斜坡口前面（往南 260px、左右 120px）留空，不長樹、不放石頭
  const nearRamp = (x, y, r) => W.highlands.some((h, i) => h.ramps.some(t => { const [rx, ry] = W.highlandPt(h, i, t); return Math.abs(x - rx) < 120 + r && y > ry - 40 - r && y < ry + 260 + r; }));
  const clear = (x, y, r, gap = r) => !inBorder(x, y, r * 0.5) && !nearCliff(x, y, r) && !nearRamp(x, y, r) && !nearRoad(x, y, r) && !inLake(x, y, r * 0.8) && !nearRiver(x, y, r * 0.8 + 20) && [...W.cities, ...W.camps].every(c => Math.hypot(c.x - x, c.y - y) > r + 160) &&
    out.every(o => Math.hypot(o.x - x, o.y - y) > (o.r || 0) * (gap / r) + gap);
  // 地圖外圍一圈岩壁（擋路，不畫圖；岩壁畫在地面上，js/world/world-ground.js）：四邊各一條長方形
  const B = W.BORDER = 150, { w: MW, h: MH } = W.size;
  // 外圍高崖用 PixelLab 的圖塊鋪（assets/world/cliff_*.png，js/scenes/world.js 的 cliffTiles）：
  //   北邊 cliff_n 貼在 y = 0，崖腳在 y ≈ 130；東西 cliff_w / cliff_e 貼在最邊上，崖面外緣在 40px；南邊 cliff_s 貼在最下面
  //   擋路：北邊擋到 y 136，東西擋 46px，南邊擋最下面 30px
  out.push({ art: 'border', hidden: true, x: MW / 2, y: 136, fw: MW + 200, fh: 300 }, { art: 'border', hidden: true, x: MW / 2, y: MH + 100, fw: MW + 200, fh: 130 },
    { art: 'border', hidden: true, x: -4, y: MH + 100, fw: 100, fh: MH + 300 }, { art: 'border', hidden: true, x: MW + 4, y: MH + 100, fw: 100, fh: MH + 300 });
  // 山脈：沿稜線排兩三層、互相疊著，看起來是一整片山
  const ridges = [[[120, 225], [975, 570]], [[5400, 180], [6060, 900]], [[120, 3375], [1200, 3750]], [[4950, 3720], [6060, 3450]],
    [[5925, 1200], [6090, 2250]], [[90, 1650], [300, 2850]], [[3675, 2250], [3900, 2850]], [[1725, 1050], [1950, 1425]]];
  for (const [[ax, ay], [bx, by]] of ridges) for (let t = 0; t <= 1; t += 0.05) for (let row = 0; row < 2; row++) {
    const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny), off = (row - 0.5) * 70 + (rnd() - 0.5) * 50;
    const x = ax + (bx - ax) * t + nx / nl * off + (rnd() - 0.5) * 40, y = ay + (by - ay) * t + ny / nl * off + (rnd() - 0.5) * 40, k = 1 + Math.floor(rnd() * 3);
    const fw = [110, 84, 140][k - 1], fh = [34, 32, 40][k - 1];
    if (clear(x, y, 60, 44)) out.push({ art: 'mountain' + k, src: `assets/world/mountain${k}.png`, x: Math.round(x), y: Math.round(y), fw, fh, r: 60, flip: rnd() < 0.5 });
  }
  // 森林：一片一片（每片 2～5 叢疊在一起）
  for (let i = 0; i < 110; i++) {
    const cx = 120 + rnd() * (W.size.w - 240), cy = 160 + rnd() * (W.size.h - 260), n = 2 + Math.floor(rnd() * 5);
    for (let j = 0; j < n; j++) {
      const x = cx + (rnd() - 0.5) * 220, y = cy + (rnd() - 0.5) * 110;
      if (clear(x, y, 60, 34)) out.push({ art: 'forest2', src: 'assets/world/forest2.png', x: Math.round(x), y: Math.round(y), r: 50, flip: rnd() < 0.5, fw: 104, fh: 40, ellipse: true, tint: inSnow0(x, y) ? 0xc8d8e2 : undefined });   // 森林擋路
    }
  }
  // 零星的樹（擋路）、灌木（不擋路）、石堆（擋路，數量少）
  for (let i = 0; i < 150; i++) {
    const x = 60 + rnd() * (W.size.w - 120), y = 80 + rnd() * (W.size.h - 120), f = rnd();
    const art = f < 0.4 ? 'pine' : f < 0.75 ? 'oak' : 'bush';
    if (clear(x, y, 24, 20)) out.push({ art, src: `assets/map/${art}.png`, x: Math.round(x), y: Math.round(y), r: 20, flip: rnd() < 0.5, tint: inSnow0(x, y) ? 0xc8d8e2 : undefined, ...(art === 'bush' ? {} : { fw: 16, fh: 10, ellipse: true }) });   // 樹幹擋路、灌木不擋
  }
  for (let i = 0; i < 30; i++) {
    const x = 80 + rnd() * (W.size.w - 160), y = 100 + rnd() * (W.size.h - 160);
    if (clear(x, y, 40, 30)) out.push({ art: 'rocks', src: 'assets/map/rocks.png', x: Math.round(x), y: Math.round(y), fw: 34, fh: 14, r: 30, flip: rnd() < 0.5 });
  }
  // 河流擋路：沿著河一串圓形障礙；路經過的地方（橋）不擋
  for (const pts of riverPts) for (let i = 0; i < pts.length; i += 1) {
    const [x, y] = pts[i];
    if (nearRoad(x, y, 44) || inLake(x, y, -10) || x < -20 || y < -20 || y > W.size.h + 20) continue;
    out.push({ art: 'river', hidden: true, ellipse: true, x: Math.round(x), y: Math.round(y + 20), fw: 40, fh: 40 });
  }
  // 高地整圈都擋路（南半圈是岩壁、北半圈是斷崖邊），只有斜坡的地方能上下
  W.highlands.forEach((h, i) => {
    const rampAt = h.ramps.map(r => W.highlandPt(h, i, r));
    for (let t = 0; t < Math.PI * 2; t += 0.03) {
      const [x, y] = W.highlandPt(h, i, t), south = Math.sin(t) > 0;
      if (south && rampAt.some(([rx, ry]) => Math.abs(x - rx) < 44 && Math.abs(y - ry) < 50)) continue;   // 斜坡圖中間的路（約 50px 寬）
      out.push({ art: 'cliff', hidden: true, ellipse: true, x: Math.round(x), y: Math.round(south ? y + W.CLIFF / 2 + 16 : y + 12), fw: 36, fh: 30 });
    }
  });
  // 湖泊擋路：橢圓形的障礙（不畫圖，湖面畫在地面上）
  for (const l of W.lakes) out.push({ art: 'lake', hidden: true, ellipse: true, x: l.x, y: l.y + l.ry, fw: l.rx * 2, fh: l.ry * 2 });
  // 城池、營地本身也擋路（只能站到城門前）
  for (const c of W.cities) out.push({ art: c.art, src: `assets/world/${c.art}.png`, x: c.x, y: c.y, fw: c.capital ? 140 : c.art === 'castle_white' ? 130 : 116, fh: 46, city: c.id });
  for (const c of W.camps) out.push({ art: 'bandit_camp', src: 'assets/world/bandit_camp.png', x: c.x, y: c.y, fw: 70, fh: 26, camp: c.id });
  // 道路在 js/world/world-ground.js 畫成平滑的泥土路，這裡不用地磚
  G.TOWNS.world = { roads: [], dirt: [], buildings: out };
})();
