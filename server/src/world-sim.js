/* ============ world-sim.js — 大地圖上所有玩家共用的事：城池收入、糧食、北境聯軍進犯 ============
 * - 收入：佔領的城每小時產 G.WORLD.incomeOf(城) 金，最多累積 24 小時；玩家進城或到大地圖時領（POST /api/world/collect）
 * - 糧食：存檔的 food（伺服器決定）。在大地圖上（live.js 的場景是 'world'）每 30 秒吃 ceil(出戰人數 / 40)；
 *         吃完就斷糧：每 30 秒隨機一支出戰兵團少一個人，並通知玩家。旅店買糧（G.Army.buyFood）
 * - 北境聯軍：有玩家佔城時，每隔一段時間從北方出發一支軍隊，沿著不擋路的格子走向某座玩家的城；
 *         走到城門口就攻陷（城池變回空城）。玩家可以在半路碰上去打野戰（出戰單 kind 'raid'），打贏就消滅它。
 *   每秒把聯軍的位置送給在大地圖上的玩家：{ t: 'raids', list: [{ id, x, y, men, target }] }
 */
const FOOD_EVERY = 30 * 1000;
const RAID_EVERY = 4 * 60 * 1000, RAID_SPEED = 55, MAX_RAIDS = 2;
const RAID_SQUADS = [['axeman', 14], ['pikeman', 20], ['archer', 16], ['cavalry', 10], ['shieldman', 16], ['crossbowman', 16], ['halberdier', 18]];
const CELL = 32;

export function createWorldSim({ db, game, live }) {
  const { G } = game, W = G.WORLD;
  const raids = [];
  let nextRaid = 1, raidT = Date.now() + 60 * 1000;

  /* ---------- 尋路格子：山、湖、河、城池擋路 ---------- */
  const cols = Math.ceil(W.size.w / CELL), rows = Math.ceil(W.size.h / CELL);
  const blockedAt = (x, y) => G.TOWNS.world.buildings.some(b => b.fw && (b.ellipse
    ? ((x - b.x) / (b.fw / 2 + 10)) ** 2 + ((y - b.y + b.fh / 2) / (b.fh / 2 + 10)) ** 2 < 1
    : x > b.x - b.fw / 2 - 10 && x < b.x + b.fw / 2 + 10 && y > b.y - b.fh - 10 && y < b.y + 10));
  const grid = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) grid[r * cols + c] = blockedAt(c * CELL + CELL / 2, r * CELL + CELL / 2) ? 1 : 0;
  /** 格子上的 BFS（四方向＋斜角），回傳一串世界座標 */
  function path(fx, fy, tx, ty) {
    const cell = (x, y) => Math.max(0, Math.min(rows - 1, Math.floor(y / CELL))) * cols + Math.max(0, Math.min(cols - 1, Math.floor(x / CELL)));
    const start = cell(fx, fy), goal = cell(tx, ty), prev = new Int32Array(cols * rows).fill(-1);
    const q = [start]; prev[start] = start; grid[goal] = 0;
    for (let i = 0; i < q.length; i++) {
      const cur = q[i]; if (cur === goal) break;
      const cx = cur % cols, cy = (cur / cols) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx, ny = cy + dy, n = ny * cols + nx;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || prev[n] !== -1 || grid[n]) continue;
        if (dx && dy && (grid[cy * cols + nx] || grid[ny * cols + cx])) continue;   // 斜角不能切過障礙的角
        prev[n] = cur; q.push(n);
      }
    }
    if (prev[goal] === -1) return [[tx, ty]];
    const out = [];
    for (let c = goal; c !== start; c = prev[c]) out.push([(c % cols) * CELL + CELL / 2, ((c / cols) | 0) * CELL + CELL / 2]);
    return out.reverse().filter((_, i, a) => i % 2 === 0 || i === a.length - 1);
  }

  /* ---------- 北境聯軍 ---------- */
  async function owned() { return (await db.query('SELECT city_id, owner_id, city_name FROM world_cities')).rows; }
  async function spawnRaid() {
    const list = (await owned()).filter(o => !raids.some(r => r.target === o.city_id));
    if (!list.length || raids.length >= MAX_RAIDS) return;
    const o = list[Math.floor(Math.random() * list.length)], c = W.cities.find(c => c.id === o.city_id);
    if (!c) return;
    const from = [[450, 380], [5780, 380], [5780, 3520], [380, 3520]][Math.floor(Math.random() * 4)];   // 從地圖四個角落出發
    const gate = { x: c.x, y: c.y + 40 };
    const members = [...RAID_SQUADS].sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 2));
    const r = { id: nextRaid++, x: from[0], y: from[1], target: c.id, targetName: o.city_name, owner: o.owner_id, members, path: path(from[0], from[1], gate.x, gate.y) };
    raids.push(r);
    live.broadcast({ t: 'chat', name: '系統', text: `北境聯軍出兵了，朝「${o.city_name}」進軍！在路上攔截就能擋下` });
    live.sendTo(o.owner_id, { t: 'b.msg', text: `北境聯軍朝你的城「${o.city_name}」進軍！` });
  }
  async function arrive(r) {
    raids.splice(raids.indexOf(r), 1);
    await db.query('DELETE FROM world_cities WHERE city_id = $1', [r.target]);
    live.broadcast({ t: 'chat', name: '系統', text: `北境聯軍攻陷了「${r.targetName}」，那裡又變回空城` });
    await live.broadcastCities();
  }
  /** 玩家打贏攔截戰：消滅這支聯軍 */
  function defeat(id) { const i = raids.findIndex(r => r.id === id); if (i >= 0) { const r = raids.splice(i, 1)[0]; live.broadcast({ t: 'chat', name: '系統', text: `「${r.targetName}」前的北境聯軍被擊潰了` }); } }
  const raidOf = id => raids.find(r => r.id === id);

  let last = Date.now();
  const tick = setInterval(() => {
    const now = Date.now(), dt = (now - last) / 1000; last = now;
    for (const r of [...raids]) {
      let move = RAID_SPEED * dt;
      while (move > 0 && r.path.length) {
        const [px, py] = r.path[0], d = Math.hypot(px - r.x, py - r.y);
        if (d <= move) { r.x = px; r.y = py; r.path.shift(); move -= d; } else { r.x += (px - r.x) / d * move; r.y += (py - r.y) / d * move; move = 0; }
      }
      if (!r.path.length) arrive(r).catch(e => console.error(e));
    }
    if (now > raidT) { raidT = now + RAID_EVERY; spawnRaid().catch(e => console.error(e)); }
    const list = raids.map(r => ({ id: r.id, x: Math.round(r.x), y: Math.round(r.y), men: r.members.reduce((a, m) => a + m[1], 0), target: r.target, members: r.members }));
    for (const c of live.connections()) if (c.scene === 'world') live.send(c, { t: 'raids', list });
  }, 1000);

  /* ---------- 糧食 ---------- */
  const food = setInterval(async () => {
    const uids = [...new Set(live.connections().filter(c => c.scene === 'world').map(c => c.uid))];
    for (const uid of uids) {
      try {
        const { rows: [p] } = await db.query('SELECT data FROM profiles WHERE user_id = $1', [uid]);
        if (!p || !p.data || !Array.isArray(p.data.roster)) continue;
        const d = p.data, out = d.roster.filter(s => (s.deployed || s.field) && s.men > 0);
        const men = out.reduce((a, s) => a + s.men, 0);
        if (!men) continue;
        d.food = Math.max(0, (d.food ?? 200) - Math.ceil(men / 40));
        let starve = false;
        if (d.food === 0) { const s = out[Math.floor(Math.random() * out.length)]; s.men--; starve = true; }
        await db.query('UPDATE profiles SET data = $2, updated_at = now() WHERE user_id = $1', [uid, JSON.stringify(d)]);
        live.sendTo(uid, { t: 'food', food: d.food, starve, roster: starve ? d.roster : undefined });
      } catch (e) { console.error('糧食', e); }
    }
  }, FOOD_EVERY);

  /* ---------- 城池收入 ---------- */
  async function collect(uid) {
    const { rows } = await db.query(`SELECT city_id, EXTRACT(EPOCH FROM (now() - collected_at)) AS sec FROM world_cities WHERE owner_id = $1`, [uid]);
    let gold = 0;
    for (const r of rows) {
      const c = W.cities.find(c => c.id === r.city_id); if (!c) continue;
      const g = Math.floor(Math.min(24, +r.sec / 3600) * W.incomeOf(c));
      if (g > 0) { gold += g; await db.query('UPDATE world_cities SET collected_at = now() WHERE city_id = $1', [r.city_id]); }
    }
    return gold;
  }

  return { raidOf, defeat, collect, close: () => { clearInterval(tick); clearInterval(food); } };
}
