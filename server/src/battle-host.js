/* ============ battle-host.js — 同場戰鬥：伺服器跑戰鬥模擬，玩家只送按鍵、收畫面狀態 ============
 * 每一場戰鬥（room）是一個獨立的 Node vm，裡面跑跟瀏覽器一模一樣的 js/battle/sim.js（加上它用到的資料、系統）。
 * 畫面相關的東西換成空的（G.Render、G.HUD），特效（G.FX）改成記錄事件、轉送給瀏覽器播放。
 * 每 50ms 一步：套用每個玩家的按鍵 → G.Battle.update(0.05) → 把狀態送給房裡的每個人（自己的那份多帶 me）。
 * 打完由伺服器直接結算（不用瀏覽器回報，真正防作弊）：傷亡、經驗、金幣用同一份 G.Army.settle，攻方贏了城池歸開戰的人。
 * 訊息（走 /ws，見 live.js）：
 *   瀏覽器 → 伺服器：{ t: 'b.attack', city }、{ t: 'b.join', room, side }、{ t: 'b.in', held: [按著的鍵], hit: [剛按下的鍵] }、{ t: 'b.leave' }
 *   伺服器 → 瀏覽器：{ t: 'b.start', room, team, me, scenario }、{ t: 'b.s', …狀態 }、{ t: 'b.msg', text }、{ t: 'b.end', win, msg, report }、
 *                    { t: 'b.invite', room, side, text }、{ t: 'b.err', text }
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const TICK = 0.05;
const FILES = ['js/data/config.js', 'js/core/util.js', 'js/data/sprites-meta.js', 'js/data/units.js', 'js/data/counters.js', 'js/data/formations.js',
  'js/data/skills.js', 'js/data/heroes.js', 'js/data/army.js', 'js/data/veteran.js', 'js/data/siege.js', 'js/data/town.js', 'js/data/town-main.js',
  'js/data/town-small.js', 'js/data/world.js', 'js/core/sprites.js', 'js/entities/unit.js', 'js/entities/hero.js', 'js/world/nav.js', 'js/world/map.js',
  'js/systems/combat.js', 'js/systems/skills.js', 'js/systems/ai.js', 'js/systems/siege.js', 'js/systems/army.js', 'js/battle/sim.js'];   // army.js：敵方老兵技能（G.Army.modsOf）
// 轉送給瀏覽器的特效（其他的例如命中停頓、慢動作只影響單機的時間，不送）
const FX_EVENTS = ['hit', 'blood', 'dust', 'embers', 'slash', 'ring', 'number', 'addShake', 'feed', 'stuck', 'impact', 'muzzle', 'shout'];   // feed：擊殺提示；stuck：插在地上的箭
const MAX_FX = 160;   // 每一步最多送幾個特效，大混戰時才不會塞爆

const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

export async function createBattles({ root, game, live, db, profiles, social, world }) {
  const scripts = [];
  for (const f of FILES) scripts.push(new vm.Script(await readFile(path.join(root, f), 'utf8'), { filename: f }));
  const rooms = new Map();
  let nextRoom = 1;

  /** 一個新的模擬環境（每場戰鬥一個，互不干擾） */
  function sandbox() {
    const fx = [];
    const noop = () => {};
    const ctx = { console, Math, JSON, Date };
    ctx.window = ctx;
    vm.createContext(ctx);
    ctx.G = { Assets: { img: () => ({ complete: false, naturalWidth: 0 }) } };
    for (const s of scripts) s.runInContext(ctx);   // config.js 會沿用已經放好的 window.G
    const G = ctx.G;
    G.Render = new Proxy({}, { get: () => noop });
    G.HUD = { toast: noop };
    G.FX = { S: { shake: true }, reset: noop, update: () => false, timeScale: () => 1, shakeOffset: () => ({ x: 0, y: 0 }), portrait: () => null, showCutin: noop, addHitStop: noop, slowMo: noop };
    for (const n of FX_EVENTS) G.FX[n] = (...a) => { if (fx.length < MAX_FX) fx.push([n, ...a.map(v => typeof v === 'number' ? r1(v) : v)]); };
    G.useScale('battle');
    return { G, fx };
  }

  /* ---------- 房間 ---------- */
  /** 攻打城池：建房間，開戰的人是攻方第一個指揮官 */
  async function attack(conn, cityId) {
    if (conn.room) return send(conn, { t: 'b.err', text: '你已經在戰鬥中' });
    const { G: GD } = game, c = GD.WORLD.cities.find(c => c.id === cityId);
    if (!c || c.capital) return send(conn, { t: 'b.err', text: '這座城不能攻打' });
    // 這座城已經在打：直接加入（城主加入守方，其他人加入攻方）
    const busy = [...rooms.values()].find(r => r.city === cityId && !r.done);
    if (busy) return join(conn, busy.id, isDefender(busy, conn.uid) ? 1 : 0);
    const { rows: [own] } = await db.query('SELECT owner_id, city_name, shield_until FROM world_cities WHERE city_id = $1', [cityId]);
    if (own && own.owner_id === conn.uid) return send(conn, { t: 'b.err', text: '這是你自己的城' });
    const block = social.siegeBlock(own, conn.uid); if (block) return send(conn, { t: 'b.err', text: block });   // 攻城時段、保護中、同家族
    const spec = await commanderSpec(conn, 0);
    if (spec.error) return send(conn, { t: 'b.err', text: spec.error });
    const cityName = own ? own.city_name : c.name;   // 沒人佔的城用原本的城名（大地圖名牌寫「空城」，但戰鬥標題、邀請要看得出是哪一座）
    const room = makeRoom({ city: cityId, cityName, ownerId: own ? own.owner_id : null, creator: conn.uid }, G => G.Battle.cityScenario(cityId, cityName));
    addPlayer(room, conn, spec);
    announce();
    // 邀請：隊友（不管在哪）和大地圖上在附近的玩家可以一起攻；城主（在線上）可以回防
    const gate = { x: c.x, y: c.y + 30 };
    for (const o of live.connections()) {
      if (o === conn || o.room) continue;
      if (room.ownerId && o.uid === room.ownerId) send(o, { t: 'b.invite', room: room.id, side: 1, text: `你的城「${room.cityName}」被 ${conn.name} 攻打！按 J 回防` });
      else if (room.ownerId && social.sameGuild(o.uid, room.ownerId)) send(o, { t: 'b.invite', room: room.id, side: 1, text: `家族的城「${room.cityName}」被 ${conn.name} 攻打！按 J 回防` });
      else if (conn.party && o.party === conn.party) send(o, { t: 'b.invite', room: room.id, side: 0, text: `隊友 ${conn.name} 正在攻打「${room.cityName}」，按 J 加入` });
      else if (o.scene === 'world' && Math.hypot(o.x - gate.x, o.y - gate.y) < 600) send(o, { t: 'b.invite', room: room.id, side: 0, text: `${conn.name} 正在攻打「${room.cityName}」，按 J 加入` });
    }
  }
  /** 開一個房間（攻城或對決）：獨立的模擬環境，每 50ms 跑一步 */
  function makeRoom(meta, scenarioOf) {
    const { G, fx } = sandbox();
    const room = { id: nextRoom++, city: null, cityName: '', ownerId: null, ...meta, G, fx, players: new Map(), done: false, startedAt: Date.now(), msgs: [] };
    room.scenario = scenarioOf(G);
    G.Battle.onNotify = (c, text) => { for (const p of room.players.values()) if (!c || p.cmdr === c) p.msgs.push(text); };
    G.Battle.onEnd = r => finish(room, r);
    G.Battle.setup({ scenario: room.scenario, commanders: [] });
    rooms.set(room.id, room);
    room.timer = setInterval(() => step(room), TICK * 1000);
    return room;
  }

  /* ---------- 對決：大地圖上兩個玩家打一場野戰（不搶城、照一般戰鬥結算傷亡與經驗） ---------- */
  const DUEL_RANGE = 150;
  function duel(conn, toId) {
    const o = live.connections().find(o => o.id === toId);
    if (!o || o === conn) return;
    if (conn.room || o.room) return send(conn, { t: 'b.err', text: '對方正在戰鬥中' });
    if (conn.scene !== 'world' || o.scene !== 'world' || Math.hypot(o.x - conn.x, o.y - conn.y) > DUEL_RANGE) return send(conn, { t: 'b.err', text: '要在大地圖上靠近對方才能發起對決' });
    if (conn.party && conn.party === o.party) return send(conn, { t: 'b.err', text: '不能跟隊友對決' });
    o.duelReq = { from: conn, until: Date.now() + 20000 };
    send(o, { t: 'b.duelReq', from: conn.id, name: conn.name });
    send(conn, { t: 'b.msg', text: `已向 ${o.name} 發起對決，等待回應` });
  }
  async function duelAnswer(conn, ok) {
    const req = conn.duelReq; conn.duelReq = null;
    if (!req || Date.now() > req.until || !live.connections().includes(req.from)) return send(conn, { t: 'b.err', text: '對決邀請已經過期' });
    const from = req.from;
    if (!ok) return send(from, { t: 'b.duelNo', text: `${conn.name} 拒絕了對決` });
    if (conn.room || from.room) return send(conn, { t: 'b.err', text: '對方正在戰鬥中' });
    const [a, b] = await Promise.all([commanderSpec(from, 0), commanderSpec(conn, 1)]);
    if (a.error) { send(from, { t: 'b.duelNo', text: a.error }); return send(conn, { t: 'b.err', text: `${from.name} 不能出戰` }); }
    if (b.error) { send(from, { t: 'b.duelNo', text: `${conn.name} 不能出戰` }); return send(conn, { t: 'b.err', text: b.error }); }
    const room = makeRoom({ duel: true, creator: from.uid }, G => G.Battle.duelScenario(from.name, conn.name));
    addPlayer(room, from, a);
    addPlayer(room, conn, b);
  }
  /* ---------- 單人戰鬥也在伺服器算（design.md 34）：強盜、北境聯軍／巡邏隊、商隊、兵營演習 ----------
   * 敵軍組成由伺服器決定（強盜照營地等級隨機挑、北境軍和商隊照 world-sim 的那一支），瀏覽器只送按鍵；打完由伺服器結算
   */
  const DRILLS = ['field', 'siege', 'defend'];
  async function solo(conn, m) {
    if (conn.room) return send(conn, { t: 'b.err', text: '你已經在戰鬥中' });
    const { G } = game, W = G.WORLD, kind = m.kind, target = m.target;
    let scenarioOf, tier = 0;
    if (kind === 'drill') {
      if (!DRILLS.includes(target)) return send(conn, { t: 'b.err', text: '沒有這個戰場' });
      scenarioOf = G2 => ({ ...G2.Battle.SCENARIOS[target] });
    } else if (kind === 'bandit') {
      const camp = W.camps.find(c => c.id === target);
      if (!camp) return send(conn, { t: 'b.err', text: '沒有這個營地' });
      const data = await profiles.load(conn.uid), at = data.world && data.world.cooldown && data.world.cooldown[target];
      if (at && at > Date.now()) return send(conn, { t: 'b.err', text: '這個營地的強盜還沒回來' });
      const list = W.bandits[camp.tier], members = list[Math.floor(Math.random() * list.length)];
      tier = camp.tier;
      scenarioOf = G2 => G2.Battle.fieldScenario(`${camp.name}強盜`, null, members, [1, 1, 3, 5][camp.tier] || 1);
    } else if (kind === 'raid' || kind === 'caravan') {
      const r = world.raidOf(target);
      if (!r || (kind === 'caravan') !== (r.kind === 'caravan')) return send(conn, { t: 'b.err', text: kind === 'caravan' ? '這支商隊已經不在了' : '這支北境軍已經不在了' });
      const name = kind === 'caravan' ? '打劫商隊' : r.kind === 'patrol' ? '攔截北境巡邏隊' : '攔截北境聯軍';
      scenarioOf = G2 => G2.Battle.fieldScenario(name, kind === 'caravan' ? null : { weapon: 'glaive', x: 1410, y: 560, name: r.kind === 'patrol' ? '巡邏隊長' : '聯軍先鋒' }, r.members, kind === 'caravan' ? 2 : 4);
    } else return send(conn, { t: 'b.err', text: '不合理的戰鬥' });
    const spec = await commanderSpec(conn, 0);
    if (spec.error) return send(conn, { t: 'b.err', text: spec.error });
    const room = makeRoom({ solo: kind, target, tier, creator: conn.uid }, scenarioOf);
    addPlayer(room, conn, spec);
  }

  /* ---------- 野戰配對（design.md 29）：在兵營排隊，湊到人就開一場多人野戰（兩邊人數平均，依武將等級蛇形分隊） ---------- */
  const MATCH = { min: 2, max: 10, wait: 20000 };
  const MIN_FIGHT = 45;   // 配對、對決至少要打幾秒（部署階段不算）才算勝利
  let queue = [], queueSince = 0;
  const queueMsg = () => { for (const c of queue) send(c, { t: 'b.queue', n: queue.length, on: true }); };
  function queueJoin(conn) {
    if (conn.room) return send(conn, { t: 'b.err', text: '你已經在戰鬥中' });
    if (queue.includes(conn)) return;
    queue.push(conn); if (queue.length === MATCH.min) queueSince = Date.now();
    queueMsg(); tryMatch();
  }
  function queueLeave(conn) {
    if (!queue.includes(conn)) return;
    queue = queue.filter(c => c !== conn); send(conn, { t: 'b.queue', n: 0, on: false }); queueMsg();
  }
  async function tryMatch() {
    queue = queue.filter(c => live.connections().includes(c) && !c.room);
    if (queue.length < MATCH.min || (queue.length < MATCH.max && Date.now() - queueSince < MATCH.wait)) return;
    const group = queue.splice(0, MATCH.max); queueSince = Date.now();
    const specs = (await Promise.all(group.map(async c => ({ c, s: await commanderSpec(c, 0) })))).filter(({ c, s }) => {
      if (s.error) { send(c, { t: 'b.err', text: `配對失敗：${s.error}` }); send(c, { t: 'b.queue', n: 0, on: false }); }
      return !s.error && !c.room;
    });
    if (specs.length < MATCH.min) { queue.unshift(...specs.map(x => x.c)); return queueMsg(); }
    specs.sort((a, b) => b.s.heroLevel - a.s.heroLevel);
    specs.forEach((x, i) => { x.s.team = [0, 1, 1, 0][i % 4]; });   // 蛇形分隊：1、4、5、8 一隊，2、3、6、7 一隊
    // 一半機率是搶旗模式：三支旗點，先到 300 分的贏
    const flags = Math.random() < 0.5 ? { flags: [{ name: '北旗', x: 880, y: 300 }, { name: '中旗', x: 880, y: 560 }, { name: '南旗', x: 880, y: 820 }], flagGoal: 300 } : null;
    const room = makeRoom({ match: true, creator: specs[0].c.uid }, G => ({ ...G.Battle.duelScenario('', ''), name: `野戰配對${flags ? '・搶旗' : ''}（${specs.length} 人）`, desc: flags ? '佔領旗點累積分數，先到 300 分的贏（或打光對方）。' : '擊敗對方所有武將與兵團。', ...flags }));
    for (const { c, s } of specs) addPlayer(room, c, s);
    queueMsg();
  }
  setInterval(() => tryMatch().catch(e => console.error('配對', e)), 2000);

  async function join(conn, roomId, side) {
    const room = rooms.get(roomId);
    if (!room || room.done) return send(conn, { t: 'b.err', text: '這場戰鬥已經結束' });
    if (conn.room) return send(conn, { t: 'b.err', text: '你已經在戰鬥中' });
    const team = side === 1 ? 1 : 0;
    if (team === 1 && !isDefender(room, conn.uid)) return send(conn, { t: 'b.err', text: '只有城主和他的家族可以回防' });
    if (team === 0 && isDefender(room, conn.uid)) return send(conn, { t: 'b.err', text: '城主和他的家族只能守城' });
    if ([...room.players.values()].some(p => p.conn.uid === conn.uid)) return send(conn, { t: 'b.err', text: '你已經在這場戰鬥裡' });
    const spec = await commanderSpec(conn, team);
    if (spec.error) return send(conn, { t: 'b.err', text: spec.error });
    addPlayer(room, conn, spec);
    room.G.Battle.notify(null, `${conn.name} 加入${team === 1 ? '守方' : '攻方'}`);
    announce();
  }
  /** 這個人是不是這座城的守方（城主，或跟城主同一個家族） */
  const isDefender = (room, uid) => !!room.ownerId && (uid === room.ownerId || social.sameGuild(uid, room.ownerId));
  /** 正在打的戰鬥（大地圖上標「交戰中」，走到城門口按 Enter 加入） */
  const fights = () => [...rooms.values()].filter(r => !r.done && r.city).map(r => ({ room: r.id, city: r.city, owner: r.ownerId, n: r.players.size }));
  const announce = () => live.broadcast({ t: 'b.rooms', list: fights() });
  /** 從伺服器上的存檔組出指揮官（兵團、等級、武器都以伺服器為準） */
  async function commanderSpec(conn, team) {
    const { rows: [p] } = await db.query('SELECT data FROM profiles WHERE user_id = $1', [conn.uid]);
    if (!p || !p.data) return { error: '找不到存檔' };
    const s = p.data.settings || {}, weapon = game.G.WEAPONS && game.G.WEAPONS[s.weapon] ? s.weapon : 'sword';
    const { result: lo } = game.withProfile(p.data, G => ({ ...G.Army.loadout(), level: G.Army.heroLevel(), hero: G.Army.heroSpec(weapon) }));
    if (!lo.escort.length) return { error: '沒有隨身兵團：先到城裡的募兵處勾選' };
    return { uid: conn.uid, team, name: conn.name, weapon, look: s.look, heroLevel: lo.level, ...lo.hero,
      squads: lo.escort, field: lo.field, fieldOrder: s.fieldOrder, profile: p.data };
  }
  function addPlayer(room, conn, spec) {
    const held = new Set(), hit = new Set();
    const orders = [];
    const input = { down: k => held.has(k), pressed: k => hit.has(k), orders: () => orders.splice(0) };
    const cmdr = room.G.Battle.join({ ...spec, id: conn.id, input });
    const p = { conn, cmdr, held, hit, orders, msgs: [], team: spec.team, startProfile: spec.profile };
    room.players.set(conn.id, p);
    conn.room = room; conn.scene = 'battle';
    send(conn, { t: 'b.start', room: room.id, team: spec.team, me: cmdr.id, scenario: room.scenario });
  }
  /** 瀏覽器送來的按鍵 */
  function input(conn, m) {
    const p = conn.room && conn.room.players.get(conn.id);
    if (!p) return;
    const ok = k => typeof k === 'string' && k.length < 16;
    p.held.clear(); for (const k of (Array.isArray(m.held) ? m.held : []).slice(0, 20)) if (ok(k)) p.held.add(k);
    for (const k of (Array.isArray(m.hit) ? m.hit : []).slice(0, 20)) if (ok(k)) p.hit.add(k);
    // 滑鼠指揮：只收認得的欄位（a 是短字串、座標是數字）
    for (const o of (Array.isArray(m.orders) ? m.orders : []).slice(0, 6)) if (o && ok(o.a) && p.orders.length < 20)
      p.orders.push({ a: o.a, g: o.g === 'field' ? 'field' : 'escort', ...Object.fromEntries(['x', 'y', 'x2', 'y2'].map(k => [k, Number.isFinite(o[k]) ? o[k] : undefined])) });   // x2、y2：拉線、框選的另一端
  }
  /** 撤退或斷線：照目前的傷亡結算（算輸），武將和兵團撤出戰場 */
  async function leave(conn, why = '撤退') {
    const room = conn.room; if (!room) return;
    const p = room.players.get(conn.id); conn.room = null;
    if (!p || room.done) return;
    room.players.delete(conn.id);
    const rep = room.G.Battle.report(p.cmdr);
    room.G.Battle.leave(p.cmdr);
    room.G.Battle.notify(null, `${conn.name} ${why}`);
    const report = await settle(p, false, rep, room);
    send(conn, { t: 'b.end', win: false, msg: why, report, left: true });
    if (!room.players.size) close(room);   // 沒有玩家了：電腦方贏，房間收掉
  }

  /* ---------- 每一步 ---------- */
  function step(room) {
    if (room.done) return;
    const B = room.G.Battle;
    try { B.update(TICK); } catch (e) { console.error('戰鬥模擬錯誤', e); return close(room); }
    for (const p of room.players.values()) p.hit.clear();
    if (room.done) return;
    const common = snapshot(room);
    room.fx.length = 0;
    for (const p of room.players.values()) {
      const msg = JSON.stringify({ ...common, me: meOf(room, p) });
      p.msgs.length = 0;
      send(p.conn, msg);
    }
  }

  /** 房裡所有人看到的戰場狀態 */
  function snapshot(room) {
    const { G } = room, B = G.Battle, castle = G.Map.castle;
    const U = [], H = [], S = [];
    for (const sq of B.squads) {
      S.push([sq.nid, sq.team, sq.typeKey, sq.label || '', sq.owner ? sq.owner.id : 0, sq.ai ? 1 : 0, sq.field ? 1 : 0, sq.order || '', sq.alive.length, Math.round(sq.morale ?? 100), sq.rout > 0 ? 1 : 0]);
      for (const u of sq.units) U.push([u.nid, sq.nid, r1(u.x), r1(u.y), r1(u.z), r2(u.face), u.moving ? 1 : u.anim === 'Attack' ? 2 : 0, u.dead ? r2(u.dead) : 0, u.flash > 0 ? 1 : 0, u.down > 0 ? r2(u.down * (u.downDir || 1)) : 0]);   // 最後一欄：擊倒剩幾秒（正負是倒向哪邊）
    }
    for (const h of B.heroes) {
      const anim = h.whirl > 0 ? 'Whirl' : h.action ? h.action.anim : h.moving ? 'Walk' : 'Idle';
      H.push([h.nid, h.team, r1(h.x), r1(h.y), r1(h.z), r2(h.face), anim, Math.round(h.hp), h.maxHp, h.dead ? r2(h.dead) : 0, h.respawnT !== undefined ? r1(h.respawnT) : -1,
        h.cmdr ? h.cmdr.id : 0, h.weaponKey, h.look || '', h.name || '', h.flash > 0 ? 1 : 0, h.respawnAt === 'here' ? 1 : 0,
        Math.round(h.stamina), h.buff && h.buff.until > B.time ? 1 : 0, (h.blocking ? 1 : 0) | (h.iframes > 0 ? 2 : 0) | (h.horse ? 4 : 0), h.down > 0 ? r2(h.down * (h.downDir || 1)) : 0]);   // 格擋、翻滾、擊倒
    }
    const P = G.Combat.projectiles.map(p => [r1(p.sx), r1(p.sy), r1(p.tx), r1(p.ty), r2(p.t), r2(p.dur), r1(p.arc), p.kind, p.fire ? 1 : 0]);
    const Z = G.Combat.zones.map(z => [r1(z.x), r1(z.y), z.r, r2(z.t), z.dur]);
    const E = G.Siege.engines.map(e => [e.kind, e.team, r1(e.x), r1(e.y), e.state, Math.round(e.hp), e.maxHp, e.dead ? r2(e.dead) : 0, r2(e.swing || 0), e.crew ? 1 : 0, e.radius, r1(e.buildT || 0)]);
    const HZ = G.Siege.hazards.map(h => [h.kind, r1(h.x), r1(h.y), r2(h.t), h.warn, h.r, r1(h.sx || 0), r1(h.sy || 0)]);
    const C = castle && { o: castle.openings.map(o => [o.kind, o.x, o.w, Math.round(o.hp || 0), o.maxHp || 0, o.open ? 1 : 0, o.up ? 1 : 0, o.flash > 0 ? 1 : 0]), p: castle.points.map(p => [r2(p.progress), p.taken ? 1 : 0]) };
    return { t: 'b.s', tm: r1(B.time), dp: r1(B.deployT || 0), dl: B.deployLen || 0, wx: B.weather, FL: (B.flags || []).map(f => [f.owner, r2(f.progress)]), FS: (B.flagScore || [0, 0]).map(Math.floor), U, H, S, P, Z, E, HZ, C, K: [...G.Combat.stats.kills], F: room.fx.slice() };
  }
  /** 只有自己看得到的：選取、後備、補給點、自己兵團的指令與技能冷卻、提示訊息 */
  function meOf(room, p) {
    const B = room.G.Battle, c = p.cmdr, near = B.nearSupply(c);
    const mine = B.squadsOfCmdr(c).map(sq => [sq.nid, sq.cmd, sq.formation, sq.crew ? sq.crew.kind : '', sq.skillCd, sq.fx, sq.waypoint ? 1 : 0, sq.spread ? 1 : 0, sq.focus ? 1 : 0, sq.cmdCd || {}]);
    return { id: c.id, team: c.team, sk: c.hero.skillSet, kit: c.kit, ks: c.kitSel, kl: c.kitLeft, sel: c.select, res: c.reserve.map(r => ({ type: r.type, men: r.men, level: r.level || 1 })), so: c.supplyOpen ? 1 : 0, grp: c.group, cd: r1(c.supplyCd),
      near: near ? [near.x, near.y] : null, sup: B.supplyPoints(c.team).map(s => [s.x, s.y]), sq: mine, msg: p.msgs.slice() };
  }

  /* ---------- 結束與結算 ---------- */
  async function finish(room, r) {
    if (room.done) return;
    room.done = true;
    const B = room.G.Battle;
    // 攻方贏了，城池歸誰：佔下主堡的人有隊伍就歸隊長，沒有就歸他自己（找不到人就歸開戰的人）
    if (room.city && r.winTeam === 0) {
      const cap = [...room.players.values()].find(p => p.cmdr === B.capturedBy);
      const leader = cap && cap.conn.party ? cap.conn.party.leader : cap && cap.conn;
      room.winner = leader ? leader.uid : room.creator;
    }
    for (const p of room.players.values()) {
      const win = p.team === r.winTeam, rep = B.report(p.cmdr);
      // 配對、對決：開戰不到 MIN_FIGHT 秒就贏（對手一上場就撤退）不給勝利獎勵，避免開小號送獎勵
      const early = (room.match || room.duel) && B.time - (B.deployLen || 0) < MIN_FIGHT;
      const report = await settle(p, win && !early, rep, room);
      if (win && early) report.tooFast = true;
      send(p.conn, { t: 'b.end', win, msg: win ? r.msg : r.loseMsg, report });
      p.conn.room = null;
    }
    if (room.winner) {
      const c = game.G.WORLD.cities.find(c => c.id === room.city);
      await db.query(`INSERT INTO world_cities (city_id, owner_id, city_name, art, shield_until) VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))
        ON CONFLICT (city_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, city_name = EXCLUDED.city_name, art = EXCLUDED.art, updated_at = now(), collected_at = now(), shield_until = EXCLUDED.shield_until`,
        [c.id, room.winner, c.name, c.art, game.G.WORLD.siegeWindow.shieldH]);
      await live.broadcastCities();
    }
    close(room);
  }
  /** 用伺服器上的模擬結果結算一個玩家（同一份 G.Army.settle）；城池獎賞只給開戰的人 */
  async function settle(p, win, rep, room) {
    if (room.solo === 'drill') { const data = await profiles.load(p.conn.uid); return { gold: 0, heroXp: 0, heroUp: 0, heroLevel: data.hero.level, squads: [], drill: true, data }; }   // 演習不計傷亡、不給獎勵
    const kind = room.city ? 'city' : room.solo || (room.match ? 'match' : 'duel');
    const r = await profiles.edit(p.conn.uid, data => game.withProfile(data, G => {
      const W = G.WORLD, P = G.Army.profile();
      const out = G.Army.settle(win, rep.squads.map(s => ({ rosterId: s.rosterId, alive: { length: s.alive }, kills: s.kills })), rep.heroKills, { kind, tier: room.tier });
      if (win && p.team === 0 && room.winner && p.conn.uid === room.winner) {
        const c = W.cities.find(c => c.id === room.city);
        P.gold += c.gold; out.gold += c.gold; out.captured = c.id;
      }
      // 單人戰鬥打贏的大地圖獎賞：強盜（營地冷卻）、北境軍、商隊
      if (win && kind === 'bandit') {
        const g = W.banditGold[room.tier]; P.gold += g; out.gold += g;
        P.world = P.world || {}; P.world.cooldown = { ...(P.world.cooldown || {}), [room.target]: Date.now() + W.respawnH * 60 / W.minutesPerSec * 1000 };
      }
      if (win && (kind === 'raid' || kind === 'caravan')) { const g = kind === 'raid' ? W.raidGold : W.caravanGold; P.gold += g; out.gold += g; out.raid = room.target; }
      return out;
    }));
    if (r.result.raid) world.defeat(room.target);
    return { ...r.result, data: r.data };
  }
  function close(room) {
    room.done = true; clearInterval(room.timer);
    for (const p of room.players.values()) if (p.conn.room === room) p.conn.room = null;
    setTimeout(() => rooms.delete(room.id), 5000);
    announce();
  }

  const send = (c, msg) => { if (c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };

  /** live.js 收到 b.* 訊息時呼叫 */
  function onMessage(conn, m) {
    if (m.t === 'b.attack' && typeof m.city === 'string') attack(conn, m.city).catch(e => { console.error(e); send(conn, { t: 'b.err', text: '開戰失敗' }); });
    else if (m.t === 'b.join' && Number.isInteger(m.room)) join(conn, m.room, m.side).catch(e => { console.error(e); send(conn, { t: 'b.err', text: '加入失敗' }); });
    else if (m.t === 'b.duel' && Number.isInteger(m.to)) duel(conn, m.to);
    else if (m.t === 'b.duelAnswer') duelAnswer(conn, !!m.ok).catch(e => { console.error(e); send(conn, { t: 'b.err', text: '對決開始失敗' }); });
    else if (m.t === 'b.in') input(conn, m);
    else if (m.t === 'b.leave') leave(conn).catch(e => console.error(e));
    else if (m.t === 'b.queue') m.on ? queueJoin(conn) : queueLeave(conn);   // 野戰配對
    else if (m.t === 'b.solo' && typeof m.kind === 'string') solo(conn, { kind: m.kind, target: m.target }).catch(e => { console.error(e); send(conn, { t: 'b.err', text: '開戰失敗' }); });   // 單人戰鬥
  }
  return { onMessage, leave, sandbox, fights, get count() { return rooms.size; } };
}
