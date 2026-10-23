/* ============ sim.js — 戰鬥模擬（不碰畫面）：場景、指揮官、武將、兵團、物理、勝負 ============
 * 同一份程式在兩個地方跑：
 *   - 瀏覽器（單人戰鬥）：js/game.js 每幀呼叫 update()，自己畫
 *   - 伺服器（同場戰鬥）：server/src/battle-host.js 每 50ms 呼叫 update()，把狀態送給各玩家的瀏覽器畫
 * 指揮官（commander）：每個玩家一個，帶自己的武將、隨身兵團（一次上場一支，其他在後備 reserve）、配置兵團。
 *   c = { id, team, name, hero, input: { down(code), pressed(code) }, select, reserve, supplyCd, supplyOpen, bonus }
 *   沒有玩家指揮官的一方由電腦指揮（敵將 + 兵團）。
 * 對畫面的通知走 api.onNotify(c, text)（c 是 null 表示所有人）、api.onEnd(result)，由外面接。
 * 視覺特效照舊呼叫 G.FX（伺服器上會換成記錄事件、轉送給瀏覽器）。
 */
G.Battle = (() => {
  const W = () => G.CONFIG.world;
  let heroes = [], squads = [], timers = [], cmdrs = [];
  let thinkT = 0, result = null, scenario = null, demo = false;
  const api = { time: 0, onNotify: () => {}, onEnd: () => {} };

  /* ---------- 場景 ---------- */
  // 攻城、守城共用的城堡：城門、兩段可破壞城牆、依序佔領的三個據點
  const CASTLE = {
    wallY: 640, gateX: 1280, gateHp: 1400, towers: [420, 2140],
    walls: [{ x: 700, w: 84 }, { x: 1880, w: 84 }], town: 'castle',   // town：城內的建築與道路（js/data/town.js）
    points: [{ name: '外城', x: 760, y: 480 }, { name: '內城', x: 1800, y: 420 }, { name: '主堡', x: 1280, y: 230 }],
  };
  // supply：補給點（武將站上去按 T 換隨身兵團）；deploy：配置兵團開戰時擺的位置（依序放）
  const SCENARIOS = {
    field: {
      name: '野戰', desc: '平原遭遇戰，擊敗敵方武將與所有兵團。', seed: 7,
      size: { w: 1760, h: 1120 },   // 野戰比攻城小，兩軍很快就碰面
      player: { x: 360, y: 575, face: 0 },
      supply: [{ x: 205, y: 575 }],
      // 地形：樹林（移動變慢、遠程傷害 ×0.6）、高地（站在上面的遠程 ×1.2）
      terrain: [{ kind: 'forest', x: 810, y: 265, r: 150 }, { kind: 'forest', x: 790, y: 880, r: 135 }, { kind: 'hill', x: 910, y: 575, r: 110 }],
      deploy: [{ x: 525, y: 450 }, { x: 525, y: 700 }, { x: 605, y: 575 }, { x: 440, y: 320 }, { x: 440, y: 825 }, { x: 360, y: 435 }],
      enemyHero: { weapon: 'glaive', x: 1410, y: 560 },
      enemies: [
        { type: 'pikeman', x: 1170, y: 490 }, { type: 'shieldman', x: 1170, y: 630 },
        { type: 'archer', x: 1305, y: 560 }, { type: 'cavalry', x: 1340, y: 365 },
      ],
      timeLimit: 0,
    },
    siege: {
      name: '攻城戰', desc: '用衝車撞開城門或打穿城牆、搭雲梯爬上城，依序佔領外城 → 內城 → 主堡（B 指派兵團操作器械）。', seed: 11,
      castle: { ...CASTLE, defender: 1 },
      // 三台衝車：中間撞城門，兩側對著可破壞的城牆段（x 700、1880）
      siege: [{ kind: 'ram', team: 0, x: 1280, y: 1260 }, { kind: 'ram', team: 0, x: 700, y: 1260 }, { kind: 'ram', team: 0, x: 1880, y: 1260 },
        { kind: 'ladder', team: 0, x: 1110, y: 1320 }, { kind: 'ladder', team: 0, x: 1450, y: 1320 }],
      player: { x: 1280, y: 1400, face: -Math.PI / 2 },
      supply: [{ x: 1280, y: 1520 }],   // 攻城時佔下的據點也是補給點
      terrain: [{ kind: 'forest', x: 420, y: 1150, r: 190 }, { kind: 'forest', x: 2150, y: 1150, r: 190 }, { kind: 'hill', x: 1280, y: 1000, r: 120 }],
      deploy: [{ x: 1000, y: 1180 }, { x: 1560, y: 1180 }, { x: 760, y: 1260 }, { x: 1800, y: 1260 }, { x: 1120, y: 1100 }, { x: 520, y: 1300 }],
      enemyHero: { weapon: 'glaive', x: 1280, y: 360 },
      enemySupply: [{ x: 1280, y: 300 }],   // 守方玩家（同場戰鬥）的補給點
      enemies: [
        { type: 'archer', x: 1050, y: 555 }, { type: 'archer', x: 1510, y: 555 },
        { type: 'shieldman', x: 1280, y: 545 }, { type: 'pikeman', x: 1280, y: 470 },
        { type: 'cavalry', x: 1280, y: 330 }, { type: 'pikeman', x: 1800, y: 420 },
      ],
      timeLimit: 600,
    },
    defend: {
      name: '守城・出城', desc: '守住三個據點。敵方會推衝車、搭雲梯（搭上就拆不掉，要守住梯頂），按 G 開關城門出城迎擊。主堡被佔領或武將陣亡就失敗。', seed: 23,
      castle: { ...CASTLE, defender: 0 },
      siege: [{ kind: 'ram', team: 1, x: 1280, y: 1020 }, { kind: 'ladder', team: 1, x: 1520, y: 1060 }],
      player: { x: 1280, y: 480, face: Math.PI / 2 },
      supply: [{ x: 1280, y: 300 }],
      terrain: [{ kind: 'forest', x: 520, y: 1200, r: 200 }, { kind: 'forest', x: 2060, y: 1200, r: 200 }],
      deploy: [{ x: 1050, y: 570 }, { x: 1510, y: 570 }, { x: 760, y: 560 }, { x: 1800, y: 540 }, { x: 1280, y: 420 }, { x: 2000, y: 560 }],
      enemyHero: { weapon: 'sword', x: 1280, y: 1350 },
      enemySupply: [{ x: 1280, y: 1450 }],
      enemies: [
        { type: 'shieldman', x: 1180, y: 1120 }, { type: 'pikeman', x: 1380, y: 1120 },
        { type: 'archer', x: 1100, y: 1250 }, { type: 'archer', x: 1460, y: 1250 },
        { type: 'pikeman', x: 900, y: 1150 }, { type: 'shieldman', x: 1660, y: 1150 },
        { type: 'cavalry', x: 1800, y: 1200 },
      ],
      timeLimit: 0,
    },
    stress: {
      name: '大軍測試', desc: '效能測試：雙方合計約 2000 人自動交戰，按 F3 看 fps。不計入名冊。', seed: 31, test: true,
      player: { x: 560, y: 800, face: 0 },
      enemyHero: { weapon: 'glaive', x: 1950, y: 800 },
      enemies: [],
      army: 2000,   // 開戰後雙方輪流補 50 人的兵團，直到全場總人數到這個數字；我方補的兵團由電腦指揮
      timeLimit: 0,
    },
  };

  /** 攻打大地圖上的城池：攻城戰場景，守將與守軍照 G.WORLD 的設定；name 是畫面上的城名 */
  const SIEGE_SLOTS = [[1050, 555], [1510, 555], [1280, 545], [1280, 470], [1280, 330], [1800, 420], [760, 470], [2050, 470], [520, 470]];
  function cityScenario(cityId, name) {
    const c = G.WORLD.cities.find(c => c.id === cityId);
    return { ...SCENARIOS.siege, base: 'siege', name: `攻打${name || c.name}`, desc: c.lord, city: c.id, enemyLevel: Math.min(9, 1 + Math.round(c.gold / 150)),   // 守軍老兵等級：越遠、越難打的城越高
      enemyHero: { weapon: c.hero, x: 1280, y: 360, name: c.lord },
      enemies: c.garrison.map(([type, men], i) => ({ type, men, x: SIEGE_SLOTS[i % SIEGE_SLOTS.length][0], y: SIEGE_SLOTS[i % SIEGE_SLOTS.length][1] })) };
  }
  /** 大地圖上的野戰（強盜、北境軍、商隊）：野戰地圖，敵方兵團照 members [[兵種, 人數]] 排在固定位置；hero 是敵將（null 沒有） */
  const FIELD_SLOTS = [[1170, 490], [1170, 630], [1305, 560], [1340, 365], [1340, 755], [1065, 560]];
  function fieldScenario(name, hero, members, enemyLevel) {
    return { ...SCENARIOS.field, base: 'field', name, enemyHero: hero, enemyLevel,
      enemies: members.map(([type, men], i) => ({ type, men, x: FIELD_SLOTS[i % FIELD_SLOTS.length][0], y: FIELD_SLOTS[i % FIELD_SLOTS.length][1] })) };
  }
  /** 大地圖上兩個玩家對決：野戰地圖，兩邊都是玩家（沒有電腦兵團），各有一個補給點 */
  function duelScenario(a, b) {
    return { ...SCENARIOS.field, base: 'field', duel: true, name: `對決：${a} vs ${b}`, desc: '擊敗對手的武將與兵團。', enemies: [],
      enemySupply: [{ x: 1555, y: 560 }] };
  }

  /** 場景有自己的大小（野戰較小）就換掉戰場大小；要在 G.useScale('battle') 之後呼叫 */
  const applySize = sc => { if (sc.size) G.CONFIG.world = { ...G.CONFIG.world, ...sc.size }; };
  /** 出生點、器械、據點附近不放石頭（瀏覽器畫地圖時也用同一份） */
  const fieldAvoid = sc => [sc.player, sc.enemyHero, ...sc.enemies, ...(sc.siege || []), ...(sc.supply || []), ...(sc.enemySupply || []), ...(sc.deploy || []), ...(sc.flags || []), ...(sc.castle ? sc.castle.points : [])].filter(Boolean);   // 旗點、補給點旁邊不放石牆、山脊

  const notify = (c, text) => api.onNotify(c, text);
  /** 通知某一方的所有玩家指揮官 */
  const notifyTeam = (team, text) => { for (const c of cmdrs) if (c.team === team) notify(c, text); };

  /**
   * 開戰。o：{ scenario: 場景物件, demo, commanders: [{ id, team, name, weapon, equip, look, heroLevel, squads, field, fieldOrder, input }] }
   *   squads：隨身兵團 [{ id, type, men, level, mods }]（開場對戰給兵種字串，全部上場）；field：配置兵團
   *   attrs、mastery、skills：武將屬性點、這把武器的專精經驗、選的技能（G.Army.heroSpec）
   */
  function setup(o) {
    scenario = o.scenario; demo = !!o.demo;
    heroes = []; squads = []; timers = []; cmdrs = []; unitCache = null; result = null; api.time = 0; thinkT = 0; nid = 1; api.capturedBy = null;
    // 部署階段（design.md 26）：攻城、守城、野戰開打前幾秒，電腦不動、玩家只能在自己這一側擺兵和放器械
    api.deployT = api.deployLen = demo || scenario.test ? 0 : scenario.castle ? G.SIEGE.deploy.time : G.SIEGE.deploy.fieldTime;
    // 天氣（design.md 30）：晴 60%、雨 25%（火箭、火雨點不著，火槍受潮）、霧 15%（遠程射程 ×0.75）；開場畫面、大軍測試固定晴天
    api.flags = (scenario.flags || []).map(f => ({ ...f, owner: -1, progress: 0 })); api.flagScore = [0, 0];   // 搶旗模式的旗點
    api.weather = scenario.weather || (demo || scenario.test ? 'clear' : (r => r < 0.6 ? 'clear' : r < 0.85 ? 'rain' : 'fog')(Math.random()));
    G.Combat.reset();
    applySize(scenario);
    G.Map.setupCastle(scenario.castle || null);
    G.Map.setupField(scenario.seed || 1, fieldAvoid(scenario), scenario.terrain || []);
    G.Siege.reset(scenario.siege);
    const byTeam = [0, 0];
    for (const spec of o.commanders) addCommander(spec, byTeam[spec.team]++);
    // 沒有玩家的一方：電腦敵將與兵團
    const eh = scenario.enemyHero, p = scenario.player;
    if (eh && !byTeam[1] && !scenario.duel) {   // 對決兩邊都是玩家，不放電腦武將
      const h = new G.Hero(1, eh.weapon, {}, eh.x, eh.y); h.face = Math.PI - (p.face || 0); h.name = eh.name || '敵將'; tag(h); heroes.push(h); }
    const enemies = demo ? [...scenario.enemies, ...scenario.enemies.slice(0, 2).map(e => ({ ...e, x: e.x + (p.x < e.x ? 140 : -140) }))] : scenario.enemies;
    // 電腦兵團依難度帶老兵等級和技能（scenario.enemyLevel；演習 2 級）：老兵點兩條分支輪流點
    const elv = demo || scenario.test ? 1 : scenario.enemyLevel || 2;
    for (const e of enemies) {
      const face = Math.atan2(p.y - e.y, p.x - e.x), pts = elv - 1, vet = [Math.ceil(pts / 2), Math.floor(pts / 2)];
      const mods = elv > 1 && G.Army ? G.Army.modsOf(e.type, vet) : {};
      addSquad(new G.Squad(1, e.type, e.x, e.y, face, { cmd: 'hold', count: e.men, level: elv, mods, label: elv > 1 ? `${G.UNITS[e.type].name} Lv${elv}` : undefined }));
    }
    if (scenario.army) spawnArmy(scenario.army);
    if (demo) for (const s of squads) s.cmd = 'attack';
  }

  /* ---------- 指揮官 ---------- */
  let nid = 1;   // 每個單位一個編號（同場戰鬥用來對應瀏覽器上的畫面物件）
  const tag = u => { u.nid = nid++; return u; };
  function addSquad(sq) { for (const u of sq.units) tag(u); sq.nid = nid++; squads.push(sq); unitCache = null; return sq; }

  /** 出生點：攻方（team 0）在 scenario.player，守方在 scenario.enemyHero；同一方的第 k 個玩家往旁邊排 */
  function spawnOf(team, k) {
    const base = team === 0 ? scenario.player : { ...scenario.enemyHero, face: Math.PI - (scenario.player.face || 0) };
    const face = base.face || 0, side = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 90;
    return { x: base.x + Math.cos(face + Math.PI / 2) * side, y: base.y + Math.sin(face + Math.PI / 2) * side, face };
  }
  function addCommander(spec, k) {
    const team = spec.team || 0, p = spawnOf(team, k);
    const h = tag(new G.Hero(team, spec.weapon, spec.equip || {}, p.x, p.y, spec.heroLevel || 1, { attrs: spec.attrs, mastery: spec.mastery, skills: spec.skills }));
    h.face = p.face; h.look = G.SPRITE_META && G.SPRITE_META[spec.look] ? spec.look : null; h.name = spec.name || '主帥';
    const c = { id: spec.id, uid: spec.uid, local: !!spec.local, team, name: h.name, hero: h, input: spec.input || NO_INPUT, select: 'all', reserve: [], supplyCd: 0, supplyOpen: false, group: 'escort',
      bonus: { atk: h.stats.squadAtk, speed: h.stats.squadSpeed, armor: h.stats.squadArmor }, kills0: 0,
      kit: G.SIEGE.deploy.kits[scenario.castle && scenario.castle.defender !== team ? 'attack' : 'defend'], kitSel: 0, kitLeft: G.SIEGE.deploy.perPlayer, lane: 0, ready: false };   // 可放置的器械（Y 放、U 換）
    h.cmdr = c;
    heroes.push(h); cmdrs.push(c);
    // 糧草、疲勞（design.md 32）：糧草充足（≥100 份）攻擊 +5%；斷糧攻擊 -10%、兵團開場士氣 60；
    //   疲勞（0～100，大地圖上一直行軍會累積）每點攻擊 -0.15%、移速 -0.1%、開場士氣 -0.3、武將耐力 -0.3%
    if (spec.food !== undefined) {
      const starve = spec.food <= 0, fat = G.U.clamp(spec.fatigue || 0, 0, 100);
      c.bonus.atk += (starve ? -10 : spec.food >= 100 ? 5 : 0) - Math.round(fat * 0.15);
      c.bonus.speed -= Math.round(fat * 0.1);
      c.startMorale = Math.round((starve ? 60 : 100) - fat * 0.3);
      h.staminaMax = Math.round(h.staminaMax * (1 - fat * 0.003)); h.stamina = h.staminaMax;
      const tips = [starve ? '斷糧：攻擊 -10%、士氣低落' : spec.food >= 100 ? '糧草充足：攻擊 +5%' : '', fat >= 20 ? `行軍疲勞 ${Math.round(fat)}%：攻擊、移速、士氣下降` : ''].filter(Boolean);
      if (tips.length) later(1.5, () => notify(c, tips.join('；')));
    }
    // 隨身兵團：開場對戰全部上場，其他只上場第一支，其餘進後備
    const escort = (spec.squads || []).map(s => typeof s === 'string' ? { type: s } : s);
    c.reserve = demo ? [] : escort.slice(1).map(s => ({ ...s, kills: 0 }));
    (demo ? escort : escort.slice(0, 1)).forEach((s, i) => {
      const side = i % 2 === 0 ? -1 : 1, back = 60 + Math.floor(i / 2) * 110;   // 兩隊一排，多的往後排
      spawnEscort(c, s, p.x - Math.cos(p.face) * back + Math.cos(p.face + Math.PI / 2) * 50 * side,
        p.y - Math.sin(p.face) * back + Math.sin(p.face + Math.PI / 2) * 50 * side, p.face, side, Math.floor(i / 2));
    });
    // 配置兵團：擺在配置點，由電腦指揮，玩家只能切換進攻／防守（H）
    const deploy = team === 0 ? scenario.deploy || [p] : (scenario.enemies.length ? scenario.enemies : [p]);
    (spec.field || []).forEach((s, i) => {
      const at = deploy[(i + k * 2) % deploy.length], lv = s.level || 1;
      const sq = new G.Squad(team, s.type, at.x + (team ? 40 : 0), at.y, p.face, { cmd: 'hold', bonus: c.bonus, count: s.men, level: lv, mods: s.mods, label: `配置・${G.UNITS[s.type].name}${lv > 1 ? ` Lv${lv}` : ''}` });
      Object.assign(sq, { ai: true, field: true, order: spec.fieldOrder === 'attack' ? 'attack' : 'defend', rosterId: s.id, owner: c, leader: h });
      if (c.startMorale !== undefined) sq.morale = c.startMorale;
      addSquad(sq);
    });
    return c;
  }
  const NO_INPUT = { down: () => false, pressed: () => false };
  /** 開戰後才加入的玩家（同場戰鬥）：排在同一方已有玩家的旁邊 */
  function join(spec) {
    const team = spec.team || 0, ai = heroes.some(h => !h.cmdr && h.team === team) ? 1 : 0;   // 電腦武將站在原位，玩家排旁邊
    const c = addCommander(spec, cmdrs.filter(o => o.team === team).length + ai); unitCache = null; return c;
  }
  /** 玩家離開戰場（撤退、斷線太久）：武將和兵團一起撤出 */
  function leave(c) {
    for (const sq of squads) if (sq.owner === c && sq.crew) G.Siege.release(sq.crew);
    heroes = heroes.filter(h => h !== c.hero); squads = squads.filter(s => s.owner !== c); cmdrs = cmdrs.filter(o => o !== c);
    unitCache = null;
  }

  /** 隨身兵團上場；側邊 side、排數 row 決定跟隨時的位置 */
  function spawnEscort(c, s, x, y, face, side = -1, row = 0) {
    const lv = s.level || 1;
    const sq = new G.Squad(c.team, s.type, x, y, face, { cmd: 'follow', bonus: c.bonus, count: s.men, level: lv, mods: s.mods, label: `隨身・${G.UNITS[s.type].name}${lv > 1 ? ` Lv${lv}` : ''}` });
    sq.followSide = 46 * side; sq.followOffset = 20 + row * 70; sq.rosterId = s.id; sq.kills = s.kills || 0;
    sq.owner = c; sq.leader = c.hero;
    if (c.startMorale !== undefined) sq.morale = c.startMorale;   // 斷糧、疲勞：開場士氣比較低
    return addSquad(sq);
  }
  /** 這個指揮官能下指令的兵團（隨身兵團；配置兵團由電腦指揮） */
  const squadsOfCmdr = c => squads.filter(s => s.owner === c && !s.ai);

  /* ---------- 補給點：換隨身兵團 ---------- */
  /** 某一方的補給點：場景給的，加上攻城時攻方已經佔下的據點 */
  function supplyPoints(team = 0) {
    const c = G.Map.castle, list = [...((team === 0 ? scenario.supply : scenario.enemySupply) || [])];
    if (c && c.defender !== team) for (const p of c.points) if (p.taken) list.push(p);
    return list;
  }
  const nearSupply = c => !c.hero.dead && supplyPoints(c.team).find(s => Math.hypot(c.hero.x - s.x, c.hero.y - s.y) < 70);
  /** 換成後備的第 i 支：目前上場的帶著戰損回後備，新的從補給點出發 */
  function swapEscort(c, i) {
    const pick = c.reserve.filter(r => r.men > 0)[i], at = nearSupply(c);
    if (!pick || !at) return;
    if (c.supplyCd > 0) return notify(c, `換兵冷卻中（${Math.ceil(c.supplyCd)} 秒）`);
    for (const cur of squadsOfCmdr(c)) {
      if (cur.crew) G.Siege.release(cur.crew);
      squads = squads.filter(s => s !== cur);
      c.reserve.push({ id: cur.rosterId, type: cur.typeKey, men: cur.alive.length, level: cur.level, mods: cur.mods, kills: cur.kills });
      for (const u of cur.alive) G.FX.dust(u.x, u.y, 1);
    }
    c.reserve = c.reserve.filter(r => r !== pick);
    const sq = spawnEscort(c, pick, at.x, at.y + 20, c.hero.face);
    G.FX.ring(at.x, at.y, 50, 'rgba(255,220,150,0.9)', 0.6);
    c.supplyCd = 15; c.supplyOpen = false; c.select = 'all'; unitCache = null;
    notify(c, `${sq.label.replace(/^(隨身|配置)・/, '')} 上場`);
  }

  /** 大軍測試：雙方輪流補 50 人兵團（四兵種輪替），我方在左、敵方在右，直到全場總人數到 n */
  function spawnArmy(n) {
    const types = ['pikeman', 'shieldman', 'archer', 'cavalry'], total = () => squads.reduce((a, s) => a + s.units.length, 0);
    for (let i = 0; total() < n; i++) {
      const team = i % 2, col = Math.floor(i / 2) % 6, y = 200 + ((i * 97) % 1200);
      const x = team ? 1500 + col * 60 : 700 - col * 60, cmdPoint = { x: team ? 700 : 1500, y };
      const sq = new G.Squad(team, types[(i >> 1) % 4], x, y, team ? Math.PI : 0, { cmd: 'attack', count: 50 });
      sq.cmdPoint = cmdPoint; sq.army = true;   // army：電腦指揮時一直往敵人推進（見 G.AI.think）
      if (team === 0) sq.ai = true;              // ai：我方補的兵團由電腦指揮，不算玩家的兵團
      addSquad(sq);
    }
  }

  /* ---------- 查詢工具（給 AI、技能用） ----------
   * 單位清單每幀只組一次（unitCache）；空間網格 64px 一格、依陣營分開，找敵人時只掃對方的格子。
   */
  const CELL = 6, GW = () => (W().w >> CELL) + 1, GH = () => (W().h >> CELL) + 1;
  let unitCache = null, grids = [[], []];
  function allUnits() {
    if (unitCache) return unitCache;
    const a = []; for (const s of squads) for (const u of s.units) a.push(u); for (const h of heroes) a.push(h);
    return unitCache = a;
  }
  function rebuildGrid() {
    const n = GW() * GH();
    for (const g of grids) { if (g.length !== n) { g.length = 0; for (let i = 0; i < n; i++) g.push([]); } else for (const c of g) c.length = 0; }
    for (const u of allUnits()) if (!u.dead) grids[u.team][(u.y >> CELL) * GW() + (u.x >> CELL)].push(u);
  }
  function forCells(g, x, y, r, fn) {
    const w = GW(), x0 = Math.max(0, (x - r) >> CELL), x1 = Math.min(w - 1, (x + r) >> CELL), y0 = Math.max(0, (y - r) >> CELL), y1 = Math.min(GH() - 1, (y + r) >> CELL);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) for (const u of g[gy * w + gx]) fn(u);
  }
  function forNear(x, y, r, fn) { for (const g of grids) forCells(g, x, y, r, fn); }
  function forEachFoe(team, x, y, r, fn) {
    forCells(grids[1 - team], x, y, r, u => { if (!u.dead && Math.hypot(u.x - x, u.y - y) <= r + (u.radius || 6)) fn(u); });
  }
  /** 由近到遠一圈一圈掃對方的格子；下一圈不可能比目前找到的更近就停 */
  function nearestFoe(team, x, y, r) {
    const g = grids[1 - team], w = GW(), h = GH(), cx = x >> CELL, cy = y >> CELL;
    const rings = Math.min(Math.ceil(r / 64) + 1, Math.max(w, h));
    let best = null, bd = r * r;
    for (let k = 0; k <= rings; k++) {
      if (best && ((k - 1) * 64) ** 2 > bd) break;
      for (let gy = cy - k; gy <= cy + k; gy++) {
        if (gy < 0 || gy >= h) continue;
        const step = gy === cy - k || gy === cy + k ? 1 : 2 * k;   // 上下兩列整排掃，中間只掃左右兩格
        for (let gx = cx - k; gx <= cx + k; gx += step) {
          if (gx < 0 || gx >= w) continue;
          for (const u of g[gy * w + gx]) if (!u.dead) { const d = (u.x - x) ** 2 + (u.y - y) ** 2; if (d < bd) { bd = d; best = u; } }
        }
      }
    }
    return best;
  }
  function nearestFoeSquad(sq) {
    let best = null, bd = Infinity; const c = sq.center;
    for (const o of squads) if (o.team !== sq.team && o.alive.length) { const d = G.U.dist(o.center, c); if (d < bd) { bd = d; best = o; } }
    return best && { center: best.center, face: best.face };
  }
  const squadsOf = team => squads.filter(s => s.team === team);
  const heroOf = team => heroes.find(h => h.team === team);
  function later(sec, fn) { timers.push({ t: api.time + sec, fn }); }

  function gateTarget(u) {
    const c = G.Map.castle, g = c.gate, side = u.y < c.wallY ? -1 : 1;
    return { gate: true, x: g.x + G.U.clamp(u.x - g.x, -g.w / 2 + 6, g.w / 2 - 6), y: c.wallY + side * (c.thick / 2 + 3), radius: 4, team: c.defender };
  }
  function hitGate(att, dmg) { hitOpening(att, G.Map.castle.gate, dmg); }
  /** 打城門或可破壞城牆段；打破的瞬間：大片煙塵、震動、短暫慢動作 */
  function hitOpening(att, o, dmg) {
    const c = G.Map.castle;
    if (o.hp <= 0) return;
    o.hp -= dmg; o.flash = 0.1;
    G.FX.hit(G.U.clamp(att.x, o.x - o.w / 2, o.x + o.w / 2), c.wallY, '#c8a070', 3);
    if (o.hp > 0) return;
    o.hp = 0; G.FX.addShake(8);
    notify(null, o.kind === 'gate' ? '城門已被攻破！' : '城牆被打出缺口！');
    for (let i = 0; i < 18; i++) G.FX.dust(o.x + G.U.rand(-o.w / 2, o.w / 2), c.wallY + G.U.rand(-14, 24), 6);
    G.FX.ring(o.x, c.wallY + c.thick / 2, o.w, 'rgba(200,180,140,0.8)', 0.6);
    G.FX.slowMo(G.SIEGE.slowmo.dur, G.SIEGE.slowmo.scale);
  }

  /* ---------- 指揮官的操作（input 是這個玩家的鍵盤） ---------- */
  function handleInput(c) {
    const I = c.input, h = c.hero;
    const mine = squadsOfCmdr(c);
    if (I.pressed('Tab')) c.select = c.select === 'all' || Array.isArray(c.select) ? 0 : c.select + 1 < mine.length ? c.select + 1 : 'all';   // 全軍 → 第 1 隊 → … → 全軍（框選過的也從第 1 隊開始）
    // select：'all' 全部、數字是第幾隊、陣列是框選到的兵團 nid（框到的都死光了就回到全部）
    const boxed = Array.isArray(c.select) ? mine.filter(s => c.select.includes(s.nid)) : null;
    const sel = c.select === 'all' ? mine : boxed ? (boxed.length ? boxed : mine) : [mine[c.select]].filter(Boolean);
    // 補給點：T 開關換兵選單，開著的時候數字鍵選要換上的兵團
    if (I.pressed('KeyT')) {
      if (c.supplyOpen) c.supplyOpen = false;
      else if (!nearSupply(c)) notify(c, '要站在補給點上才能換兵');
      else if (!c.reserve.some(r => r.men > 0)) notify(c, '沒有其他還有兵的隨身兵團');
      else c.supplyOpen = true;
    }
    if (c.supplyOpen && !nearSupply(c)) c.supplyOpen = false;
    if (c.supplyOpen) { for (let d = 1; d <= 9; d++) if (I.pressed('Digit' + d)) swapEscort(c, d - 1); }
    if (I.pressed('KeyH')) {
      const field = squads.filter(s => s.field && s.owner === c && s.alive.length);
      if (field.length) { const o = field[0].order === 'attack' ? 'defend' : 'attack'; for (const s of field) s.order = o; notify(c, `配置兵團：${o === 'attack' ? '進攻' : '防守'}`); }
      else notify(c, '沒有配置兵團');
    }
    // 滑鼠指揮（HUD 選「隨身」或「配置」，左鍵點地面＝走到那裡進攻）
    for (const o of (I.orders ? I.orders() : []).slice(0, 10)) mouseOrder(c, o, sel);
    // 鍵盤：1 跟隨、2 駐守、3 進攻（隨身兵團）
    const cmd = c.supplyOpen ? null : I.pressed('Digit3') ? 'attack' : I.pressed('Digit1') ? 'follow' : I.pressed('Digit2') ? 'hold' : null;
    if (cmd) for (const sq of sel) {
      sq.cmd = cmd; sq.waypoint = null; sq.goTo = false; sq.lineFace = sq.lineCols = undefined;
      if (cmd === 'hold') sq.cmdPoint = { x: h.x, y: h.y };
      if (cmd === 'attack') { const f = nearestFoe(c.team, h.x, h.y, 99999); sq.cmdPoint = f ? { x: f.x, y: f.y } : { x: h.x, y: h.y }; }
    }
    // 4 衝鋒、5 固守、6 散開／密集（跟指揮列的按鈕一樣，作用在「隨身」或「配置」）
    for (const [code, a] of [['Digit4', 'rush'], ['Digit5', 'stand'], ['Digit6', 'spread']]) if (!c.supplyOpen && I.pressed(code)) mouseOrder(c, { a }, sel);
    if (I.pressed('KeyF')) for (const sq of sel) sq.cycleFormation();
    if (I.pressed('KeyZ')) for (const sq of sel) G.Skills.useUnit(sq, sq.def.skills[0]);
    if (I.pressed('KeyX')) for (const sq of sel) G.Skills.useUnit(sq, sq.def.skills[1]);
    if (I.pressed('KeyB')) assignEngine(c, sel);
    // 器械：U 換種類、Y 放在武將前面
    if (I.pressed('KeyU')) { c.kitSel = (c.kitSel + 1) % c.kit.length; notify(c, `器械：${G.SIEGE[c.kit[c.kitSel]].name}（剩 ${c.kitLeft} 個）`); }
    if (I.pressed('KeyY')) placeEngine(c);
    // 部署階段：Enter 準備好（所有玩家都準備好就提早開戰）；攻城的攻方用 ← → 換進攻方向
    if (api.deployT > 0) {
      if (I.pressed('Enter') && !c.ready) { c.ready = true; notifyTeam(c.team, `${c.name} 準備好了`); if (cmdrs.every(o => o.ready)) api.deployT = Math.min(api.deployT, 0.01); }
      const castle0 = G.Map.castle;
      if (castle0 && castle0.defender !== c.team) for (const [code, d] of [['ArrowLeft', -1], ['ArrowRight', 1]]) if (I.pressed(code)) shiftLane(c, d);
    }
    const castle = G.Map.castle;
    if (I.pressed('KeyG') && castle && castle.defender === c.team) {
      const g = castle.gate;
      if (g.hp > 0 && Math.hypot(h.x - g.x, h.y - castle.wallY) < 160) { g.open = !g.open; notifyTeam(c.team, g.open ? '城門開啟' : '城門關閉'); }
      else if (g.hp > 0) notify(c, '要靠近城門才能開關');
    }
  }
  /**
   * 滑鼠／HUD 的指揮命令。c.group：現在指揮的是隨身（escort，Tab 選中的那幾支）還是配置兵團（field，全部一起）
   *   move：走到那個點再駐守（路上不停下來打）；attack：往那個點進攻（沒給點就打最近的敵人）；follow：隨身兵團回來跟隨；hold：原地駐守
   */
  function mouseOrder(c, o, sel) {
    if (!o || typeof o.a !== 'string') return;
    if (o.a === 'group') { c.group = o.g === 'field' ? 'field' : 'escort'; return; }
    if (o.a === 'select') {   // Shift＋拖曳框選：框裡（兵團中心）的隨身兵團
      const box = [o.x, o.y, o.x2, o.y2].every(Number.isFinite) && o;
      const got = box ? squadsOfCmdr(c).filter(s => s.alive.length && (p => p.x >= box.x && p.x <= box.x2 && p.y >= box.y && p.y <= box.y2)(s.center)) : [];
      if (!got.length) return notify(c, '沒有框到自己的隨身兵團');
      c.select = got.map(s => s.nid); c.group = 'escort';
      return notify(c, `選了 ${got.length} 支兵團`);
    }
    const W = G.CONFIG.world, pt = Number.isFinite(o.x) && Number.isFinite(o.y) ? { x: G.U.clamp(o.x, 20, W.w - 20), y: G.U.clamp(o.y, 20, W.h - 20) } : null;
    const list = c.group === 'field' ? squads.filter(s => s.field && s.owner === c && s.alive.length) : sel.filter(sq => sq.alive.length && !sq.crew);
    if (!list.length) return notify(c, c.group === 'field' ? '沒有配置兵團' : '沒有隨身兵團');
    if (SQUAD_CMDS[o.a]) return SQUAD_CMDS[o.a](c, list, pt);
    const pt2 = Number.isFinite(o.x2) && Number.isFinite(o.y2) ? { x: G.U.clamp(o.x2, 20, W.w - 20), y: G.U.clamp(o.y2, 20, W.h - 20) } : null;
    if (o.a === 'line' && pt && pt2) return lineOrder(c, list, pt, pt2);
    // 好幾支一起走到同一點時左右排開，不疊在一起
    const spot = i => pt && { x: pt.x + (i - (list.length - 1) / 2) * 70, y: pt.y };
    list.forEach((sq, i) => {
      sq.focus = null; sq.lineFace = sq.lineCols = undefined;   // 其他指令都會取消集火、拉線排的陣型
      if (c.group === 'field') {
        if (o.a === 'move' || o.a === 'hold') { sq.order = 'defend'; sq.home = o.a === 'move' && pt ? spot(i) : { ...sq.center }; sq.waypoint = o.a === 'move' ? sq.home : null; sq.cmd = 'hold'; sq.cmdPoint = sq.home; }
        else if (o.a === 'attack' && pt) { sq.order = 'attack'; sq.waypoint = null; sq.cmd = 'attack'; sq.cmdPoint = spot(i); sq.goTo = true; }
        else if (o.a === 'attack') { sq.order = 'attack'; sq.waypoint = null; sq.goTo = false; const f = nearestFoe(c.team, sq.center.x, sq.center.y, 99999); sq.cmd = 'attack'; if (f) sq.cmdPoint = { x: f.x, y: f.y }; }
        return;
      }
      sq.goTo = false;
      if (o.a === 'follow') { sq.cmd = 'follow'; sq.waypoint = null; }
      else if (o.a === 'hold') { sq.cmd = 'hold'; sq.waypoint = null; sq.cmdPoint = { ...sq.center }; }
      else if (o.a === 'move' && pt) { sq.cmd = 'hold'; sq.cmdPoint = spot(i); sq.waypoint = spot(i); }
      else if (o.a === 'attack' && pt) { sq.cmd = 'attack'; sq.waypoint = null; sq.cmdPoint = spot(i); sq.goTo = true; }   // 點地面：走到那裡，路上和到了都會打
      else if (o.a === 'attack') { const f = nearestFoe(c.team, c.hero.x, c.hero.y, 99999); sq.cmd = 'attack'; sq.waypoint = null; sq.cmdPoint = f ? { x: f.x, y: f.y } : { x: c.hero.x, y: c.hero.y }; }
    });
    if (c.group === 'field' && !pt) notify(c, `配置兵團：${o.a === 'attack' ? '進攻' : '原地防守'}`);
  }
  /**
   * 通用兵團指令（docs/design.md 21），每種兵都能下；冷卻記在 sq.cmdCd，效果秒數記在 sq.fx（伺服器會送給瀏覽器顯示）
   *   rush 衝鋒：全速衝向最近的敵人（有點地面就往那裡），第一下打得重、把人撞開
   *   stand 固守：原地站穩，擊退 ×0.3、正面近戰 ×0.85、騎兵衝鋒傷害減半；不能移動
   *   spread 散開／密集：間距拉大，吃遠程 ×0.65、近戰 ×1.1（combat.js）
   *   focus 集火：打滑鼠指著的那支敵方兵團（或敵將），追著打直到打光
   */
  const ready = (sq, k) => !((sq.cmdCd || {})[k] > 0);
  const setCd = (sq, k) => { (sq.cmdCd = sq.cmdCd || {})[k] = G.SQUAD_ORDERS[k].cd; };
  const SQUAD_CMDS = {
    rush(c, list, pt) {
      const ok = list.filter(sq => !sq.crew && ready(sq, 'rush'));
      if (!ok.length) return notify(c, '衝鋒冷卻中');
      for (const sq of ok) {
        const from = pt || sq.center, f = nearestFoe(c.team, from.x, from.y, pt ? 300 : 99999);
        sq.fx.stand = 0; sq.fx.brace = 0; sq.fx.shieldwall = 0; sq.focus = null; sq.waypoint = null; sq.goTo = !!pt; sq.lineFace = sq.lineCols = undefined;
        sq.cmd = 'attack'; sq.cmdPoint = f ? { x: f.x, y: f.y } : pt || { ...sq.center };
        sq.fx.rush = G.SQUAD_ORDERS.rush.dur; setCd(sq, 'rush');
        for (const u of sq.units) u.rushed = false;
      }
      notify(c, '衝鋒！');
    },
    stand(c, list) {
      const ok = list.filter(sq => !sq.crew && ready(sq, 'stand'));
      if (!ok.length) return notify(c, '固守冷卻中');
      for (const sq of ok) { sq.fx.stand = G.SQUAD_ORDERS.stand.dur; sq.fx.rush = 0; setCd(sq, 'stand'); if (!sq.prevCmd) sq.prevCmd = sq.cmd; sq.cmd = 'hold'; sq.cmdPoint = { ...sq.center }; }
      notify(c, '固守陣地');
    },
    spread(c, list) {
      const on = !list.some(sq => sq.spread);
      for (const sq of list) sq.spread = on;
      notify(c, on ? '散開' : '密集');
    },
    focus(c, list, pt) {
      if (!pt) return;
      let best = null, bd = 140;
      for (const s of squads) if (s.team !== c.team && s.alive.length) { const d = G.U.dist(s.center, pt); if (d < bd) { bd = d; best = s; } }
      for (const h of heroes) if (h.team !== c.team && !h.dead && G.U.dist(h, pt) < Math.min(bd, 60)) { best = h; bd = G.U.dist(h, pt); }
      if (!best) return notify(c, '滑鼠要指著敵軍');
      for (const sq of list) { sq.focus = best; sq.cmd = 'attack'; sq.waypoint = null; sq.goTo = false; sq.lineFace = sq.lineCols = undefined; const p = best.isHero ? best : best.center; sq.cmdPoint = { x: p.x, y: p.y }; }
      G.FX.ring(pt.x, pt.y, 30, 'rgba(255,90,70,0.9)', 0.5);
      notify(c, `集火：${best.isHero ? best.name || '敵將' : best.def.name}`);
    },
  };

  /**
   * 拖曳一條線：兵團沿著線平均排開，每支走到自己那一段的中點；陣型寬度 = 那一段的長度（lineCols 欄）、
   * 面向線的垂直方向（朝敵人那一邊）。到了之後駐守，敵人靠近才轉過去打
   */
  function lineOrder(c, list, a, b) {
    const L = Math.hypot(b.x - a.x, b.y - a.y), n = list.length;
    if (L < 30) return mouseOrder(c, { a: 'attack', x: b.x, y: b.y }, list);
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let nx = -uy, ny = ux;   // 線的法線：選朝向最近敵人的那一邊（沒有敵人就朝地圖另一側）
    const f = nearestFoe(c.team, mid.x, mid.y, 99999);
    if (f ? (f.x - mid.x) * nx + (f.y - mid.y) * ny < 0 : c.team === 0 ? ny > 0 : ny < 0) { nx = -nx; ny = -ny; }
    const face = Math.atan2(ny, nx), seg = L / n;
    list.forEach((sq, i) => {
      const spot = { x: a.x + ux * seg * (i + 0.5), y: a.y + uy * seg * (i + 0.5) };
      Object.assign(sq, { cmd: 'hold', cmdPoint: spot, waypoint: spot, goTo: false, focus: null, lineFace: face, lineCols: Math.max(2, Math.round(seg / 15)) });
      if (sq.field) { sq.order = 'defend'; sq.home = spot; }
    });
    notify(c, `排成一條線（${n} 支）`);
  }

  /* ---------- 部署階段、可放置的器械（design.md 26）---------- */
  /** 部署階段這一方可以站的範圍：攻城的攻方在城外遠處、守方在城內；野戰各佔自己那一側 */
  function deployZone(team) {
    const c = G.Map.castle, W = G.CONFIG.world;
    if (c) return team === c.defender ? { y1: c.wallY - c.thick / 2 - 12 } : { y0: c.wallY + 300 };
    return team === 0 ? { x1: W.w * 0.42 } : { x0: W.w * 0.58 };
  }
  function clampZone(u, z) {
    if (z.x0 !== undefined) u.x = Math.max(u.x, z.x0); if (z.x1 !== undefined) u.x = Math.min(u.x, z.x1);
    if (z.y0 !== undefined) u.y = Math.max(u.y, z.y0); if (z.y1 !== undefined) u.y = Math.min(u.y, z.y1);
  }
  /** 攻方換進攻方向：武將和隨身兵團整個往左或往右移一條（左、中、右三條） */
  function shiftLane(c, d) {
    const lane = G.U.clamp(c.lane + d, -1, 1); if (lane === c.lane) return;
    const dx = (lane - c.lane) * 520; c.lane = lane;
    for (const u of [c.hero, ...squads.filter(s => s.owner === c).flatMap(s => s.units)]) u.x = G.U.clamp(u.x + dx, 40, G.CONFIG.world.w - 40);
    for (const s of squads) if (s.owner === c) { s.cmdPoint = { x: s.cmdPoint.x + dx, y: s.cmdPoint.y }; if (s.home) s.home = { x: s.home.x + dx, y: s.home.y }; }
    notify(c, `進攻方向：${['左翼', '正面', '右翼'][lane + 1]}`);
  }
  /** Y：在武將前面放一個器械（每場 perPlayer 個）；部署階段馬上蓋好，開戰後要蓋 buildTime 秒 */
  function placeEngine(c) {
    const h = c.hero, D = G.SIEGE.deploy, kind = c.kit[c.kitSel], d = G.SIEGE[kind], castle = G.Map.castle;
    if (h.dead) return;
    if (c.kitLeft <= 0) return notify(c, '這場的器械已經放完了');
    const x = h.x + Math.cos(h.face) * 36, y = h.y + Math.sin(h.face) * 36;
    if (x < 40 || y < 40 || x > G.CONFIG.world.w - 40 || y > G.CONFIG.world.h - 40) return notify(c, '這裡不能放');
    if (castle && Math.abs(y - castle.wallY) < castle.thick / 2 + d.radius + 10) return notify(c, '不能放在城牆上');
    if (castle && kind === 'tower' && y < castle.wallY) return notify(c, '攻城塔要放在城外');
    if (nearestFoe(c.team, x, y, D.minFoeDist)) return notify(c, '離敵人太近了');
    if (G.Map.blocked && G.Map.building(x, y)) return notify(c, '這裡有東西擋著');
    G.Siege.place(kind, c.team, x, y, api.deployT > 0 ? 0 : D.buildTime);
    c.kitLeft--;
    notify(c, `放下${d.name}${api.deployT > 0 ? '' : `，${D.buildTime} 秒後完成`}（剩 ${c.kitLeft} 個）`);
  }

  /** B：選中的兵團已經在操作器械就放手；否則把離武將最近、沒人操作的我方器械交給選中的步兵兵團 */
  function assignEngine(c, sel) {
    const busy = sel.filter(sq => sq.crew);
    if (busy.length) { for (const sq of busy) { G.Siege.release(sq.crew); sq.cmd = 'follow'; } notify(c, '放下攻城器械'); return; }
    const e = G.Siege.freeEngine(c.team, c.hero.x, c.hero.y, 260);
    if (!e) return notify(c, G.Map.castle && G.Map.castle.defender !== c.team ? '附近沒有可以操作的攻城器械' : '這個戰場沒有攻城器械');
    const ok = sel.filter(sq => sq.alive.length && !sq.def.mounted && !sq.def.ranged);
    if (!ok.length) return notify(c, '騎兵和弓兵不能操作攻城器械');
    const sq = ok.reduce((a, b) => G.U.dist(a.center, e) < G.U.dist(b.center, e) ? a : b);
    if (G.Siege.assign(sq, e, c.hero.x)) notify(c, `${sq.label.replace(/^(隨身|配置)・/, '')} 開始${e.kind === 'ladder' ? '扛' : '推'}${G.SIEGE[e.kind].name}`);
  }

  /* ---------- 武將 ---------- */
  function updateHero(h, dt) {
    h.animT += dt; if (h.flash > 0) h.flash -= dt; if (h.cd > 0) h.cd -= dt;
    for (const k in h.skillCd) if (h.skillCd[k] > 0) h.skillCd[k] -= dt;
    if (h.action) { h.action.until -= dt; if (h.action.until <= 0) h.action = null; }
    if (h.dead) {   // 倒下就不再滑動（以前屍體會帶著速度穿牆）
      h.vx = h.vy = 0; h.moving = false;
      if (h.respawnT === undefined) return;
      // 等重生時 Q／E 選重生地點：Q 後方（rallyOf）、E 原地（原地要多等 respawnHereExtra 秒）
      if (h.cmdr && !demo) {
        const I = h.cmdr.input, extra = G.SIEGE.respawnHereExtra;
        if (I.pressed('KeyE') && h.respawnAt !== 'here') { h.respawnAt = 'here'; h.respawnT += extra; }
        if (I.pressed('KeyQ') && h.respawnAt === 'here') { h.respawnAt = 'rally'; h.respawnT = Math.max(0, h.respawnT - extra); }
      }
      if ((h.respawnT -= dt) <= 0) revive(h);
      return;
    }
    for (const k of ['down', 'iframes', 'dodgeCd', 'blockBroken', 'blockT']) if (h[k] > 0) h[k] -= dt;
    if (h.stun > 0) { h.stun -= dt; h.vx = h.vy = 0; h.moving = false; h.blocking = false; return; }
    // 翻滾（空白鍵；電腦武將血少時偶爾滾開）：往移動方向，沒按方向就往後；前段無敵（combat.js）
    const I0 = h.cmdr && !demo ? h.cmdr.input : null;
    if (!h.dash && !h.horse && h.whirl <= 0 && (h.dodgeCd || 0) <= 0 && h.stamina >= G.DODGE.cost && (I0 ? I0.pressed('Space') : h.wantDodge)) {
      const D = G.DODGE, ix = I0 ? (I0.down('KeyD') ? 1 : 0) - (I0.down('KeyA') ? 1 : 0) : 0, iy = I0 ? (I0.down('KeyS') ? 1 : 0) - (I0.down('KeyW') ? 1 : 0) : 0;
      const a = ix || iy ? Math.atan2(iy, ix) : h.wantDodge ? h.wantDodge.a : h.face + Math.PI;
      h.dash = { vx: Math.cos(a) * D.dist / D.dur, vy: Math.sin(a) * D.dist / D.dur, t: D.dur, hit: new Set(), noHit: true, S: { width: 0 } };
      h.iframes = D.iframes; h.dodgeCd = D.cd; h.stamina -= D.cost; h.restT = G.SPRINT.delay; h.blocking = false; h.action = null;
      G.FX.dust(h.x, h.y, 3);
    }
    h.wantDodge = null;
    // 上馬／下馬（M，design.md 35）：附近 140 內有敵人不能上馬；騎馬移動 ×1.5、不能格擋翻滾，被擊倒、挑飛、長槍刺到會落馬
    if (I0 && I0.pressed('KeyM')) {
      if (h.horse) { h.horse = false; notify(h.cmdr, '下馬'); }
      else if (nearestFoe(h.team, h.x, h.y, 140)) notify(h.cmdr, '附近有敵人，不能上馬');
      else { h.horse = true; G.FX.dust(h.x, h.y, 5); notify(h.cmdr, '上馬（M 下馬）'); }
    }
    if (h.horse) h.blocking = false;
    G.Skills.updateHero(h, dt);
    if (h.dash) { h.blocking = false; return; }
    let mx = 0, my = 0;
    if (h.cmdr && !demo) {
      const I = h.cmdr.input;
      mx = (I.down('KeyD') ? 1 : 0) - (I.down('KeyA') ? 1 : 0);
      my = (I.down('KeyS') ? 1 : 0) - (I.down('KeyW') ? 1 : 0);
      for (const [code, slot] of [['KeyQ', 'Q'], ['KeyE', 'E'], ['KeyR', 'R']]) if (I.pressed(code)) G.Skills.useHero(h, slot);
      // 格擋：按住右鍵（耐力耗光、剛破防時不能擋）
      h.blocking = I.down('Mouse2') && !h.horse && !h.tired && !(h.blockBroken > 0) && h.whirl <= 0;
    } else { ({ mx, my } = enemyHeroBrain(h)); h.blocking = h.blockT > 0 && !h.tired && !(h.blockBroken > 0) && h.whirl <= 0; }
    // 普攻放技能時移動變慢；自動普攻不減速，邊走邊打
    const slow = (h.action && h.action.anim !== 'Attack' ? 0.35 : 1) * (h.blocking ? G.BLOCK.speedMul : 1);
    // 跑步：按住 Shift 移動就跑，耗耐力；耗光要回到 resume 才能再跑；停下來一下才開始回
    const R = G.SPRINT, shift = h.cmdr && !demo && (h.cmdr.input.down('ShiftLeft') || h.cmdr.input.down('ShiftRight'));
    h.running = !!(shift && (mx || my) && !h.tired && slow === 1);
    if (h.blocking) h.restT = Math.max(h.restT, 0.3);   // 舉著擋的時候耐力不回
    if (h.running) { h.stamina -= R.drain * dt; h.restT = R.delay; if (h.stamina <= 0) { h.stamina = 0; h.tired = true; } h.animT += dt * (R.mul - 1); }
    else if ((h.restT -= dt) <= 0) { h.stamina = Math.min(h.staminaMax, h.stamina + R.regen * dt); if (h.tired && h.stamina >= R.resume) h.tired = false; }
    if (mx || my) {
      const buff = h.buff && h.buff.until > api.time ? h.buff.speedMul : 1, guard = h.guard > 0 ? h.guardS.speedMul : 1;
      const l = Math.hypot(mx, my), sp = h.speed * slow * G.Map.terrainSpeed(h) * buff * guard * (h.running ? R.mul : 1) * (h.horse ? 1.5 : 1);   // 騎馬 ×1.5
      h.vx = mx / l * sp; h.vy = my / l * sp; h.moving = true;
      if (!h.action && !h.blocking) h.face = Math.atan2(my, mx);   // 格擋時面向不變（邊擋邊退）
    } else { h.vx = h.vy = 0; h.moving = false; }
    // 自動普攻：武器範圍內有目標就面向它出手（格擋中不打）
    if (h.cd <= 0 && h.whirl <= 0 && !h.blocking) { const t = autoTarget(h); if (t && !(h.weapon.ranged && !t.team && t.team !== 0)) { h.face = Math.atan2(t.y - h.y, t.x - h.x); heroAttack(h, t); } }
  }

  /** 普攻目標：最近的敵人 → 敵方攻城器械 → （攻方）還沒打破的城門或城牆段；都沒有就是 null */
  function autoTarget(h) {
    const r = h.weapon.range * (h.weapon.ranged ? G.weatherOf().rangeMul : 1);   // 霧天遠程武將也射不遠
    const u = nearestFoe(h.team, h.x, h.y, r + 4);
    if (u) return u;
    const e = G.Siege.nearestFoeEngine(h.team, h.x, h.y, r);
    if (e) return e;
    const c = G.Map.castle;
    if (c && c.defender !== h.team && Math.abs(h.y - c.wallY) < c.thick / 2 + r)
      for (const o of c.openings) if (o.kind !== 'ladder' && !G.Map.passable(o) && Math.abs(h.x - o.x) < o.w / 2 + r) return { x: G.U.clamp(h.x, o.x - o.w / 2, o.x + o.w / 2), y: c.wallY };
    return null;
  }

  /** 攻方武將重生：在最後佔下的據點，或選了原地就在倒下的地方 */
  const canRespawn = c => !!G.Map.castle || squads.some(s => s.owner === c && !s.ai && s.alive.length) || c.reserve.some(r => r.men > 0);
  /** 回後方重生的地方：攻方是最後佔下的據點（還沒佔就是出發點）、守方是守將的位置；野戰是自己的補給點 */
  function rallyOf(h) {
    const c = G.Map.castle, home = { ...spawnOf(h.team, 0), name: '出發點' };
    if (c) return h.team !== c.defender ? c.rally || home : { ...home, name: '城內' };
    const s = supplyPoints(h.team)[0];
    return s ? { ...s, name: '補給點' } : home;
  }
  function revive(h) {
    const p = rallyOf(h), here = h.respawnAt === 'here';
    Object.assign(h, { hp: h.maxHp, stamina: h.staminaMax, tired: false, dead: 0, stun: 0, down: 0, blocking: false, horse: false, iframes: 0, z: 0, vz: 0, kx: 0, ky: 0, dash: null, whirl: 0, action: null, respawnT: undefined, respawnAt: undefined });
    if (!here) { h.x = p.x; h.y = p.y + 24; }
    G.FX.ring(h.x, h.y, 40, 'rgba(255,220,150,0.9)', 0.6);
    if (h.cmdr) notify(h.cmdr, here ? '原地重生' : `在${p.name}重生`);
  }

  function heroAttack(h, t) {
    const w = h.weapon;
    h.cd = w.atkCd * (h.atkCdMul || 1); h.doAction('Attack', 0.2);
    // 遠程武將（火槍、長弓）：射一發投射物；打不到城門城牆
    if (w.ranged) {
      // 火槍「後撤裝填」裝好的子彈：傷害提高、下一發馬上能開
      const loaded = h.loaded > 0 && t && !t.gate; if (loaded) { h.loaded--; if (h.loaded) h.cd = Math.min(h.cd || 0, 0.25); }
      if (t && !t.gate && t.team !== undefined) G.Combat.arrow(h, t, { ranged: w.ranged, knock: w.knock, base: h.atk * G.U.rand(0.9, 1.1) * (loaded ? G.HERO_SKILLS.roll.loadMul : 1) }); if (w.ranged.flat) G.FX.hit(h.x + Math.cos(h.face) * 14, h.y - 14 + Math.sin(h.face) * 14, '#ffd27a', 4); return; }
    G.FX.slash(h.x, h.y - 12, h.face, w.range - 8, w.arc, { life: 0.18, width: 4 });
    forEachFoe(h.team, h.x, h.y, w.range, o => {
      if (G.U.angDiff(Math.atan2(o.y - h.y, o.x - h.x), h.face) < w.arc / 2 + 0.2) G.Combat.damage(h, o, h.atk * G.U.rand(0.9, 1.1), { knock: 7 });
    });
    G.Siege.forEachFoeEngine(h.team, h.x, h.y, w.range, e => {
      if (G.U.angDiff(Math.atan2(e.y - h.y, e.x - h.x), h.face) < w.arc / 2 + 0.3) G.Combat.damage(h, e, h.atk);
    });
    const c = G.Map.castle;
    if (c && c.defender !== h.team && Math.abs(h.y - c.wallY) < c.thick / 2 + w.range)
      for (const o of c.openings) if (o.kind !== 'ladder' && !G.Map.passable(o) && Math.abs(h.x - o.x) < o.w / 2 + w.range) hitOpening(h, o, h.atk * G.SIEGE.heroGateMul);
  }

  /** 電腦武將：找最近的目標接近、攻擊，偶爾放技能 */
  function enemyHeroBrain(h) {
    if (api.deployT > 0) return { mx: 0, my: 0 };   // 部署階段不動
    const t = nearestFoe(h.team, h.x, h.y, 360);
    const home = h.team === 1 ? scenario.enemyHero : scenario.player;
    let tx = home.x, ty = home.y;
    if (t) { tx = t.x; ty = t.y; }
    const d = Math.hypot(tx - h.x, ty - h.y);
    if (t) {
      h.face = Math.atan2(ty - h.y, tx - h.x);
      if (d < 60) for (const slot of ['Q', 'E', 'R']) if (h.skillCd[slot] <= 0 && Math.random() < 0.01) G.Skills.useHero(h, slot);
      // 對上武將：對方出手時偶爾舉起來擋；血少被貼身時偶爾滾開
      if (t.isHero && d < 90 && t.action && !(h.blockT > 0) && Math.random() < 0.04) h.blockT = G.U.rand(0.5, 1.1);
      if (h.hp < h.maxHp * 0.35 && d < 50 && Math.random() < 0.015) h.wantDodge = { a: Math.atan2(h.y - ty, h.x - tx) };
    }
    // 遠程武將（火槍、長弓）被貼身：往反方向退，有後撤技能（後撤裝填）就用，沒有就偶爾翻滾
    if (t && h.weapon.ranged && d < 90) {
      const away = Math.atan2(h.y - ty, h.x - tx);
      const back = h.skillKey('E') === 'roll' ? 'E' : null;
      if (back && h.skillCd[back] <= 0 && Math.random() < 0.05) { h.face = Math.atan2(ty - h.y, tx - h.x); G.Skills.useHero(h, back); }
      else if (Math.random() < 0.02) h.wantDodge = { a: away };
      const r = G.Map.route(h, h.x + Math.cos(away) * 80, h.y + Math.sin(away) * 80);
      return { mx: r.x - h.x, my: r.y - h.y };
    }
    const reach = h.weapon.range - 6;
    const r = G.Map.route(h, tx, ty);
    return { mx: d > reach ? r.x - h.x : 0, my: d > reach ? r.y - h.y : 0 };
  }

  /* ---------- 物理 ---------- */
  function physics(dt) {
    const all = allUnits();
    for (const u of all) {
      if (u.dead) { u.dead += dt; }
      u.x += (u.vx + u.kx) * dt; u.y += (u.vy + u.ky) * dt;
      const k = Math.exp(-7 * dt); u.kx *= k; u.ky *= k;
      if (u.z > 0 || u.vz > 0) {
        u.vz -= 420 * dt; u.z += u.vz * dt;
        if (u.z <= 0) { if (u.vz < -120) G.FX.dust(u.x, u.y, 3); u.z = 0; u.vz = 0; }
      }
      if (u.flash > 0) u.flash -= dt;
      if (u.down > 0 && !u.isHero) u.down -= dt;   // 擊倒（武將的在 updateHero 扣）
      if (u.animT !== undefined) u.animT += dt;
      if (!u.isHero && u.anim === 'Attack' && u.animT > (G.Sprites.duration(u.def.sprite, 'Attack') || 0.3)) u.play('Idle');
    }
    // 互相推開
    for (const u of all) {
      if (u.dead || u.z > 4) continue;
      forNear(u.x, u.y, 20, o => {
        if (o === u || o.dead) return;
        const dx = u.x - o.x, dy = u.y - o.y, d = Math.hypot(dx, dy) || 0.01, min = (u.radius || 6) + (o.radius || 6);
        if (d < min) {
          const push = (min - d) / d * 0.5 * (u.isHero ? 0.25 : o.isHero ? 1.2 : 1);
          u.x += dx * push; u.y += dy * push;
        }
      });
    }
    for (const u of all) {
      u.x = G.U.clamp(u.x, 8, W().w - 8); u.y = G.U.clamp(u.y, 8, W().h - 8);
      if (!u.dead) { G.Map.resolve(u); G.Siege.collide(u); }   // collide：拒馬擋路
    }
    for (const s of squads) s.units = s.units.filter(u => !u.dead || u.dead < 1.2);
    unitCache = null;
  }

  /* ---------- 勝負 ---------- */
  function checkResult(dt) {
    if (result) return;
    const castle = G.Map.castle;
    // 玩家的武將倒下：攻城戰一直可以重生；野戰要身上還有隨身兵團（場上或後備還有人）才能重生
    for (const h of heroes) if (h.dead && h.respawnT === undefined && h.cmdr && !demo && canRespawn(h.cmdr)) {
      h.respawnT = G.SIEGE.respawn; h.respawnAt = 'rally';
      notify(h.cmdr, `武將倒下，${G.SIEGE.respawn} 秒後在${rallyOf(h).name}重生（按 E 改成原地）`);
    }
    // 有玩家指揮官的一方：所有武將（玩家的和電腦的）都陣亡、又不會重生，就輸了
    for (const team of [0, 1]) {
      const list = cmdrs.filter(c => c.team === team);
      if (!demo && list.length && heroes.filter(h => h.team === team).every(h => h.dead && h.respawnT === undefined)) return end(1 - team, '武將陣亡');
    }
    if (castle && castle.capture) {
      // 依序佔領：只有目前這個據點能搶；佔下後就是攻方的，不會被搶回去
      const cp = castle.capture, att = 1 - castle.defender, T = G.SIEGE.captureTime;
      let a = 0, d = 0;
      for (const u of allUnits()) if (!u.dead && Math.hypot(u.x - cp.x, (u.y - cp.y) / 0.6) < cp.r) {
        u.team === att ? a++ : d++;
        // 誰在佔點（城池歸佔下主堡的人）：每一幀記一次在圈裡的指揮官，武將本人算 10 個兵
        const who = u.isHero ? u.cmdr : u.squad && u.squad.owner;
        if (who && u.team === att) cp.by = cp.by || new Map(), cp.by.set(who, (cp.by.get(who) || 0) + (u.isHero ? 10 : 1) * dt);
      }
      if (a && !d) cp.progress = Math.min(1, cp.progress + dt / T);
      else if (d && !a) cp.progress = Math.max(0, cp.progress - dt / T);
      if (cp.progress >= 1) {
        cp.taken = true;
        G.FX.ring(cp.x, cp.y, cp.r * 1.4, att === 0 ? 'rgba(120,170,255,0.9)' : 'rgba(255,120,100,0.9)', 0.8);
        if (!castle.capture) {
          // 佔下主堡：在圈裡最久（人最多）的指揮官
          let best = null; for (const [c, v] of cp.by || []) if (!best || v > best[1]) best = [c, v];
          api.capturedBy = best ? best[0] : null;
          G.FX.slowMo(0.9, 0.3);   // 最後一個據點翻轉：慢動作
          return end(att, '主堡已佔領！');
        }
        notifyTeam(att, `佔領${cp.name}！下一個目標：${castle.capture.name}`);
        notifyTeam(1 - att, `${cp.name}失守！退守${castle.capture.name}`);
      }
    }
    // 搶旗（野戰配對的搶旗模式，design.md 29）：旗點 70px 內只有一方的人就慢慢翻成那一方（8 秒）；
    //   每支旗每秒給擁有的一方 1 分，先到 scenario.flagGoal 分的贏
    if (scenario.flags) {
      api.flagScore = api.flagScore || [0, 0];
      for (const f of api.flags) {
        const n = [0, 0];
        forNear(f.x, f.y, 70, u => { if (!u.dead && Math.hypot(u.x - f.x, u.y - f.y) < 70) n[u.team] += u.isHero ? 5 : 1; });
        if (n[0] && !n[1]) f.progress = Math.max(-1, f.progress - dt / 8); else if (n[1] && !n[0]) f.progress = Math.min(1, f.progress + dt / 8);
        if (f.progress <= -1 && f.owner !== 0) { f.owner = 0; notify(null, `${f.name}被藍方佔領`); }
        if (f.progress >= 1 && f.owner !== 1) { f.owner = 1; notify(null, `${f.name}被紅方佔領`); }
        if (f.owner >= 0) api.flagScore[f.owner] += dt;
      }
      for (const team of [0, 1]) if (api.flagScore[team] >= scenario.flagGoal) return end(team, '旗點積分勝利');
    }
    // 一方全滅（也沒有等著重生的武將）：另一方贏
    for (const team of [0, 1]) if (!allUnits().some(u => u.team === 1 - team && (!u.dead || u.respawnT !== undefined))) return end(team, '敵軍全滅！');
    if (scenario.timeLimit && api.time - api.deployLen > scenario.timeLimit) return end(castle ? castle.defender : 1, '時間到');
  }
  /** winTeam 那一方贏；msg 是贏的一方看的說明（輸的一方另外換字） */
  function end(winTeam, msg) {
    result = { winTeam, msg, loseMsg: { '主堡已佔領！': '主堡失守', '敵軍全滅！': '全軍覆沒', '武將陣亡': '武將陣亡', '時間到': '時間到', '旗點積分勝利': '旗點積分落後' }[msg] || msg };
    api.onEnd(result);
  }
  /** 某個指揮官的戰報（給伺服器結算）：戰場上的隨身、配置兵團，加上後備 */
  function report(c) {
    const list = [...squads.filter(s => s.owner === c && s.rosterId), ...c.reserve.filter(r => r.id).map(r => ({ rosterId: r.id, alive: { length: r.men }, kills: r.kills || 0 }))];
    return { squads: list.map(s => ({ rosterId: s.rosterId, alive: s.alive.length, kills: s.kills || 0 })), heroKills: c.hero.kills || 0 };
  }

  /* ---------- 每一步 ---------- */
  function update(dt) {
    api.time += dt;
    for (const c of cmdrs) if (c.supplyCd > 0) c.supplyCd -= dt;
    for (const t of timers) if (api.time >= t.t) { t.fn(); t.done = true; }
    timers = timers.filter(t => !t.done);
    unitCache = null; rebuildGrid();
    if (!result && !demo) for (const c of cmdrs) handleInput(c);
    for (const h of heroes) updateHero(h, dt);
    const deploying = api.deployT > 0;
    if ((thinkT -= dt) <= 0) { thinkT = 0.5; if (!deploying) for (const s of squads) if (!s.owner || s.ai || demo) G.AI.think(s); }   // 部署階段電腦不動
    for (const s of squads) G.AI.updateSquad(s, dt);
    G.Siege.update(dt, deploying);
    G.Combat.updateProjectiles(dt, allUnits());
    physics(dt);
    const c = G.Map.castle; if (c) for (const o of c.openings) if (o.flash > 0) o.flash -= dt;
    if (deploying) {   // 部署階段：玩家的武將和兵團留在自己這一側；時間到就開戰
      for (const cm of cmdrs) { const z = deployZone(cm.team); clampZone(cm.hero, z); for (const s of squads) if (s.owner === cm) for (const u of s.units) clampZone(u, z); }
      if ((api.deployT -= dt) <= 0) { api.deployT = 0; api.deployLen = api.time; notify(null, '開戰！'); }   // deployLen：提早開戰時時間限制從這裡開始算
      return;
    }
    checkResult(dt);
  }

  Object.assign(api, {
    SCENARIOS, setup, update, report, join, leave, cityScenario, duelScenario, fieldScenario, applySize, fieldAvoid, NO_INPUT, supplyPoints, nearSupply, squadsOfCmdr, allUnits, notify, notifyTeam,
    forEachFoe, nearestFoe, nearestFoeSquad, squadsOf, heroOf, later, gateTarget, hitGate, hitOpening,
  });
  for (const [k, get] of Object.entries({ heroes: () => heroes, squads: () => squads, commanders: () => cmdrs, result: () => result, scenario: () => scenario, demo: () => demo }))
    Object.defineProperty(api, k, { get });
  return api;
})();
