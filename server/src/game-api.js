/* ============ game-api.js — 由伺服器決定的遊戲資料（防作弊）============
 * 金幣、經驗、名冊、城池歸屬都只能經過這裡改；瀏覽器的 PUT /api/profile 只能存設定、旗幟、大地圖上的位置。
 *   POST /api/army          名冊操作 { op, args }：recruit / refill / dismiss / toggleDeploy / buyVet / resetVet
 *   POST /api/battle/start  開戰拿出戰單 { kind: 'city' | 'bandit' | 'drill', target }
 *   POST /api/battle/end    戰後結算 { ticket, win, squads: [{ rosterId, alive, kills }], heroKills }
 *   GET  /api/world         城池歸屬（誰佔的、城名、城堡樣子、旗幟）
 *   POST /api/world/city    改自己城池的名字、城堡樣子 { id, name, art }
 * 結算規則：
 *   - 只認出戰單開出時名冊上的出戰兵團；存活人數不能比出發時多；擊殺總數不能超過敵軍總數
 *   - 打贏至少要打 MIN_WIN_SECONDS 秒；演習（drill）不給獎勵也不扣兵
 *   - 攻城打贏：城池歸你、拿城池獎賞；強盜打贏：拿獎賞，那個營地冷卻（現實時間）後才能再打
 * 戰鬥本身目前還是在瀏覽器算，所以「假裝打贏」還擋不住；要等戰鬥搬到伺服器（多人同場）才完全防得住。
 */
import crypto from 'node:crypto';

const MIN_WIN_SECONDS = 15;
const TICKET_TTL = 2 * 3600 * 1000;

export function registerGameApi(app, { db, game, live, world, requireUser }) {
  const { G, withProfile } = game;
  const tickets = new Map();   // 出戰單 id → { uid, kind, target, start, squads: Map(rosterId → men), enemies }

  /* ---------- 存檔讀寫 ---------- */
  async function load(uid) {
    const { rows: [p] } = await db.query('SELECT data FROM profiles WHERE user_id = $1', [uid]);
    let data = p && p.data;
    if (!data || !Array.isArray(data.roster)) { data = withProfile(null, () => {}).data; await store(uid, data); }
    return data;
  }
  async function store(uid, data) {
    await db.query(`INSERT INTO profiles (user_id, data, updated_at) VALUES ($1, $2, now())
      ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [uid, JSON.stringify(data)]);
  }

  app.get('/api/profile', { preHandler: requireUser }, async req => ({ data: await load(req.user.id) }));

  /** 瀏覽器只能改：設定、旗幟、大地圖位置與強盜（其他欄位一律用伺服器上的） */
  app.put('/api/profile', { preHandler: requireUser }, async (req, reply) => {
    const d = (req.body && req.body.data) || {};
    const data = await load(req.user.id);
    if (d.settings !== undefined) {
      if (!d.settings || typeof d.settings !== 'object' || JSON.stringify(d.settings).length > 2000) return reply.code(400).send({ error: '設定資料不合理' });
      data.settings = d.settings;
    }
    if (d.flag !== undefined) {
      const f = d.flag;
      if (!f || typeof f !== 'object' || JSON.stringify(f).length > 9000 ||
        (f.d === 'image' ? !(typeof f.src === 'string' && f.src.startsWith('data:image/png;base64,')) : f.d !== 'design')) return reply.code(400).send({ error: '旗幟資料不合理' });
      data.flag = f;
    }
    if (d.world !== undefined) {
      const w = d.world;
      if (!w || typeof w !== 'object' || JSON.stringify(w).length > 20000) return reply.code(400).send({ error: '大地圖資料不合理' });
      const cur = data.world || {};
      data.world = { ...cur, x: +w.x || 0, y: +w.y || 0, minutes: +w.minutes || 0, bandits: Array.isArray(w.bandits) ? w.bandits : [], respawn: w.respawn && typeof w.respawn === 'object' ? w.respawn : {} };
    }
    await store(req.user.id, data);
    live.updateUser(req.user.id, data);
    if (d.flag !== undefined) live.broadcast({ t: 'cities', cities: await cities() });
    return { ok: true };
  });

  /* ---------- 名冊操作：在伺服器上跑同一份 G.Army ---------- */
  const OPS = {
    recruit: a => typeof a[0] === 'string' && G.UNITS[a[0]] && G.ARMY.leadership[a[0]],
    refill: a => Number.isInteger(a[0]),
    dismiss: a => Number.isInteger(a[0]),
    toggleDeploy: a => Number.isInteger(a[0]) && (a[1] === undefined || a[1] === 'escort' || a[1] === 'field'),
    buyVet: a => Number.isInteger(a[0]) && (a[1] === 0 || a[1] === 1),
    resetVet: a => Number.isInteger(a[0]),
    buyFood: a => [50, 100, 500].includes(a[0]),
  };
  app.post('/api/army', { preHandler: requireUser }, async (req, reply) => {
    const { op, args = [] } = req.body || {};
    if (!OPS[op] || !Array.isArray(args) || !OPS[op](args)) return reply.code(400).send({ error: '不合理的操作' });
    const r = withProfile(await load(req.user.id), G => G.Army[op](...args));
    if (!r.result) await store(req.user.id, r.data);
    return { error: r.result || null, data: r.data };
  });

  /* ---------- 出戰單與結算 ---------- */
  const enemyCount = (kind, target) => {
    if (kind === 'city') { const c = G.WORLD.cities.find(c => c.id === target); return c.garrison.reduce((a, g) => a + g[1], 0) + 1; }
    if (kind === 'raid') { const r = world.raidOf(target); return r.members.reduce((a, g) => a + g[1], 0); }
    const camp = G.WORLD.camps.find(c => c.id === target);
    return Math.max(...G.WORLD.bandits[camp.tier].map(list => list.reduce((a, g) => a + g[1], 0)));
  };
  const banditCooldown = () => G.WORLD.respawnH * 60 / G.WORLD.minutesPerSec * 1000;

  app.post('/api/battle/start', { preHandler: requireUser }, async (req, reply) => {
    const { kind, target } = req.body || {}, uid = req.user.id;
    const data = await load(uid);
    if (kind === 'city') {
      const c = G.WORLD.cities.find(c => c.id === target);
      if (!c || c.capital) return reply.code(400).send({ error: '這座城不能攻打' });
      const { rows: [own] } = await db.query('SELECT owner_id FROM world_cities WHERE city_id = $1', [target]);
      if (own && own.owner_id === uid) return reply.code(400).send({ error: '這是你自己的城' });
    } else if (kind === 'bandit') {
      if (!G.WORLD.camps.some(c => c.id === target)) return reply.code(400).send({ error: '沒有這個營地' });
      const at = data.world && data.world.cooldown && data.world.cooldown[target];
      if (at && at > Date.now()) return reply.code(400).send({ error: '這個營地的強盜還沒回來' });
    } else if (kind === 'raid') {
      if (!world.raidOf(target)) return reply.code(400).send({ error: '這支北境聯軍已經不在了' });
    } else if (kind !== 'drill') return reply.code(400).send({ error: '不合理的戰鬥' });
    for (const [id, t] of tickets) if (t.uid === uid || Date.now() - t.start > TICKET_TTL) tickets.delete(id);   // 一次只能有一張
    const squads = new Map(data.roster.filter(s => (s.deployed || s.field) && s.men > 0).map(s => [s.id, s.men]));
    const id = crypto.randomBytes(12).toString('hex');
    tickets.set(id, { uid, kind, target, start: Date.now(), squads, enemies: kind === 'drill' ? Infinity : enemyCount(kind, target) });
    return { ticket: id };
  });

  app.post('/api/battle/end', { preHandler: requireUser }, async (req, reply) => {
    const { ticket, win, squads = [], heroKills = 0 } = req.body || {}, uid = req.user.id;
    const t = tickets.get(ticket);
    if (!t || t.uid !== uid) return reply.code(400).send({ error: '出戰單無效（可能已經結算過）' });
    tickets.delete(ticket);
    const data = await load(uid);
    if (t.kind === 'drill') return { report: { gold: 0, heroXp: 0, heroUp: 0, heroLevel: data.hero.level, squads: [], drill: true }, data };
    // 檢查戰報
    if (!Array.isArray(squads) || !Number.isInteger(heroKills) || heroKills < 0) return reply.code(400).send({ error: '戰報格式錯誤' });
    const seen = new Set();
    for (const s of squads) {
      if (!s || !t.squads.has(s.rosterId) || seen.has(s.rosterId)) return reply.code(400).send({ error: '戰報裡有沒出戰的兵團' });
      if (!Number.isInteger(s.alive) || s.alive < 0 || s.alive > t.squads.get(s.rosterId)) return reply.code(400).send({ error: '存活人數不合理' });
      if (!Number.isInteger(s.kills) || s.kills < 0) return reply.code(400).send({ error: '擊殺數不合理' });
      seen.add(s.rosterId);
    }
    const kills = heroKills + squads.reduce((a, s) => a + s.kills, 0);
    if (kills > t.enemies) return reply.code(400).send({ error: '擊殺數超過敵軍人數' });
    const won = !!win && (Date.now() - t.start) / 1000 >= MIN_WIN_SECONDS;
    // 同一份結算規則（G.Army.settle），再加上大地圖的獎賞
    const r = withProfile(data, G => {
      const rep = G.Army.settle(won, squads.map(s => ({ rosterId: s.rosterId, alive: { length: s.alive }, kills: s.kills })), heroKills);
      const P = G.Army.profile();
      if (won && t.kind === 'city') { const c = G.WORLD.cities.find(c => c.id === t.target); P.gold += c.gold; rep.gold += c.gold; rep.captured = t.target; }
      if (won && t.kind === 'raid') { P.gold += G.WORLD.raidGold; rep.gold += G.WORLD.raidGold; rep.raid = t.target; }
      if (won && t.kind === 'bandit') {
        const camp = G.WORLD.camps.find(c => c.id === t.target), g = G.WORLD.banditGold[camp.tier];
        P.gold += g; rep.gold += g;
        P.world = P.world || {}; P.world.cooldown = { ...(P.world.cooldown || {}), [t.target]: Date.now() + banditCooldown() };
      }
      return rep;
    });
    await store(uid, r.data);
    if (r.result.raid) world.defeat(r.result.raid);
    if (r.result.captured) {
      const c = G.WORLD.cities.find(c => c.id === t.target);
      await db.query(`INSERT INTO world_cities (city_id, owner_id, city_name, art) VALUES ($1, $2, $3, $4)
        ON CONFLICT (city_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, city_name = EXCLUDED.city_name, art = EXCLUDED.art, updated_at = now(), collected_at = now()`,
        [c.id, uid, c.name, c.art]);
      live.broadcast({ t: 'cities', cities: await cities() });
    }
    if (win && !won) r.result.tooFast = true;
    return { report: r.result, data: r.data };
  });

  /* ---------- 共用的城池歸屬 ---------- */
  async function cities() {
    const { rows } = await db.query(`SELECT w.city_id, w.owner_id, w.city_name, w.art, u.username, p.data->'flag' AS flag
      FROM world_cities w JOIN users u ON u.id = w.owner_id LEFT JOIN profiles p ON p.user_id = w.owner_id`);
    const out = {};
    for (const r of rows) out[r.city_id] = { owner: r.owner_id, user: r.username, name: r.city_name, art: r.art, flag: r.flag || null };
    return out;
  }
  app.get('/api/world', { preHandler: requireUser }, async req => ({ me: req.user.id, cities: await cities() }));
  /** 領城池收入（進城、出城時呼叫） */
  app.post('/api/world/collect', { preHandler: requireUser }, async req => {
    const gold = await world.collect(req.user.id);
    if (!gold) return { gold: 0 };
    const data = await load(req.user.id); data.gold += gold; await store(req.user.id, data);
    return { gold, data };
  });

  live.attach(null, cities);

  app.post('/api/world/city', { preHandler: requireUser }, async (req, reply) => {
    const { id, name, art } = req.body || {};
    const c = G.WORLD.cities.find(c => c.id === id);
    if (!c) return reply.code(400).send({ error: '沒有這座城' });
    const { rows: [own] } = await db.query('SELECT owner_id FROM world_cities WHERE city_id = $1', [id]);
    if (!own || own.owner_id !== req.user.id) return reply.code(403).send({ error: '這不是你的城' });
    const n = typeof name === 'string' ? name.trim() : '';
    if (!n || [...n].length > 8 || n === '空城' || /[<>&"']/.test(n)) return reply.code(400).send({ error: '城池名稱 1～8 個字，不能有特殊符號' });
    if (!G.WORLD.castleArts.some(a => a.key === art)) return reply.code(400).send({ error: '沒有這種城堡樣子' });
    const { rows: dup } = await db.query('SELECT 1 FROM world_cities WHERE city_name = $1 AND city_id <> $2', [n, id]);
    if (dup.length || G.WORLD.cities.some(o => o.capital && o.name === n)) return reply.code(409).send({ error: '這個名字已經有人用了' });
    await db.query('UPDATE world_cities SET city_name = $1, art = $2, updated_at = now() WHERE city_id = $3', [n, art, id]);
    const all = await cities();
    live.broadcast({ t: 'cities', cities: all });
    return { cities: all };
  });
  return { cities };
}
