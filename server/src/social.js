/* ============ social.js — 好友、私訊、家族、市集、採集、攻城時段（docs/design.md 27～29）============
 *   GET  /api/social            好友（在線上嗎、誰邀請誰）、家族（成員、職位）、收到的家族邀請
 *   POST /api/friends           { op: 'add', name } / { op: 'accept' | 'remove', id }
 *   POST /api/guild             { op: 'create', name, tag } / { op: 'invite', name } / { op: 'accept' | 'decline', id } / { op: 'leave' } / { op: 'kick' | 'promote', id }
 *   GET  /api/market            市集上架的東西（最新 100 筆）
 *   POST /api/market            { op: 'sell', kind: 'mat', mat, n, price } / { op: 'sell', kind: 'item' | 'doc', i, price } / { op: 'buy' | 'cancel', id }
 *   POST /api/gather            { node }：在大地圖上採集（位置用 WebSocket 回報的，冷卻記在存檔）
 *   POST /api/requisition       { i }：向大地圖上的村子徵糧（G.TOWNS.world.buildings 第 i 個 hamlet）
 * WebSocket（live.js 轉過來）：{ t: 'pm', to: 帳號名稱, text } 私訊、{ t: 'gchat', text } 家族頻道
 * 市集：上架時東西就從賣家的存檔拿走（放在 market 表），買的人付金幣、賣家拿到扣稅後的錢；取消就還回去。
 */
const NAME_RE = /^[^<>&"'\s]+$/;

export function createSocial({ db, game, live, profiles }) {
  const { G } = game, W = G.WORLD;
  const guildOf = new Map();   // user id → { id, name, tag, role }（家族資料的快取，攻城回防、城池名牌用）

  async function refreshGuilds() {
    const { rows } = await db.query('SELECT m.user_id, m.role, g.id, g.name, g.tag FROM guild_members m JOIN guilds g ON g.id = m.guild_id');
    guildOf.clear();
    for (const r of rows) guildOf.set(r.user_id, { id: r.id, name: r.name, tag: r.tag, role: r.role });
    const { rows: al } = await db.query('SELECT a_id, b_id FROM guild_allies WHERE accepted');
    allies.clear();
    for (const r of al) { (allies.get(r.a_id) || allies.set(r.a_id, new Set()).get(r.a_id)).add(r.b_id); (allies.get(r.b_id) || allies.set(r.b_id, new Set()).get(r.b_id)).add(r.a_id); }
  }
  const allies = new Map();   // 家族 id → 結盟的家族 id
  /** 自己人：同一個家族，或兩個家族結盟（城不能互打、可以回防） */
  const sameGuild = (a, b) => {
    const ga = a && guildOf.get(a), gb = b && guildOf.get(b);
    return !!(ga && gb && (ga.id === gb.id || (allies.get(ga.id) && allies.get(ga.id).has(gb.id))));
  };
  const alliesOf = gid => [...(allies.get(gid) || [])];
  const online = uid => live.connections().some(c => c.uid === uid);
  const userByName = async name => (await db.query('SELECT id, username FROM users WHERE lower(username) = lower($1)', [String(name || '')])).rows[0];
  const notice = (uid, text) => live.sendTo(uid, { t: 'b.msg', text });

  /* ---------- 好友 ---------- */
  async function socialOf(uid) {
    const { rows: fr } = await db.query(`SELECT f.user_id, f.friend_id, f.accepted, a.username AS a_name, b.username AS b_name FROM friends f
      JOIN users a ON a.id = f.user_id JOIN users b ON b.id = f.friend_id WHERE f.user_id = $1 OR f.friend_id = $1`, [uid]);
    // 每個對象一筆：有任何一列 accepted 就是好友；不然看是誰邀請誰（incoming：對方邀請我）
    const byOther = new Map();
    for (const r of fr) {
      const other = r.user_id === uid ? r.friend_id : r.user_id, f = byOther.get(other) || { id: other, name: r.user_id === uid ? r.b_name : r.a_name, accepted: false, incoming: true };
      if (r.accepted) f.accepted = true;
      if (r.user_id === uid) f.incoming = false;   // 我邀請過他
      byOther.set(other, f);
    }
    const friends = [...byOther.values()].map(f => ({ ...f, incoming: !f.accepted && f.incoming, online: online(f.id) }));
    const g = guildOf.get(uid);
    let guild = null;
    if (g) {
      const { rows: ms } = await db.query('SELECT m.user_id, m.role, u.username FROM guild_members m JOIN users u ON u.id = m.user_id WHERE m.guild_id = $1 ORDER BY m.joined_at', [g.id]);
      guild = { ...g, members: ms.map(m => ({ id: m.user_id, name: m.username, role: m.role, online: online(m.user_id) })) };
      // 聯盟：結盟的家族、別人提出的結盟邀請
      guild.allies = (await db.query('SELECT id, name, tag FROM guilds WHERE id = ANY($1::int[])', [alliesOf(g.id)])).rows;
      guild.allyInvites = (await db.query('SELECT g.id, g.name, g.tag FROM guild_allies a JOIN guilds g ON g.id = a.a_id WHERE a.b_id = $1 AND NOT a.accepted', [g.id])).rows;
    }
    const { rows: inv } = await db.query('SELECT g.id, g.name, g.tag FROM guild_invites i JOIN guilds g ON g.id = i.guild_id WHERE i.user_id = $1', [uid]);
    return { me: uid, friends, guild, invites: inv, guildCost: W.guild.createCost };
  }

  async function friendsOp(uid, b) {
    if (b.op === 'add') {
      const u = await userByName(b.name);
      if (!u) return { error: '找不到這個帳號' };
      if (u.id === uid) return { error: '不能加自己' };
      const { rows: [back] } = await db.query('SELECT 1 FROM friends WHERE user_id = $1 AND friend_id = $2', [u.id, uid]);
      if (back) return friendsOp(uid, { op: 'accept', id: u.id });   // 對方已經邀請過你：直接成為好友
      await db.query('INSERT INTO friends (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [uid, u.id]);
      notice(u.id, '有人想加你好友，到會館的「社群」看看'); live.sendTo(u.id, { t: 'social' });
      return { ok: `已送出好友邀請給 ${u.username}` };
    }
    const id = Number(b.id);
    if (!Number.isInteger(id)) return { error: '不合理的操作' };
    if (b.op === 'accept') {
      const { rowCount } = await db.query('UPDATE friends SET accepted = true WHERE user_id = $1 AND friend_id = $2', [id, uid]);
      if (!rowCount) return { error: '沒有這個好友邀請' };
      await db.query('INSERT INTO friends (user_id, friend_id, accepted) VALUES ($1, $2, true) ON CONFLICT (user_id, friend_id) DO UPDATE SET accepted = true', [uid, id]);
      live.sendTo(id, { t: 'social' });
      return { ok: '成為好友了' };
    }
    if (b.op === 'remove') {
      await db.query('DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [uid, id]);
      live.sendTo(id, { t: 'social' });
      return { ok: '已刪除' };
    }
    return { error: '不合理的操作' };
  }

  /* ---------- 家族 ---------- */
  async function guildOp(uid, b) {
    const my = guildOf.get(uid);
    const out = async r => { await refreshGuilds(); await live.broadcastCities(); return r; };
    if (b.op === 'create') {
      if (my) return { error: '你已經在家族裡了' };
      const name = String(b.name || '').trim(), tag = String(b.tag || '').trim();
      if (!name || [...name].length > W.guild.nameMax || !NAME_RE.test(name)) return { error: `家族名稱 1～${W.guild.nameMax} 個字，不能有空白或特殊符號` };
      if (!tag || [...tag].length > W.guild.tagMax || !NAME_RE.test(tag)) return { error: `簡稱 1～${W.guild.tagMax} 個字` };
      const { rows: dup } = await db.query('SELECT 1 FROM guilds WHERE lower(name) = lower($1) OR lower(tag) = lower($2)', [name, tag]);
      if (dup.length) return { error: '名稱或簡稱已經有人用了' };
      const pay = await profiles.edit(uid, data => data.gold < W.guild.createCost ? { error: `金幣不足（需要 ${W.guild.createCost}）` } : (data.gold -= W.guild.createCost, { data }));
      if (pay.error) return pay;
      const { rows: [g] } = await db.query('INSERT INTO guilds (name, tag, leader_id) VALUES ($1, $2, $3) RETURNING id', [name, tag, uid]);
      await db.query("INSERT INTO guild_members (user_id, guild_id, role) VALUES ($1, $2, 'leader')", [uid, g.id]);
      return out({ ok: `建立家族「${name}」`, data: pay.data });
    }
    if (b.op === 'invite') {
      if (!my || my.role === 'member') return { error: '只有族長、幹部可以邀請' };
      const u = await userByName(b.name);
      if (!u) return { error: '找不到這個帳號' };
      if (guildOf.get(u.id)) return { error: `${u.username} 已經有家族了` };
      const { rows: [{ n }] } = await db.query('SELECT count(*)::int AS n FROM guild_members WHERE guild_id = $1', [my.id]);
      if (n >= W.guild.max) return { error: `家族最多 ${W.guild.max} 人` };
      await db.query('INSERT INTO guild_invites (guild_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [my.id, u.id]);
      notice(u.id, `家族「${my.name}」邀請你加入，到會館的「社群」接受`); live.sendTo(u.id, { t: 'social' });
      return { ok: `已邀請 ${u.username}` };
    }
    if (b.op === 'accept' || b.op === 'decline') {
      const gid = Number(b.id);
      const { rowCount } = await db.query('DELETE FROM guild_invites WHERE guild_id = $1 AND user_id = $2', [gid, uid]);
      if (!rowCount) return { error: '沒有這個邀請' };
      if (b.op === 'decline') return { ok: '已拒絕' };
      if (my) return { error: '先離開目前的家族' };
      await db.query("INSERT INTO guild_members (user_id, guild_id, role) VALUES ($1, $2, 'member')", [uid, gid]);
      await db.query('DELETE FROM guild_invites WHERE user_id = $1', [uid]);
      return out({ ok: '加入家族' });
    }
    if (!my) return { error: '你沒有家族' };
    // 聯盟（族長才能操作）：ally 用簡稱邀請另一個家族、allyAccept 接受、allyBreak 解除（兩邊都通知）
    if (b.op === 'ally' || b.op === 'allyAccept' || b.op === 'allyBreak') {
      if (my.role !== 'leader') return { error: '只有族長可以處理結盟' };
      const leaderOf = async gid => (await db.query('SELECT leader_id FROM guilds WHERE id = $1', [gid])).rows[0];
      if (b.op === 'ally') {
        const { rows: [g] } = await db.query('SELECT id, name FROM guilds WHERE lower(tag) = lower($1)', [String(b.tag || '')]);
        if (!g || g.id === my.id) return { error: '找不到這個家族（用簡稱）' };
        if (alliesOf(my.id).includes(g.id)) return { error: '已經結盟了' };
        const { rows: [back] } = await db.query('SELECT 1 FROM guild_allies WHERE a_id = $1 AND b_id = $2', [g.id, my.id]);
        if (back) return guildOp(uid, { op: 'allyAccept', id: g.id });   // 對方已經邀請過：直接結盟
        await db.query('INSERT INTO guild_allies (a_id, b_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [my.id, g.id]);
        const l = await leaderOf(g.id); if (l) { notice(l.leader_id, `家族「${my.name}」想跟你們結盟，到會館的「社群」接受`); live.sendTo(l.leader_id, { t: 'social' }); }
        return { ok: `已向「${g.name}」提出結盟` };
      }
      const gid = Number(b.id);
      if (b.op === 'allyAccept') {
        const { rowCount } = await db.query('UPDATE guild_allies SET accepted = true WHERE a_id = $1 AND b_id = $2', [gid, my.id]);
        if (!rowCount) return { error: '沒有這個結盟邀請' };
        const l = await leaderOf(gid); if (l) { notice(l.leader_id, `家族「${my.name}」接受了結盟`); live.sendTo(l.leader_id, { t: 'social' }); }
        return out({ ok: '結盟了' });
      }
      await db.query('DELETE FROM guild_allies WHERE (a_id = $1 AND b_id = $2) OR (a_id = $2 AND b_id = $1)', [my.id, gid]);
      const l = await leaderOf(gid); if (l) { notice(l.leader_id, `家族「${my.name}」解除了結盟`); live.sendTo(l.leader_id, { t: 'social' }); }
      return out({ ok: '解除結盟' });
    }
    if (b.op === 'leave') {
      await db.query('DELETE FROM guild_members WHERE user_id = $1', [uid]);
      if (my.role === 'leader') {   // 族長離開：交給最早加入的人；沒人了就解散
        const { rows: [next] } = await db.query('SELECT user_id FROM guild_members WHERE guild_id = $1 ORDER BY joined_at LIMIT 1', [my.id]);
        if (next) { await db.query("UPDATE guild_members SET role = 'leader' WHERE user_id = $1", [next.user_id]); await db.query('UPDATE guilds SET leader_id = $1 WHERE id = $2', [next.user_id, my.id]); }
        else await db.query('DELETE FROM guilds WHERE id = $1', [my.id]);
      }
      return out({ ok: '離開家族' });
    }
    const id = Number(b.id), target = guildOf.get(id);
    if (!target || target.id !== my.id || id === uid) return { error: '不是你家族的人' };
    if (b.op === 'kick') {
      if (my.role === 'member' || (my.role === 'officer' && target.role !== 'member')) return { error: '權限不夠' };
      await db.query('DELETE FROM guild_members WHERE user_id = $1', [id]);
      notice(id, `你被移出家族「${my.name}」`); live.sendTo(id, { t: 'social' });
      return out({ ok: '已移出' });
    }
    if (b.op === 'promote') {   // 族長：成員 ↔ 幹部
      if (my.role !== 'leader') return { error: '只有族長可以任命幹部' };
      await db.query('UPDATE guild_members SET role = $1 WHERE user_id = $2', [target.role === 'officer' ? 'member' : 'officer', id]);
      return out({ ok: target.role === 'officer' ? '改成成員' : '任命為幹部' });
    }
    return { error: '不合理的操作' };
  }

  /* ---------- 私訊、家族頻道（live.js 轉過來） ---------- */
  const chatT = new Map();
  function onMessage(c, m) {
    const text = typeof m.text === 'string' ? m.text.trim().slice(0, 100) : '', now = Date.now();
    if (!text || now - (chatT.get(c.uid) || 0) < 800) return;
    chatT.set(c.uid, now);
    if (m.t === 'pm') {
      const to = live.connections().find(o => o.name.toLowerCase() === String(m.to || '').toLowerCase());
      if (!to) return live.send(c, { t: 'b.msg', text: `${m.to} 不在線上` });
      live.sendTo(to.uid, { t: 'pm', from: c.name, text });
      live.send(c, { t: 'pm', to: to.name, text });
    } else if (m.t === 'gchat') {
      const g = guildOf.get(c.uid);
      if (!g) return live.send(c, { t: 'b.msg', text: '你沒有家族' });
      for (const [uid, o] of guildOf) if (o.id === g.id) live.sendTo(uid, { t: 'gchat', name: c.name, tag: g.tag, text });
    }
  }

  /* ---------- 攻城時段（領地戰）---------- */
  /** 這座城現在能不能打；row 是 world_cities 的那一列（沒人佔就是 undefined）。回傳 null 表示可以，不然是原因 */
  function siegeBlock(row, attackerUid) {
    if (!row) return null;
    if (sameGuild(row.owner_id, attackerUid)) return '這是你家族（或盟友）的城';
    if (row.shield_until && new Date(row.shield_until).getTime() > Date.now()) return `這座城剛被佔下，保護到 ${fmt(row.shield_until)}`;
    // SIEGE_ANYTIME=1：測試用，隨時都能打
    if (!W.siegeOpen() && process.env.SIEGE_ANYTIME !== '1') { const S = W.siegeWindow; return `別的玩家的城只能在攻城時段打：每天 ${S.daily[0]}:00～${S.daily[1]}:00，週末 ${S.weekend[0]}:00～${S.weekend[1]}:00`; }
    return null;
  }
  const fmt = t => { const d = new Date(new Date(t).getTime() + W.siegeWindow.tz * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

  /* ---------- 市集 ---------- */
  const MATS = Object.keys(G.MATERIALS);
  async function market(uid) {
    const { rows } = await db.query('SELECT m.id, m.seller_id, u.username, m.kind, m.item, m.price FROM market m JOIN users u ON u.id = m.seller_id ORDER BY m.id DESC LIMIT 100');
    return { list: rows.map(r => ({ id: r.id, seller: r.username, mine: r.seller_id === uid, kind: r.kind, item: r.item, price: r.price })), tax: W.market.tax };
  }
  async function marketOp(uid, b) {
    if (b.op === 'sell') {
      const price = Number(b.price);
      if (!Number.isInteger(price) || price < 1 || price > W.market.maxPrice) return { error: `價格 1～${W.market.maxPrice} 金` };
      const { rows: [{ n }] } = await db.query('SELECT count(*)::int AS n FROM market WHERE seller_id = $1', [uid]);
      if (n >= W.market.maxListings) return { error: `最多同時上架 ${W.market.maxListings} 筆` };
      const r = await profiles.edit(uid, data => {
        if (b.kind === 'mat') {
          const k = b.mat, cnt = Number(b.n);
          if (!MATS.includes(k) || !Number.isInteger(cnt) || cnt < 1) return { error: '數量不合理' };
          if (!data.mats || (data.mats[k] || 0) < cnt) return { error: `${G.MATERIALS[k]}不夠` };
          data.mats[k] -= cnt; return { data, item: { mat: k, n: cnt } };
        }
        const i = Number(b.i), list = b.kind === 'item' ? data.stash : b.kind === 'doc' ? data.docs : null;
        if (!list || !Number.isInteger(i) || !list[i]) return { error: '沒有這個東西' };
        const [it] = list.splice(i, 1); return { data, item: b.kind === 'item' ? it : { doc: it } };
      });
      if (r.error) return r;
      await db.query('INSERT INTO market (seller_id, kind, item, price) VALUES ($1, $2, $3, $4)', [uid, b.kind, JSON.stringify(r.item), price]);
      return { ok: '上架了', data: r.data };
    }
    const id = Number(b.id);
    if (!Number.isInteger(id)) return { error: '不合理的操作' };
    if (b.op === 'cancel' || b.op === 'buy') {
      // 先把這筆從市集拿掉（同時有兩個人買，只有一個會拿到）
      const { rows: [row] } = await db.query(b.op === 'cancel' ? 'DELETE FROM market WHERE id = $1 AND seller_id = $2 RETURNING *' : 'DELETE FROM market WHERE id = $1 AND seller_id <> $2 RETURNING *', [id, uid]);
      if (!row) return { error: b.op === 'cancel' ? '沒有這筆' : '已經被買走了（或是你自己的）' };
      const back = async () => db.query('INSERT INTO market (id, seller_id, kind, item, price, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [row.id, row.seller_id, row.kind, JSON.stringify(row.item), row.price, row.created_at]);
      const give = data => {
        const it = row.item;
        if (row.kind === 'mat') { data.mats = { iron: 0, leather: 0, steel: 0, ...(data.mats || {}) }; data.mats[it.mat] += it.n; return null; }
        if (row.kind === 'item') { data.stash = data.stash || []; if (data.stash.length >= G.GEAR.stashMax) return '倉庫滿了'; data.stash.push(it); return null; }
        data.docs = data.docs || []; if (data.docs.length >= G.DOCTRINE_MAX) return '書庫滿了'; data.docs.push(it.doc); return null;
      };
      const r = await profiles.edit(uid, data => {
        if (b.op === 'buy' && data.gold < row.price) return { error: `金幣不足（需要 ${row.price}）` };
        const err = give(data); if (err) return { error: err };
        if (b.op === 'buy') data.gold -= row.price;
        return { data };
      });
      if (r.error) { await back(); return r; }
      if (b.op === 'buy') {
        const pay = Math.floor(row.price * (1 - W.market.tax));
        await profiles.edit(row.seller_id, data => { data.gold += pay; return { data }; });
        notice(row.seller_id, `市集：你的東西賣出了，收到 ${pay} 金`); live.sendTo(row.seller_id, { t: 'profile' });
      }
      return { ok: b.op === 'buy' ? '買到了' : '已下架，東西放回去了', data: r.data };
    }
    return { error: '不合理的操作' };
  }

  /* ---------- 採集 ---------- */
  async function gather(uid, nodeId) {
    const n = W.nodes.find(n => n.id === nodeId);
    if (!n) return { error: '沒有這個採集點' };
    const c = live.connections().find(o => o.uid === uid && o.scene === 'world');
    if (!c || Math.hypot(c.x - n.x, c.y - n.y) > W.gather.range) return { error: '要在大地圖上走到採集點旁邊' };
    return profiles.edit(uid, data => {
      data.world = data.world || {}; const cd = data.world.gather = data.world.gather || {};
      if (cd[n.id] && cd[n.id] > Date.now()) return { error: `還要等 ${Math.ceil((cd[n.id] - Date.now()) / 60000)} 分鐘才能再採` };
      const [a, b] = W.gather.yield[n.kind], got = a + Math.floor(Math.random() * (b - a + 1));
      data.mats = { iron: 0, leather: 0, steel: 0, ...(data.mats || {}) }; data.mats[n.kind] += got;
      cd[n.id] = Date.now() + W.gather.cooldownMin * 60000;
      return { data, ok: `${n.name}：${G.MATERIALS[n.kind]} +${got}` };
    });
  }

  /* ---------- 村落徵糧（design.md 32）：大地圖上的村子（G.TOWNS.world.buildings 的 hamlet）旁邊按 E，每個村子每人 45 分鐘一次 ---------- */
  const hamlets = G.TOWNS.world.buildings.map((b, i) => ({ ...b, i })).filter(b => b.art === 'hamlet');
  async function requisition(uid, i) {
    const h = hamlets.find(b => b.i === Number(i));
    if (!h) return { error: '這裡沒有村子' };
    const c = live.connections().find(o => o.uid === uid && o.scene === 'world');
    if (!c || Math.hypot(c.x - h.x, c.y - h.y) > 140) return { error: '要在大地圖上走到村子旁邊' };
    return profiles.edit(uid, data => {
      data.world = data.world || {}; const cd = data.world.req = data.world.req || {};
      if (cd[h.i] && cd[h.i] > Date.now()) return { error: `這個村子剛被徵過，還要 ${Math.ceil((cd[h.i] - Date.now()) / 60000)} 分鐘` };
      const got = 15 + Math.floor(Math.random() * 16);
      data.food = (data.food ?? 200) + got; cd[h.i] = Date.now() + 45 * 60000;
      return { data, ok: `向村子徵糧：糧食 +${got}` };
    });
  }

  /* ---------- 路由 ---------- */
  function register(app, requireUser) {
    const wrap = fn => async (req, reply) => { const r = await fn(req.user.id, req.body || {}); if (r.error) return reply.code(400).send({ error: r.error }); return r; };
    app.get('/api/social', { preHandler: requireUser }, req => socialOf(req.user.id));
    app.post('/api/friends', { preHandler: requireUser }, wrap(friendsOp));
    app.post('/api/guild', { preHandler: requireUser }, wrap(guildOp));
    app.get('/api/market', { preHandler: requireUser }, req => market(req.user.id));
    app.post('/api/market', { preHandler: requireUser }, wrap(marketOp));
    app.post('/api/gather', { preHandler: requireUser }, wrap((uid, b) => gather(uid, b.node)));
    app.post('/api/requisition', { preHandler: requireUser }, wrap((uid, b) => requisition(uid, b.i)));
  }

  /** 兩個人是不是好友（已接受） */
  const areFriends = async (a, b) => (await db.query('SELECT 1 FROM friends WHERE user_id = $1 AND friend_id = $2 AND accepted', [a, b])).rows.length > 0;
  return { register, refreshGuilds, guildOf: uid => guildOf.get(uid) || null, alliesOf, sameGuild, areFriends, onMessage, siegeBlock };
}
