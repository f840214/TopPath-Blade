/* ============ army.js — 軍團名冊：存檔、統率編成、招募補員、戰後結算 ============
 * 存檔放在伺服器（PUT /api/profile），登入後由選單呼叫 useProfile() 載入：
 *   { gold, hero: { level, xp }, roster: [{ id, type, men, level, xp, deployed, field, vet: [分支0 已點節數, 分支1 已點節數] }],
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
    nextId = Math.max(0, ...p.roster.map(s => s.id)) + 1;
    if (isNew) save();
  }
  /** 領城池收入（最多每分鐘問一次伺服器）；有收入就提示 */
  let collectT = 0;
  async function collectIncome() {
    if (api.server || Date.now() - collectT < 60000) return;
    collectT = Date.now();
    try { const r = await G.Api.collect(); if (r.gold) { adopt(r.data); G.HUD.toast(`城池收入 +${r.gold} 金`); } } catch (e) { /* 沒連上就下次再領 */ }
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

  /* ---------- 招募、補員、解散 ---------- */
  const find = id => profile().roster.find(s => s.id === id);
  const refillCost = s => (G.UNITS[s.type].count - s.men) * A().recruitCost[s.type];
  const recruitCost = type => G.UNITS[type].count * A().recruitCost[type];
  function refill(id) {
    const s = find(id), c = refillCost(s);
    if (!c) return;
    if (profile().gold < c) return `金幣不足（需要 ${c}）`;
    p.gold -= c; s.men = G.UNITS[s.type].count; remote('refill', id);
  }
  function recruit(type) {
    if (profile().roster.length >= A().maxRoster) return `名冊最多 ${A().maxRoster} 支兵團`;
    const c = recruitCost(type);
    if (p.gold < c) return `金幣不足（需要 ${c}）`;
    p.gold -= c; p.roster.push(newSquad(type)); remote('recruit', type);
  }
  /** 買糧（旅店）：n 份，每份 G.WORLD.foodPrice 金 */
  function buyFood(n) {
    const c = Math.ceil(n * G.WORLD.foodPrice);
    if (profile().gold < c) return `金幣不足（需要 ${c}）`;
    p.gold -= c; p.food = (p.food ?? 200) + n; remote('buyFood', n);
  }
  function dismiss(id) { p.roster = profile().roster.filter(s => s.id !== id); remote('dismiss', id); }

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
  function modsOf(type, vet = [0, 0]) {
    const out = {};
    const merge = (dst, src, mul) => {
      for (const [k, v] of Object.entries(src)) {
        const m = mul || k.endsWith('Mul');
        if (typeof v === 'object') merge(dst[k] || (dst[k] = {}), v, m);
        else dst[k] = m ? (dst[k] ?? 1) * v : (dst[k] ?? 0) + v;
      }
    };
    (G.VETERAN[type] || []).forEach((b, i) => b.nodes.slice(0, vet[i]).forEach(n => merge(out, n.mod, false)));
    return out;
  }

  /* ---------- 出戰與結算 ---------- */
  /** 給 G.Game.start 的兵團清單：{ escort: 隨身兵團, field: 配置兵團 } */
  function loadout() {
    const pick = k => profile().roster.filter(s => s[k] && s.men > 0).map(s => ({ id: s.id, type: s.type, men: s.men, level: s.level, mods: modsOf(s.type, s.vet) }));
    return { escort: pick('deployed'), field: pick('field') };
  }
  const heroLevel = () => profile().hero.level;

  /**
   * 戰後結算。squads：玩家的兵團 { rosterId, alive, kills }（戰場上的 G.Squad，或換下場的後備）；heroKills：武將親手擊殺數。
   * 回傳報告給結算畫面。
   */
  function settle(win, squads, heroKills) {
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
    save();
    return rep;
  }

  return Object.assign(api, {
    useProfile, saveSettings, saveWorld, onSaveError(fn) { onSaveError = fn; }, onChange(fn) { onChange = fn; },
    beginBattle, finishBattle, adopt, collectIncome,
    profile, cap, used, fieldCap, fieldUsed, costOf, toggleDeploy, refill, refillCost, recruit, recruitCost, dismiss, buyFood,
    vetPoints, buyVet, resetVet, modsOf,
    loadout, heroLevel, settle,
  });
})();
