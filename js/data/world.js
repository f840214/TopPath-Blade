/* ============ world.js — 城外大地圖：城池、守軍、強盜、道路、地形 ============
 * 座標是大地圖自己的座標（G.WORLD.size），美術在大地圖上用原尺寸畫（artScale 1）。
 * cities：owner 0 我方、1 北境聯軍；garrison 是守城兵團 [兵種 key, 人數]，越遠越強；unit 是特產兵種（佔領就解鎖，design.md 32）；
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
    { id: 'capital', name: '王都', x: 3072, y: 1950, owner: 0, art: 'capital_grand', town: 'main', capital: true },   // 王都用自己的大圖（約 470×410，castleArts 的 city_capital 是給玩家的城選的）
    { id: 'qingshi', name: '青石鎮', unit: 'swordshield', x: 3700, y: 2750, owner: 1, art: 'castle_stone', town: 'small', hero: 'sword', lord: '青石守將', gold: 300,
      garrison: [['militia', 30], ['pikeman', 20], ['archer', 16]] },
    { id: 'liuying', name: '柳營', unit: 'greatsword', x: 2000, y: 2950, owner: 1, art: 'castle_north', town: 'small', hero: 'sword', lord: '柳營守將', gold: 300,
      garrison: [['militia', 30], ['shieldman', 16], ['javelineer', 16]] },
    { id: 'yingzui', name: '鷹嘴堡', unit: 'axeman', x: 700, y: 2600, owner: 1, art: 'castle_north', town: 'small', hero: 'sword', lord: '鷹嘴堡主', gold: 350,
      garrison: [['pikeman', 20], ['axeman', 14], ['archer', 16]] },
    { id: 'baihe', name: '白河城', unit: 'crossbowman', x: 4700, y: 3400, owner: 1, art: 'castle_east', town: 'small', hero: 'sword', lord: '白河守將', gold: 450,
      garrison: [['shieldman', 16], ['pikeman', 20], ['archer', 16], ['crossbowman', 16]] },
    { id: 'donggang', name: '東崗鎮', unit: 'halberdier', x: 4250, y: 1350, owner: 1, art: 'castle_stone', town: 'small', hero: 'longbow', lord: '東崗守將', gold: 450,
      garrison: [['swordshield', 18], ['halberdier', 18], ['longbowman', 16]] },
    { id: 'heiyan', name: '雪原城', unit: 'heavycav', x: 820, y: 760, owner: 1, art: 'castle_north', town: 'small', hero: 'musket', lord: '雪原城主', gold: 600,
      garrison: [['maceman', 14], ['pavise', 14], ['arquebusier', 16], ['shieldman', 16]] },
    { id: 'fenglin', name: '楓林城', unit: 'longbowman', x: 2160, y: 700, owner: 1, art: 'castle_east', town: 'small', hero: 'glaive', lord: '楓林城主', gold: 550,
      garrison: [['halberdier', 18], ['swordshield', 18], ['longbowman', 16], ['cavalry', 10]] },
    { id: 'langgu', name: '狼谷城', unit: 'horsearcher', x: 5350, y: 2150, owner: 1, art: 'castle_north', town: 'small', hero: 'glaive', lord: '狼谷城主', gold: 700,
      garrison: [['axeman', 14], ['greatsword', 14], ['horsearcher', 12], ['heavycav', 10]] },
    { id: 'shuangfeng', name: '霜峰堡', unit: 'arquebusier', x: 5000, y: 720, owner: 1, art: 'castle_white', town: 'small', hero: 'glaive', lord: '霜峰堡主', gold: 900,
      garrison: [['modao', 14], ['pavise', 14], ['arquebusier', 16], ['grenadier', 12], ['cavalry', 10]] },
    { id: 'beijing', name: '北境王城', unit: 'modao', x: 3600, y: 560, owner: 1, art: 'castle_white', town: 'small', hero: 'glaive', lord: '北境王', gold: 1200,
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
  // 採集點（docs/design.md 28）：走到旁邊按 E 採集，給打造用的材料（G.MATERIALS）；每個人每個點 cooldownMin 現實分鐘才能再採一次（伺服器記）
  nodes: [
    { id: 'mine1', kind: 'iron', name: '黑石礦坑', x: 1560, y: 1250 },
    { id: 'mine2', kind: 'iron', name: '赤岩礦坑', x: 3560, y: 2470 },
    { id: 'mine3', kind: 'iron', name: '東嶺礦坑', x: 5560, y: 1500 },
    { id: 'hunt1', kind: 'leather', name: '鹿野獵場', x: 1000, y: 2050 },
    { id: 'hunt2', kind: 'leather', name: '南林獵場', x: 3250, y: 3050 },
    { id: 'hunt3', kind: 'leather', name: '東湖獵場', x: 4950, y: 2650 },
    { id: 'steel1', kind: 'steel', name: '寒鐵礦脈', x: 1350, y: 520 },
    { id: 'steel2', kind: 'steel', name: '北嶺礦脈', x: 4500, y: 470 },
  ],
  gather: { range: 140, cooldownMin: 20, yield: { iron: [3, 6], leather: [2, 4], steel: [1, 2] } },
  // 攻城時段（領地戰，design.md 27）：別的玩家佔的城只有這段時間能打（伺服器時間換成 tz 時區）；空城、北境聯軍的城隨時能打。
  //   剛被佔下的城有 shieldH 小時保護
  siegeWindow: { tz: 8, daily: [19, 23], weekend: [13, 23], shieldH: 12 },
  guild: { createCost: 500, max: 30, nameMax: 12, tagMax: 4 },
  market: { tax: 0.05, maxListings: 10, maxPrice: 100000 },
  raidGold: 200,   // 攔截北境聯軍（巡邏隊也一樣）打贏的獎賞
  caravanGold: 250,   // 劫商隊打贏的獎賞（另外照 G.LOOT.caravan 掉材料）
  /** 佔領的城每小時的收入（金） */
  incomeOf: c => Math.round((c.gold || 300) / 5),
  /** 佔領的城每小時產幾份糧（design.md 32） */
  foodOf: c => 20 + Math.round((c.gold || 300) / 30),
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
  // 道路：王都往外的幾條大路，再從路的終點接到其他城；最後一點是終點城的城門前（城的 y + 50），那裡畫一塊城門前的空地
  //   台地上的城（楓林、霜峰、狼谷、鷹嘴）：路從斜坡口直直走上去（斜坡口 = highlandPt(ramp)，坡腳約在口的下方 100px）
  roads: [
    [[3072, 2010], [3350, 2400], [3700, 2800]],
    [[3072, 1950], [3650, 1650], [4250, 1400]],
    [[3072, 2010], [2550, 2500], [2000, 3000]],
    [[3072, 1890], [3300, 1150], [3600, 610]],
    [[3240, 1340], [2760, 1230], [2420, 1110], [2328, 1062], [2328, 930], [2210, 800], [2160, 750]],   // 楓林城：從北上的大路分出來，過河、走東邊的斜坡
    [[2160, 750], [2040, 840], [1988, 930], [1988, 1062], [1620, 1040], [1180, 900], [820, 810]],     // 雪原城：從楓林城門前走西邊的斜坡下去，往西進雪原
    [[4250, 1400], [4560, 1230], [4793, 1074], [4793, 945], [4900, 820], [5000, 770]],              // 霜峰堡：東崗鎮往東北，走西邊的斜坡
    [[4250, 1400], [4720, 1720], [4770, 2220], [4960, 2570], [5184, 2560], [5184, 2400], [5290, 2260], [5350, 2200]],   // 狼谷城：東崗鎮往南（繞過湖的東邊、台地的西邊），走西邊的斜坡
    [[3700, 2800], [4120, 3060], [4480, 3290], [4700, 3450]],                                        // 白河城：青石鎮往東南，從兩個湖中間過去
    [[2000, 3000], [1600, 3010], [1160, 2990], [900, 2975], [832, 2925], [832, 2840], [760, 2710], [700, 2650]],   // 鷹嘴堡：柳營往西，走東邊的斜坡
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
  /** 實際的台地邊緣：南半圈在斜坡兩側 120px 內慢慢拉到跟斜坡口同高（斜坡圖兩邊才接得平）。
   *  地面上畫的台地與岩壁（world-ground.js）、岩壁直條（world.js）、擋路的碰撞都用這一個，才不會對不上 */
  W.highlandEdge = (h, i, t) => {
    const [x, y] = W.highlandPt(h, i, t);
    if (Math.sin(t) <= 0) return [x, y];
    for (const r of h.ramps) {
      const [rx, ry] = W.highlandPt(h, i, r), d = Math.abs(x - rx);
      if (d < 120 && Math.abs(y - ry) < 60) { const k = Math.min(1, Math.max(0, (120 - d) / 62)); return [x, y + (ry - y) * k]; }
    }
    return [x, y];
  };
  // 王都城門前的一大片泥土地（js/world/world-ground.js 畫；形狀是 plazaPath：中心 (x, y - 40k)、半徑 84k × 46k，邊緣有起伏）。上面不放樹、田、草叢
  const cap0 = W.cities.find(c => c.capital);
  W.capitalYard = { x: cap0.x, y: cap0.y + 190, k: 3, seed: 2.2 };
  W.inYard = (x, y, m = 0) => { const Y = W.capitalYard; return ((x - Y.x) / (84 * Y.k + m)) ** 2 + ((y - Y.y + 40 * Y.k) / (46 * Y.k + m)) ** 2 < 1; };
  /** 這個時間（ms）是不是攻城時段（siegeWindow，用 tz 時區的時鐘；週末另外一段）；伺服器檢查、大地圖顯示共用 */
  W.siegeOpen = (ms = Date.now()) => { const S = W.siegeWindow, d = new Date(ms + S.tz * 3600e3), day = d.getUTCDay(), [a, b] = day === 0 || day === 6 ? S.weekend : S.daily, h = d.getUTCHours(); return h >= a && h < b; };
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
  // h：圖的中心比錨點（腳底）高多少。互相的距離用圖的中心算（只看錨點的話，樹冠、山頭會蓋到後面的田上）
  // 王都的圖很大（約 480×416，錨點在城門那條城牆底下）：整張圖的範圍都不放東西
  const nearCapital = (x, y, r) => { const c = W.cities.find(c => c.capital); return Math.abs(x - c.x) < 250 + r && y > c.y - 430 - r && y < c.y + 30 + r; };
  // 每張圖的大小（px，錨點在底部中央）：人造的東西（村子、田、推車…）跟任何圖的範圍都不能重疊（只看中心距離的話，寬的山會蓋到田上）
  const ART = { mountain1: [136, 67], mountain2: [107, 90], mountain3: [182, 109], forest2: [142, 101], oak: [100, 116], pine: [77, 129], rocks: [78, 46],
    hamlet: [87, 67], field: [136, 81], paddy: [128, 80], cart: [63, 54], watchtower: [38, 82], shrine: [59, 48], rockpile: [82, 49], logs: [79, 50] };
  const MADE = new Set(['hamlet', 'field', 'paddy', 'cart', 'watchtower', 'shrine', 'logs']);
  const boxOf = (art, x, y, m = 0) => { const [w, hh] = ART[art]; return { x0: x - w / 2 - m, x1: x + w / 2 + m, y0: y - hh - m, y1: y + m }; };
  const overlapsArt = (art, x, y, skip = '') => { if (!ART[art]) return false; const a = boxOf(art, x, y, 6);
    return out.some(o => ART[o.art] && o.art !== skip && (MADE.has(art) || MADE.has(o.art)) && (({ x0, x1, y0, y1 }) => a.x0 < x1 && a.x1 > x0 && a.y0 < y1 && a.y1 > y0)(boxOf(o.art, o.x, o.y))); };
  const clear = (x, y, r, gap = r, h = 0, art = null) => !(art && overlapsArt(art, x, y)) && !inBorder(x, y, r * 0.5) && !W.inYard(x, y - h, r) && !nearCliff(x, y, r) && !nearRamp(x, y, r) && !nearRoad(x, y, r) && !inLake(x, y, r * 0.8) && !nearRiver(x, y, r * 0.8 + 20) && [...W.cities, ...W.camps, ...(W.nodes || [])].every(c => Math.hypot(c.x - x, c.y - y) > r + 160) && !nearCapital(x, y - h, r) &&
    out.every(o => Math.hypot(o.x - x, (o.y - (o.h || 0)) - (y - h)) > (o.r || 0) * (gap / r) + gap);
  // 地圖外圍一圈岩壁（擋路，不畫圖；岩壁畫在地面上，js/world/world-ground.js）：四邊各一條長方形
  const B = W.BORDER = 150, { w: MW, h: MH } = W.size;
  // 外圍高崖用 PixelLab 的圖塊鋪（assets/world/cliff_*.png，js/scenes/world.js 的 cliffTiles）：
  //   北邊 cliff_n 貼在 y = 0，崖腳在 y ≈ 130；東西 cliff_w / cliff_e 貼在最邊上，崖面外緣在 40px；南邊 cliff_s 貼在最下面
  //   擋路：北邊擋到 y 152（要比北崖的排序線 140 低，不然人被岩壁蓋住、看起來走進山裡），東西擋 74px，南邊擋最下面 50px
  //   東西南三邊再往內多擋馬身的一半（約 30px）：錨點在馬蹄中間，以前停在 46px 時半匹馬插進岩壁裡
  out.push({ art: 'border', hidden: true, x: MW / 2, y: 152, fw: MW + 200, fh: 316 }, { art: 'border', hidden: true, x: MW / 2, y: MH + 100, fw: MW + 200, fh: 150 },
    { art: 'border', hidden: true, x: -4, y: MH + 100, fw: 156, fh: MH + 300 }, { art: 'border', hidden: true, x: MW + 4, y: MH + 100, fw: 156, fh: MH + 300 });
  // 山脈：沿稜線排兩三層、互相疊著，看起來是一整片山
  const ridges = [[[120, 225], [975, 570]], [[5400, 180], [6060, 900]], [[120, 3375], [1200, 3750]], [[4950, 3720], [6060, 3450]],
    [[5925, 1200], [6090, 2250]], [[90, 1650], [300, 2850]], [[3675, 2250], [3900, 2850]], [[1725, 1050], [1950, 1425]]];
  for (const [[ax, ay], [bx, by]] of ridges) for (let t = 0; t <= 1; t += 0.05) for (let row = 0; row < 2; row++) {
    const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny), off = (row - 0.5) * 70 + (rnd() - 0.5) * 50;
    const x = ax + (bx - ax) * t + nx / nl * off + (rnd() - 0.5) * 40, y = ay + (by - ay) * t + ny / nl * off + (rnd() - 0.5) * 40, k = 1 + Math.floor(rnd() * 3);
    const fw = [110, 84, 140][k - 1], fh = [34, 32, 40][k - 1];
    if (clear(x, y, 60, 44, 35, 'mountain' + k)) out.push({ art: 'mountain' + k, src: `assets/world/mountain${k}.png`, x: Math.round(x), y: Math.round(y), fw, fh, r: 60, h: 35, flip: rnd() < 0.5 });
  }
  // 村落、農田、水田、推車（PixelLab 的圖 assets/world/prop_*.png）：沿著路邊散落，田在村子離路遠的那一側。
  //   田、水田平貼在地上（flat，畫在最底下、不擋路）；水田只放南半邊（北邊冷）；雪原不放
  const prop = n => `assets/world/prop_${n}.png`;
  const roadPts = W.roads.flatMap(p => G.U.smooth(p, 40));
  for (let i = 0; i < 80; i++) {
    const k = 1 + Math.floor(rnd() * (roadPts.length - 2)), [x0, y0] = roadPts[k], [x1, y1] = roadPts[k + 1];
    const l = Math.hypot(x1 - x0, y1 - y0) || 1, side = rnd() < 0.5 ? -1 : 1, nx = -(y1 - y0) / l * side, ny = (x1 - x0) / l * side, ax = (x1 - x0) / l, ay = (y1 - y0) / l;
    const hx = x0 + nx * 110, hy = y0 + ny * 110 + 30;
    if (inSnow0(hx, hy) || !clear(hx, hy, 60, 90, 30, 'hamlet')) continue;
    out.push({ art: 'hamlet', src: prop('hamlet'), x: Math.round(hx), y: Math.round(hy), fw: 72, fh: 24, r: 60, h: 30, flip: rnd() < 0.5 });
    // 田：村子後面（離路更遠）一塊，有時旁邊再一塊
    for (const [fx, fy] of [[hx + nx * 120, hy + ny * 110 + 20], [hx + ax * 150 + nx * 40, hy + ay * 150 + ny * 40 + 20], [hx - ax * 150 + nx * 40, hy - ay * 150 + ny * 40 + 20], [hx + nx * 220, hy + ny * 200 + 20]]) {   // 村子後面、左右、更後面，被擋住的就跳過
      const paddy = fy > 1700 && rnd() < 0.6;
      if (rnd() < 0.3 || inSnow0(fx, fy) || !clear(fx, fy, 64, 30, 40, paddy ? 'paddy' : 'field')) continue;
      out.push({ art: paddy ? 'paddy' : 'field', src: prop(paddy ? 'paddy' : 'field'), x: Math.round(fx), y: Math.round(fy), r: 64, h: 40, flat: true, flip: rnd() < 0.5 });
    }
    // 推車：村子跟路中間
    if (rnd() < 0.6) { const cx = hx - nx * 55 + ax * (rnd() - 0.5) * 60, cy = hy - ny * 55 - 20; if (!nearRoad(cx, cy, 16) && !overlapsArt('cart', cx, cy, 'hamlet')) out.push({ art: 'cart', src: prop('cart'), x: Math.round(cx), y: Math.round(cy), fw: 30, fh: 10, r: 24, flip: rnd() < 0.5 }); }
  }
  // 路邊的瞭望塔、小神龕：貼著路邊（塔擋路、神龕不擋）
  for (let i = 0; i < 60; i++) {
    const k = 1 + Math.floor(rnd() * (roadPts.length - 2)), [x0, y0] = roadPts[k], [x1, y1] = roadPts[k + 1];
    const l = Math.hypot(x1 - x0, y1 - y0) || 1, side = rnd() < 0.5 ? -1 : 1, x = x0 - (y1 - y0) / l * side * 46, y = y0 + (x1 - x0) / l * side * 46 + 10;
    const tower = rnd() < 0.45;
    if (inSnow0(x, y) || out.some(o => (o.art === 'watchtower' || o.art === 'shrine') && Math.hypot(o.x - x, o.y - y) < 400) || !clear(x, y, 26, 26, tower ? 40 : 20, tower ? 'watchtower' : 'shrine')) continue;   // 塔、神龕彼此隔 400px
    out.push(tower ? { art: 'watchtower', src: prop('watchtower'), x: Math.round(x), y: Math.round(y), fw: 26, fh: 10, r: 30, h: 40, flip: rnd() < 0.5 }
      : { art: 'shrine', src: prop('shrine'), x: Math.round(x), y: Math.round(y), r: 30, h: 20, flip: rnd() < 0.5 });
  }
  // 大石堆：空地上（擋路）
  for (let i = 0; i < 40; i++) {
    const x = 160 + rnd() * (W.size.w - 320), y = 260 + rnd() * (W.size.h - 380);
    if (!clear(x, y, 46, 60, 22, 'rockpile')) continue;
    out.push({ art: 'rockpile', src: prop('rocks'), x: Math.round(x), y: Math.round(y), fw: 70, fh: 22, ellipse: true, r: 46, h: 22, flip: rnd() < 0.5, tint: inSnow0(x, y) ? 0xc8d8e2 : undefined });
  }
  // 蘆葦：沿著河岸、湖岸一叢一叢（不擋路）
  for (const pts of riverPts) for (let i = 4; i < pts.length - 4; i += 3) {
    if (rnd() < 0.55) continue;
    const [x, y] = pts[i], [bx, by] = pts[i + 1], l = Math.hypot(bx - x, by - y) || 1, side = rnd() < 0.5 ? -1 : 1;
    const rx = x - (by - y) / l * side * (34 + rnd() * 10), ry = y + (bx - x) / l * side * (34 + rnd() * 10) + 6;
    if (inSnow0(rx, ry) || inLake(rx, ry, 10) || nearRoad(rx, ry, 40) || inBorder(rx, ry, 0)) continue;
    out.push({ art: 'reeds', src: prop('reeds'), x: Math.round(rx), y: Math.round(ry), r: 14, flip: rnd() < 0.5 });
  }
  for (const lk of W.lakes) for (let a = 0; a < Math.PI * 2; a += 0.22) {
    if (rnd() < 0.45) continue;
    const x = lk.x + Math.cos(a) * lk.rx * 1.12, y = lk.y + Math.sin(a) * lk.ry * 1.12 + 8;
    if (inSnow0(x, y) || nearRoad(x, y, 40) || inBorder(x, y, 0)) continue;
    out.push({ art: 'reeds', src: prop('reeds'), x: Math.round(x), y: Math.round(y), r: 14, flip: rnd() < 0.5 });
  }
  // 森林：一片一片（每片 2～5 叢疊在一起）
  for (let i = 0; i < 110; i++) {
    const cx = 120 + rnd() * (W.size.w - 240), cy = 160 + rnd() * (W.size.h - 260), n = 2 + Math.floor(rnd() * 5);
    for (let j = 0; j < n; j++) {
      const x = cx + (rnd() - 0.5) * 220, y = cy + (rnd() - 0.5) * 110;
      if (clear(x, y, 60, 34, 45, 'forest2')) out.push({ art: 'forest2', src: 'assets/world/forest2.png', x: Math.round(x), y: Math.round(y), r: 50, h: 45, flip: rnd() < 0.5, fw: 104, fh: 40, ellipse: true, tint: inSnow0(x, y) ? 0xc8d8e2 : undefined });   // 森林擋路
    }
  }
  // 零星的樹（擋路）、石堆（擋路，數量少）
  for (let i = 0; i < 150; i++) {
    const x = 60 + rnd() * (W.size.w - 120), y = 80 + rnd() * (W.size.h - 120), f = rnd();
    const art = f < 0.5 ? 'pine' : 'oak';   // 圓形灌木（bush）不放了，太突兀
    if (clear(x, y, 24, 20, 50, art)) out.push({ art, src: `assets/map/${art}.png`, x: Math.round(x), y: Math.round(y), r: 20, h: 50, flip: rnd() < 0.5, tint: inSnow0(x, y) ? 0xc8d8e2 : undefined, ...(art === 'bush' ? {} : { fw: 16, fh: 10, ellipse: true }) });   // 樹幹擋路、灌木不擋
  }
  for (let i = 0; i < 30; i++) {
    const x = 80 + rnd() * (W.size.w - 160), y = 100 + rnd() * (W.size.h - 160);
    if (clear(x, y, 40, 30, 18, 'rocks')) out.push({ art: 'rocks', src: 'assets/map/rocks.png', x: Math.round(x), y: Math.round(y), fw: 34, fh: 14, r: 30, h: 18, flip: rnd() < 0.5 });
  }
  // 伐木場：森林旁邊堆著木頭、樹樁（擋路）
  for (const f of out.filter(o => o.art === 'forest2')) {
    if (rnd() < 0.8) continue;
    const x = f.x + (rnd() - 0.5) * 120, y = f.y + 50 + rnd() * 30;
    if (inSnow0(x, y) || !clear(x, y, 34, 24, 20, 'logs')) continue;
    out.push({ art: 'logs', src: prop('logs'), x: Math.round(x), y: Math.round(y), fw: 60, fh: 16, r: 34, h: 20, flip: rnd() < 0.5 });
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
      const [x, y] = W.highlandEdge(h, i, t), south = Math.sin(t) > 0;
      if (south && rampAt.some(([rx, ry]) => Math.abs(x - rx) < 44 && Math.abs(y - ry) < 50)) continue;   // 斜坡圖中間的路（約 50px 寬）
      // 南半圈的岩壁有 CLIFF 那麼高：疊三排擋住整面岩壁（以前只有一排在中下段，從斜坡走到一半往旁邊走就能站上岩石）
      if (south) for (const dy of [16, 38, 60]) out.push({ art: 'cliff', hidden: true, ellipse: true, x: Math.round(x), y: Math.round(y + dy), fw: 36, fh: 30 });
      else out.push({ art: 'cliff', hidden: true, ellipse: true, x: Math.round(x), y: Math.round(y + 12), fw: 36, fh: 30 });
    }
  });
  // 湖泊擋路：橢圓形的障礙（不畫圖，湖面畫在地面上）
  for (const l of W.lakes) out.push({ art: 'lake', hidden: true, ellipse: true, x: l.x, y: l.y + l.ry, fw: l.rx * 2, fh: l.ry * 2 });
  // 城池、營地本身也擋路（只能站到城門前）
  for (const c of W.cities) out.push({ art: c.art, src: `assets/world/${c.art}.png`, x: c.x, y: c.y, fw: c.capital ? 400 : c.art === 'castle_white' ? 130 : 116, fh: c.capital ? 330 : 46, city: c.id });   // 王都的圖很大，整座城都擋（不然從後面走進城裡）
  for (const c of W.camps) out.push({ art: 'bandit_camp', src: 'assets/world/bandit_camp.png', x: c.x, y: c.y, fw: 70, fh: 26, camp: c.id });
  // 採集點：礦坑、礦脈是石堆（鐵灰、精鋼偏藍），獵場是堆著的木頭和獸皮架（伐木場的圖）
  for (const n of W.nodes) out.push({ art: n.kind === 'leather' ? 'logs' : 'rockpile', src: n.kind === 'leather' ? prop('logs') : prop('rocks'), x: n.x, y: n.y, fw: 60, fh: 16, r: 40, h: 22, node: n.id,
    tint: n.kind === 'steel' ? 0x9fb8d8 : n.kind === 'iron' ? 0xb0a090 : undefined });
  // 道路在 js/world/world-ground.js 畫成平滑的泥土路，這裡不用地磚
  G.TOWNS.world = { roads: [], dirt: [], buildings: out };
})();
