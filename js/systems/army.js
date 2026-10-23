/* ============ army.js — 軍團名冊：存檔、統率編成、招募補員、戰後結算 ============
 * 存檔放在伺服器（PUT /api/profile），登入後由選單呼叫 useProfile() 載入：
 *   { gold, hero: { level, xp, attrs: { str, agi, tou, arm }, mastery: { 武器: 經驗 } }, roster: [{ id, type, men, level, xp, deployed, field, vet: [分支0 已點節數, 分支1 已點節數] }],
 *   deployed：隨身兵團（補給點輪流換上場）；field：配置兵團（開戰時擺在戰場上）。兩者只能選一個，各有自己的統率上限。
 *     settings: { scenario, weapon, equip } }
 * 戰鬥只拿 loadout() 給的出戰兵團；打完由 settle() 寫回傷亡、經驗、金幣。
 * 防作弊：伺服器（server/src/gamedata.js）跑的是同一份檔案，金幣、經驗、名冊以伺服器為準：
 *   - 名冊操作先在本機算（畫面馬上變），同時送 POST /api/army，回來後用伺服器的存檔蓋掉本機的
 *   - 戰鬥：beginBattle() 開戰前拿出戰單，finishBattle() 打完送戰報，伺服器結算後回傳報告和新存檔
 *   - save() 只上傳設定、旗幟、大地圖位置（伺服器也只收這些）
 *   在伺服器上執行時 G.Api.saveProfile 是空的，remote() 不會被呼叫（G.Army.server = true）。
 */
G.Army = (() => {
  const api = {};
  const A = () => G.ARMY;
  let p = null, nextId = 1, saving = Promise.resolve();
  let onSaveError = () => {};

  function fresh() {
    const s = A().start;
    return { gold: s.gold, food: 200, hero: { level: 1, xp: 0 }, roster: s.roster.map((t, i) => newSquad(t, i < 2)) };
  }
  function newSquad(type, deployed = false) {
    return { id: nextId++, type, men: G.UNITS[type].count, level: 1, xp: 0, deployed, vet: [0, 0] };
  }

  /** 登入後載入伺服器上的存檔；新帳號（data 是 null）建立新存檔並上傳 */
  function useProfile(data) {
    const isNew = !data || !Array.isArray(data.roster);
    p = isNew ? fresh() : data;
    for (const s of p.roster) if (!s.vet) s.vet = [0, 0];   // 舊存檔沒有老兵樹
    refreshUnlocks();   // 舊存檔：名冊上已經有的兵種算解鎖
    nextId = Math.max(0, ...p.roster.map(s => s.id)) + 1;
    if (isNew) save();
  }
  /** 領城池收入（最多每分鐘問一次伺服器）；有收入就提示 */
  let collectT = 0;
  async function collectIncome() {
    if (api.server || Date.now() - collectT < 60000) return;
    collectT = Date.now();
    try { const r = await G.Api.collect(); if (r.gold || r.food) { adopt(r.data); G.HUD.toast(`城池收入 +${r.gold} 金、糧食 +${r.food || 0}`); } } catch (e) { /* 沒連上就下次再領 */ }
  }
  /* ---------- 出戰單（防作弊）---------- */
  let ticket = null;
  /** 開戰前向伺服器拿出戰單；kind：'city' | 'bandit' | 'drill'。失敗會丟出錯誤（例如強盜還沒回來） */
  async function beginBattle(kind, target) { ticket = null; ticket = (await G.Api.battleStart(kind, target)).ticket; }
  /** 打完送戰報；伺服器結算後回傳 { report, data }，本機存檔換成伺服器的 */
  async function finishBattle(win, squads, heroKills) {
    if (!ticket) return null;
    const t = ticket; ticket = null;
    const body = { ticket: t, win, heroKills, squads: squads.map(s => ({ rosterId: s.rosterId, alive: s.alive.length, kills: s.kills || 0 })) };
    const r = await G.Api.battleEnd(body);
    adopt(r.data);
    return r.report;
  }
  /** 上傳存檔（只有設定、旗幟、大地圖）；依序排隊，避免舊的請求比新的晚到把資料蓋回去 */
  function save() {
    if (api.server) return saving;
    const { settings, flag, world } = JSON.parse(JSON.stringify(p));
    saving = saving.then(() => G.Api.saveProfile({ settings, flag, world })).catch(e => onSaveError(e));
    return saving;
  }
  /** 伺服器回來的存檔蓋掉本機的（保留本機的大地圖位置，那是本機在走） */
  function adopt(data) {
    if (!data) return;
    const w = p && p.world;
    p = data; if (w) p.world = Object.assign(w, { cooldown: data.world && data.world.cooldown });   // 同一個物件：大地圖場景手上拿的是它
    for (const s of p.roster) if (!s.vet) s.vet = [0, 0];
    nextId = Math.max(0, ...p.roster.map(s => s.id)) + 1;
    onChange();
  }
  /** 名冊操作送到伺服器（依序排隊） */
  function remote(op, ...args) {
    if (api.server) return;
    saving = saving.then(() => G.Api.armyOp(op, args)).then(r => { adopt(r.data); if (r.error) onSaveError(new Error(r.error)); }).catch(e => onSaveError(e));
  }
  let onChange = () => {};
  const profile = () => p || (p = fresh());
  /** 大地圖進度（profile().world）改過之後存檔；城池獎賞、強盜獎賞加金幣 */
  function saveWorld() { save(); }

  function saveSettings(settings) { profile().settings = settings; save(); }

  /* ---------- 統率 ---------- */
  const cap = () => A().leadershipCap(profile().hero.level);
  const fieldCap = () => A().fieldCap(profile().hero.level);
  const costOf = s => A().leadership[s.type];
  const used = () => profile().roster.filter(s => s.deployed).reduce((a, s) => a + costOf(s), 0);
  const fieldUsed = () => profile().roster.filter(s => s.field).reduce((a, s) => a + costOf(s), 0);
  /** 勾選／取消出戰：kind 'escort' 隨身、'field' 配置（勾了一種就會取消另一種）；超過統率或沒有兵就不能勾，回傳失敗原因 */
  function toggleDeploy(id, kind = 'escort') {
    const s = find(id); if (!s) return;
    const key = kind === 'field' ? 'field' : 'deployed', other = key === 'field' ? 'deployed' : 'field';
    if (s[key]) { s[key] = false; remote('toggleDeploy', id, kind); return; }
    if (s.men <= 0) return '這支兵團沒有兵了，先補員';
    const u = key === 'field' ? fieldUsed() : used(), c = key === 'field' ? fieldCap() : cap();
    if (u + costOf(s) > c) return `${key === 'field' ? '配置' : '隨身'}統率不足（${u} + ${costOf(s)} > ${c}）`;
    s[key] = true; s[other] = false; remote('toggleDeploy', id, kind);
  }

  /* ---------- 兵種解鎖（G.UNIT_TREE）---------- */
  const unlockedList = () => (profile().unlocked = profile().unlocked || []);
  /** 自己佔領的城（城池 id）：伺服器操作前由 game-api 設定，瀏覽器由 G.Net 的城池歸屬設定 */
  let owned = [];
  const setOwned = list => { owned = Array.isArray(list) ? list : []; };
  /** 佔領的城的特產兵種（G.WORLD.cities 的 unit），佔著就能招 */
  const cityUnit = type => G.WORLD.cities.find(c => c.unit === type && owned.includes(c.id));
  const isUnlocked = type => G.UNIT_TREE.start.includes(type) || unlockedList().includes(type) || !!cityUnit(type);
  /** 在自己佔領的城裡招募、補員打折（design.md 32） */
  const localMul = cityId => cityId && owned.includes(cityId) ? A().localDiscount : 1;
  /** 檢查有沒有新解鎖的兵種（名冊上已經有的兵種、前置兵團練到等級），回傳新解鎖的兵種 key */
  function refreshUnlocks() {
    const L = unlockedList(), R = profile().roster, out = [];
    for (const [type, rule] of Object.entries(G.UNIT_TREE)) {
      if (type === 'start' || isUnlocked(type)) continue;
      if (R.some(s => s.type === type) || R.some(s => s.type === rule.from && s.level >= rule.lv)) { L.push(type); out.push(type); }
    }
    return out;
  }
  /** 鎖住的兵種要怎麼解鎖（介面用） */
  const unlockHint = type => { const r = G.UNIT_TREE[type], c = G.WORLD.cities.find(c => c.unit === type); return (r && r.from ? `把一支${G.UNITS[r.from].name}練到 Lv${r.lv}` : '') + (c ? `，或佔領${c.name}` : ''); };

  /* ---------- 招募、補員、解散 ---------- */
  const find = id => profile().roster.find(s => s.id === id);
  const refillCost = (s, cityId) => Math.round((G.UNITS[s.type].count - s.men) * A().recruitCost[s.type] * localMul(cityId));
  const recruitCost = (type, cityId) => Math.round(G.UNITS[type].count * A().recruitCost[type] * localMul(cityId));
  /** cityId：現在在哪座城（在自己的城裡打折） */
  function refill(id, cityId) {
    const s = find(id), c = refillCost(s, cityId);
    if (!c) return;
    if (profile().gold < c) return `金幣不足（需要 ${c}）`;
    const h = horsesFor(s.type, G.UNITS[s.type].count - s.men); if (h > horses()) return `馬匹不足（需要 ${h} 匹，到旅店買）`;
    p.gold -= c; p.horses = horses() - h; s.men = G.UNITS[s.type].count; remote('refill', id, cityId);
  }
  function recruit(type, cityId) {
    if (!isUnlocked(type)) return `還沒解鎖：${unlockHint(type)}`;
    if (profile().roster.length >= A().maxRoster) return `名冊最多 ${A().maxRoster} 支兵團`;
    const c = recruitCost(type, cityId);
    if (p.gold < c) return `金幣不足（需要 ${c}）`;
    const h = horsesFor(type, G.UNITS[type].count); if (h > horses()) return `馬匹不足（需要 ${h} 匹，到旅店買）`;
    p.gold -= c; p.horses = horses() - h; p.roster.push(newSquad(type)); remote('recruit', type, cityId);
  }
  /* ---------- 馬匹（騎兵類兵種招募、補員要用，G.ARMY.horsePrice）---------- */
  const horses = () => profile().horses ?? A().startHorses;
  const horsesFor = (type, men) => G.UNITS[type].mounted ? men : 0;
  function buyHorses(n) {
    const c = n * A().horsePrice;
    if (profile().gold < c) return `金幣不足（需要 ${c}）`;
    p.gold -= c; p.horses = horses() + n; remote('buyHorses', n);
  }
  /** 買糧（旅店）：n 份，每份 G.WORLD.foodPrice 金 */
  function buyFood(n) {
    const c = Math.ceil(n * G.WORLD.foodPrice);
    if (profile().gold < c) return `金幣不足（需要 ${c}）`;
    p.gold -= c; p.food = (p.food ?? 200) + n; remote('buyFood', n);
  }
  function dismiss(id) { const s = find(id); if (s && s.doc) docsOf().push(...s.doc.filter(Boolean)); p.roster = profile().roster.filter(s => s.id !== id); remote('dismiss', id); }   // 插著的戰術書放回書庫

  /* ---------- 老兵技能樹（G.VETERAN） ---------- */
  /** 還沒用的老兵點：每升一級 1 點 */
  const vetPoints = s => (s.level - 1) - s.vet[0] - s.vet[1];
  /** 點下一節；branch 是 0 或 1，同一條要依序點 */
  function buyVet(id, branch) {
    const s = find(id); if (!s) return;
    if (vetPoints(s) <= 0) return '專精點數不夠：兵團升級才會得到點數';
    if (s.vet[branch] >= G.VETERAN[s.type][branch].nodes.length) return '這條分支已經點滿';
    s.vet[branch]++; remote('buyVet', id, branch);
  }
  function resetVet(id) {
    const s = find(id); if (!s || !(s.vet[0] + s.vet[1])) return;
    if (profile().gold < G.VETERAN_RESET_COST) return `金幣不足（需要 ${G.VETERAN_RESET_COST}）`;
    p.gold -= G.VETERAN_RESET_COST; s.vet = [0, 0]; remote('resetVet', id);
  }
  /** 把已點的節點效果合併成一個 mods 物件：名稱以 Mul 結尾的相乘、其他相加，巢狀物件照同樣規則 */
  function modsOf(type, vet = [0, 0], docs = []) {
    const out = {};
    const merge = (dst, src, mul) => {
      for (const [k, v] of Object.entries(src)) {
        const m = mul || k.endsWith('Mul');
        if (typeof v === 'object') merge(dst[k] || (dst[k] = {}), v, m);
        else dst[k] = m ? (dst[k] ?? 1) * v : (dst[k] ?? 0) + v;
      }
    };
    (G.VETERAN[type] || []).forEach((b, i) => b.nodes.slice(0, vet[i]).forEach(n => merge(out, n.mod, false)));
    for (const d of docs || []) if (G.DOCTRINES[d]) merge(out, G.DOCTRINES[d].mod, false);   // 戰術書
    return out;
  }

  /* ---------- 戰術書（G.DOCTRINES）：書庫 profile.docs、兵團欄位 s.doc ---------- */
  const docsOf = () => (profile().docs = profile().docs || []);
  const slotsOf = s => { const n = G.DOCTRINE_SLOTS(s.level); s.doc = (s.doc || []).slice(0, n); while (s.doc.length < n) s.doc.push(null); return s.doc; };
  /** 把書庫第 i 本插到兵團 id 的第 slot 格；那格原本的放回書庫 */
  function setDoc(id, slot, i) {
    const s = find(id), D = docsOf(), key = D[i];
    if (!s || !G.DOCTRINES[key]) return;
    const sl = slotsOf(s);
    if (!(slot >= 0 && slot < sl.length)) return `這個欄位還沒開（兵團 Lv6 開第三格）`;
    if (sl.includes(key)) return '同一支兵團不能插兩本一樣的書';
    D.splice(i, 1); if (sl[slot]) D.push(sl[slot]);
    sl[slot] = key; remote('setDoc', id, slot, i);
  }
  function unsetDoc(id, slot) {
    const s = find(id); if (!s) return;
    const sl = slotsOf(s); if (!sl[slot]) return;
    if (docsOf().length >= G.DOCTRINE_MAX) return `書庫最多 ${G.DOCTRINE_MAX} 本`;
    docsOf().push(sl[slot]); sl[slot] = null; remote('unsetDoc', id, slot);
  }

  /* ---------- 武將屬性點、武器專精（G.HERO_ATTRS、G.MASTERY）---------- */
  const heroOf = () => { const h = profile().hero; h.attrs = h.attrs || {}; h.mastery = h.mastery || {}; return h; };
  /** 還沒分配的屬性點 */
  const attrPoints = () => { const h = heroOf(); return (h.level - 1) * G.HERO_ATTRS.perLevel - Object.values(h.attrs).reduce((a, v) => a + v, 0); };
  function buyAttr(key) {
    if (!G.HERO_ATTRS.list[key]) return;
    if (attrPoints() <= 0) return '屬性點不夠：武將升級才會得到點數';
    const h = heroOf(); h.attrs[key] = (h.attrs[key] || 0) + 1; remote('buyAttr', key);
  }
  function resetAttrs() {
    const h = heroOf(); if (!Object.values(h.attrs).some(v => v)) return;
    if (p.gold < G.HERO_ATTRS.resetCost) return `金幣不足（需要 ${G.HERO_ATTRS.resetCost}）`;
    p.gold -= G.HERO_ATTRS.resetCost; h.attrs = {}; remote('resetAttrs');
  }
  /** 給戰鬥的武將資料：屬性點、這把武器的專精經驗、選的技能（settings.skills[武器]）、穿著的裝備（沒壞的） */
  function heroSpec(weapon) {
    const h = heroOf(), s = profile().settings || {};
    return { attrs: { ...h.attrs }, mastery: h.mastery[weapon] || 0, skills: (s.skills && s.skills[weapon]) || {}, equip: equipOf(), food: profile().food ?? 200, fatigue: (profile().world || {}).fatigue || 0 };   // food、fatigue：開戰時的糧草、疲勞（design.md 32）
  }

  /* ---------- 裝備：穿著的（gear，每個欄位一件、有耐久）、倉庫（stash）、材料（mats）（G.GEAR、G.CRAFT、G.LOOT）---------- */
  const itemOf = id => { for (const s of G.EQUIP_SLOTS) { const i = G.EQUIPMENT[s.key].find(i => i.id === id); if (i) return { ...i, slot: s.key }; } return null; };
  /** 沒有裝備資料的存檔（舊存檔）：每個欄位給一件普通的 */
  function gearOf() {
    const P = profile();
    if (!P.gear) { P.gear = {}; for (const s of G.EQUIP_SLOTS) P.gear[s.key] = { id: G.EQUIPMENT[s.key].find(i => i.rarity === 0).id, dur: G.GEAR.maxDur }; }
    P.stash = P.stash || []; P.mats = { iron: 0, leather: 0, steel: 0, ...(P.mats || {}) };
    return P.gear;
  }
  /** 給戰鬥的裝備 { 欄位: 裝備 id }：壞掉（耐久 0）的不算 */
  function equipOf() { const g = gearOf(), out = {}; for (const [k, v] of Object.entries(g)) if (v && v.dur > 0) out[k] = v.id; return out; }
  /** 穿上倉庫第 i 件；原本穿的放回倉庫 */
  function equip(i) {
    const P = profile(), g = gearOf(), it = P.stash[i], info = it && itemOf(it.id);
    if (!info) return;
    P.stash.splice(i, 1);
    if (g[info.slot]) P.stash.push(g[info.slot]);
    g[info.slot] = it; remote('equip', i);
  }
  function craft(id) {
    const info = itemOf(id), P = profile(); gearOf();
    if (!info) return;
    const r = G.CRAFT[info.rarity];
    if (P.stash.length >= G.GEAR.stashMax) return `倉庫最多 ${G.GEAR.stashMax} 件，先拆解一些`;
    if (P.gold < r.gold) return `金幣不足（需要 ${r.gold}）`;
    for (const m of Object.keys(G.MATERIALS)) if ((P.mats[m] || 0) < r[m]) return `${G.MATERIALS[m]}不足（需要 ${r[m]}）`;
    P.gold -= r.gold; for (const m of Object.keys(G.MATERIALS)) P.mats[m] -= r[m];
    P.stash.push({ id, dur: G.GEAR.maxDur }); remote('craft', id);
  }
  const repairCost = slot => { const g = gearOf()[slot], info = g && itemOf(g.id); return info ? Math.ceil((G.GEAR.maxDur - g.dur) / G.GEAR.maxDur * G.CRAFT[info.rarity].repair) : 0; };
  function repair(slot) {
    const g = gearOf()[slot], c = repairCost(slot);
    if (!g || !c) return;
    if (p.gold < c) return `金幣不足（需要 ${c}）`;
    p.gold -= c; g.dur = G.GEAR.maxDur; remote('repair', slot);
  }
  /** 拆解倉庫第 i 件：退一半材料 */
  function salvage(i) {
    const P = profile(); gearOf();
    const it = P.stash[i], info = it && itemOf(it.id);
    if (!info) return;
    const r = G.CRAFT[info.rarity];
    P.stash.splice(i, 1); for (const m of Object.keys(G.MATERIALS)) P.mats[m] += Math.floor(r[m] / 2); remote('salvage', i);
  }
  /** 戰後：穿著的裝備掉耐久；打贏依戰鬥種類掉材料、有機率掉裝備（只在伺服器結算時跑，Math.random 在伺服器上） */
  function loot(win, kills, src = {}) {
    const P = profile(), g = gearOf(), out = { mats: {}, item: null, broke: [] };
    for (const [k, v] of Object.entries(g)) if (v && v.dur > 0) { v.dur = Math.max(0, v.dur - (win ? G.GEAR.wearWin : G.GEAR.wearLose)); if (!v.dur) out.broke.push(itemOf(v.id).name); }
    const L = G.LOOT[src.kind];
    if (!win || !L) return out;
    const roll = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
    for (const m of Object.keys(G.MATERIALS)) { const n = roll(L[m]) + (m === 'iron' ? Math.floor(kills / 15) : 0); if (n) { P.mats[m] += n; out.mats[m] = n; } }
    if (L.food) { const n = roll(L.food); P.food = (P.food ?? 200) + n; out.food = n; }   // 打贏強盜、聯軍、商隊會搶到糧草
    const chance = L.item * (src.kind === 'bandit' ? 0.8 + 0.2 * (src.tier || 1) : 1);
    if (Math.random() < chance && P.stash.length < G.GEAR.stashMax) {
      const x = Math.random(), rarity = x < L.epic ? 2 : x < L.epic + L.rare ? 1 : 0;
      const pool = G.EQUIP_SLOTS.flatMap(s => G.EQUIPMENT[s.key].filter(i => i.rarity === rarity));
      const it = pool[Math.floor(Math.random() * pool.length)];
      P.stash.push({ id: it.id, dur: G.GEAR.maxDur }); out.item = { name: it.name, rarity };
    }
    if (Math.random() < chance / L.item * L.doc && docsOf().length < G.DOCTRINE_MAX) {   // 戰術書：跟裝備一樣依稀有度抽
      const x = Math.random(), rarity = x < L.epic ? 2 : x < L.epic + L.rare ? 1 : 0;
      const pool = Object.keys(G.DOCTRINES).filter(k => G.DOCTRINES[k].rarity === rarity), k = pool[Math.floor(Math.random() * pool.length)];
      docsOf().push(k); out.doc = { name: G.DOCTRINES[k].name, rarity };
    }
    return out;
  }

  /* ---------- 出戰與結算 ---------- */
  /** 給 G.Game.start 的兵團清單：{ escort: 隨身兵團, field: 配置兵團 } */
  function loadout() {
    const pick = k => profile().roster.filter(s => s[k] && s.men > 0).map(s => ({ id: s.id, type: s.type, men: s.men, level: s.level, mods: modsOf(s.type, s.vet, s.doc) }));
    return { escort: pick('deployed'), field: pick('field') };
  }
  const heroLevel = () => profile().hero.level;

  /**
   * 戰後結算。squads：玩家的兵團 { rosterId, alive, kills }（戰場上的 G.Squad，或換下場的後備）；heroKills：武將親手擊殺數；
   * src：{ kind: 'city' | 'raid' | 'bandit', tier }（掉落用，G.LOOT）。
   * 回傳報告給結算畫面。
   */
  function settle(win, squads, heroKills, src = {}) {
    const a = A(), rep = { gold: 0, heroXp: 0, heroUp: 0, squads: [] };
    let kills = heroKills;
    for (const sq of squads) {
      const s = find(sq.rosterId); if (!s) continue;
      const before = s.men, after = sq.alive.length, k = sq.kills || 0;
      kills += k;
      s.men = after;
      let up = 0;
      s.xp += k * a.squadXpPerKill;
      while (s.level < a.squadMaxLevel && s.xp >= a.squadXpToNext(s.level)) { s.xp -= a.squadXpToNext(s.level); s.level++; up++; }
      if (s.level >= a.squadMaxLevel) s.xp = 0;
      if (!s.men) s.deployed = s.field = false;
      rep.squads.push({ name: G.UNITS[s.type].name, before, after, kills: k, level: s.level, up });
    }
    const h = profile().hero;
    rep.gold = kills * a.goldPerKill + (win ? a.goldWin : a.goldLose);
    rep.heroXp = kills * a.heroXpPerKill + (win ? a.heroXpWin : a.heroXpLose);
    p.gold += rep.gold; h.xp += rep.heroXp;
    while (h.level < a.heroMaxLevel && h.xp >= a.heroXpToNext(h.level)) { h.xp -= a.heroXpToNext(h.level); h.level++; rep.heroUp++; }
    if (h.level >= a.heroMaxLevel) h.xp = 0;
    rep.heroLevel = h.level;
    // 武器專精：用這場帶的武器（設定裡的）累積
    const M = G.MASTERY, wk = (p.settings && G.WEAPONS[p.settings.weapon]) ? p.settings.weapon : 'sword', hm = heroOf().mastery;
    const lv0 = G.masteryLevel(hm[wk]);
    hm[wk] = (hm[wk] || 0) + heroKills * M.xpPerKill + (win ? M.xpWin : M.xpLose);
    rep.mastery = { weapon: G.WEAPONS[wk].name, xp: hm[wk], level: G.masteryLevel(hm[wk]), up: G.masteryLevel(hm[wk]) - lv0 };
    rep.loot = loot(win, kills, src);   // 裝備耐久、掉落
    rep.unlocked = refreshUnlocks().map(t => G.UNITS[t].name);   // 兵團升級解鎖新兵種
    save();
    return rep;
  }

  return Object.assign(api, {
    useProfile, saveSettings, saveWorld, onSaveError(fn) { onSaveError = fn; }, onChange(fn) { onChange = fn; },
    beginBattle, finishBattle, adopt, collectIncome,
    profile, horses, horsesFor, buyHorses, cap, used, fieldCap, fieldUsed, costOf, toggleDeploy, refill, refillCost, recruit, recruitCost, dismiss, buyFood,
    vetPoints, buyVet, resetVet, modsOf, attrPoints, buyAttr, resetAttrs, heroSpec,
    setOwned, localMul, itemOf, gearOf, equipOf, equip, craft, repair, repairCost, salvage, docsOf, slotsOf, setDoc, unsetDoc, isUnlocked, unlockHint, refreshUnlocks,
    loadout, heroLevel, settle,
  });
})();
