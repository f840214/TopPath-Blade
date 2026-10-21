/* ============ army.js — 軍團名冊：存檔、統率編成、招募補員、戰後結算 ============
 * 存檔放在 localStorage（tpb-profile）：
 *   { gold, hero: { level, xp }, roster: [{ id, type, men, level, xp, deployed }] }
 * 戰鬥只拿 loadout() 給的出戰兵團；打完由 settle() 寫回傷亡、經驗、金幣。
 */
G.Army = (() => {
  const KEY = 'tpb-profile', A = () => G.ARMY;
  let p = null, nextId = 1;

  function fresh() {
    const s = A().start;
    return { gold: s.gold, hero: { level: 1, xp: 0 }, roster: s.roster.map((t, i) => newSquad(t, i < 2)) };
  }
  function newSquad(type, deployed = false) {
    return { id: nextId++, type, men: G.UNITS[type].count, level: 1, xp: 0, deployed };
  }

  function load() {
    try { p = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { p = null; }
    if (!p || !Array.isArray(p.roster)) p = fresh();
    nextId = Math.max(0, ...p.roster.map(s => s.id)) + 1;
    return p;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }
  const profile = () => p || load();

  /* ---------- 統率 ---------- */
  const cap = () => A().leadershipCap(profile().hero.level);
  const costOf = s => A().leadership[s.type];
  const used = () => profile().roster.filter(s => s.deployed).reduce((a, s) => a + costOf(s), 0);
  /** 勾選／取消出戰；超過統率或沒有兵就不能勾，回傳失敗原因 */
  function toggleDeploy(id) {
    const s = find(id); if (!s) return;
    if (s.deployed) { s.deployed = false; save(); return; }
    if (s.men <= 0) return '這支兵團沒有兵了，先補員';
    if (used() + costOf(s) > cap()) return `統率不足（${used()} + ${costOf(s)} > ${cap()}）`;
    s.deployed = true; save();
  }

  /* ---------- 招募、補員、解散 ---------- */
  const find = id => profile().roster.find(s => s.id === id);
  const refillCost = s => (G.UNITS[s.type].count - s.men) * A().recruitCost[s.type];
  const recruitCost = type => G.UNITS[type].count * A().recruitCost[type];
  function refill(id) {
    const s = find(id), c = refillCost(s);
    if (!c) return;
    if (profile().gold < c) return `金幣不足（需要 ${c}）`;
    p.gold -= c; s.men = G.UNITS[s.type].count; save();
  }
  function recruit(type) {
    if (profile().roster.length >= A().maxRoster) return `名冊最多 ${A().maxRoster} 支兵團`;
    const c = recruitCost(type);
    if (p.gold < c) return `金幣不足（需要 ${c}）`;
    p.gold -= c; p.roster.push(newSquad(type)); save();
  }
  function dismiss(id) { p.roster = profile().roster.filter(s => s.id !== id); save(); }

  /* ---------- 出戰與結算 ---------- */
  /** 給 G.Game.start 的兵團清單 */
  function loadout() {
    return profile().roster.filter(s => s.deployed && s.men > 0).map(s => ({ id: s.id, type: s.type, men: s.men, level: s.level }));
  }
  const heroLevel = () => profile().hero.level;

  /**
   * 戰後結算。squads：戰場上玩家的 G.Squad（帶 rosterId、kills）；heroKills：武將親手擊殺數。
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
      if (!s.men) s.deployed = false;
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

  function reset() { p = fresh(); save(); }

  return {
    profile, cap, used, costOf, toggleDeploy, refill, refillCost, recruit, recruitCost, dismiss,
    loadout, heroLevel, settle, reset,
  };
})();
