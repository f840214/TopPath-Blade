/* ============ army.js — 軍團名冊：存檔、統率編成、招募補員、戰後結算 ============
 * 存檔放在 localStorage（tpb-profile）：
 *   { gold, hero: { level, xp }, roster: [{ id, type, men, level, xp, deployed, vet: [分支0 已點節數, 分支1 已點節數] }] }
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
    return { id: nextId++, type, men: G.UNITS[type].count, level: 1, xp: 0, deployed, vet: [0, 0] };
  }

  function load() {
    try { p = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { p = null; }
    if (!p || !Array.isArray(p.roster)) p = fresh();
    for (const s of p.roster) if (!s.vet) s.vet = [0, 0];   // 舊存檔沒有老兵樹
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

  /* ---------- 老兵技能樹（G.VETERAN） ---------- */
  /** 還沒用的老兵點：每升一級 1 點 */
  const vetPoints = s => (s.level - 1) - s.vet[0] - s.vet[1];
  /** 點下一節；branch 是 0 或 1，同一條要依序點 */
  function buyVet(id, branch) {
    const s = find(id); if (!s) return;
    if (vetPoints(s) <= 0) return '老兵點不夠：兵團升級才會得到點數';
    if (s.vet[branch] >= G.VETERAN[s.type][branch].nodes.length) return '這條分支已經點滿';
    s.vet[branch]++; save();
  }
  function resetVet(id) {
    const s = find(id); if (!s || !(s.vet[0] + s.vet[1])) return;
    if (profile().gold < G.VETERAN_RESET_COST) return `金幣不足（需要 ${G.VETERAN_RESET_COST}）`;
    p.gold -= G.VETERAN_RESET_COST; s.vet = [0, 0]; save();
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
  /** 給 G.Game.start 的兵團清單 */
  function loadout() {
    return profile().roster.filter(s => s.deployed && s.men > 0).map(s => ({ id: s.id, type: s.type, men: s.men, level: s.level, mods: modsOf(s.type, s.vet) }));
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
    vetPoints, buyVet, resetVet, modsOf,
    loadout, heroLevel, settle, reset,
  };
})();
