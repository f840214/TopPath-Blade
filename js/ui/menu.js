/* ============ menu.js — 出戰準備：場景、武器、裝備、武將、軍團名冊，以及兵種圖鑑 ============
 * 兵團來自軍團名冊（G.Army）；這裡只記場景、武器、裝備的選擇（tpb-loadout）。
 */
G.Menu = (() => {
  const $ = id => document.getElementById(id);
  const KEY = 'tpb-loadout';
  let lo = { scenario: 'field', weapon: 'sword', equip: { helm: 'helm_iron', armor: 'armor_mail', gloves: 'gloves_leather', cape: 'cape_wool' } };
  try { Object.assign(lo, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  delete lo.squads;   // 舊版存的兵種選擇，現在改由名冊決定
  let confirmDismiss = null;   // 解散要按兩次：第一次記下 id
  let openVet = null;          // 展開老兵技能樹的兵團 id

  function msg(text) { $('menuMsg').textContent = text || ''; }

  const statText = st => Object.entries(st).map(([k, v]) => ({
    hp: `生命 +${v}`, armor: `護甲 +${v}`, atk: `攻擊 +${v}%`, cdr: `冷卻 -${v}%`,
    squadAtk: `兵團攻擊 +${v}%`, squadSpeed: `兵團移速 +${v}%`, squadArmor: `兵團護甲 +${v}`,
  }[k])).join('、');

  function render() {
    $('scenarios').innerHTML = Object.entries(G.Game.SCENARIOS).map(([k, s]) =>
      `<button class="card ${lo.scenario === k ? 'on' : ''}" data-sc="${k}"><b>${s.name}</b><small>${s.desc}</small></button>`).join('');
    $('weapons').innerHTML = Object.entries(G.WEAPONS).map(([k, w]) =>
      `<button class="card ${lo.weapon === k ? 'on' : ''}" data-wp="${k}"><b>${w.name}</b><small>${w.desc}</small>
       <small class="sk">${['Q', 'E', 'R'].map(s => `${s} ${G.HERO_SKILLS[w.skills[s]].name}`).join('　')}</small></button>`).join('');
    $('equip').innerHTML = G.EQUIP_SLOTS.map(s => `<label>${s.name}<select data-eq="${s.key}">${G.EQUIPMENT[s.key].map(i =>
      `<option value="${i.id}" ${lo.equip[s.key] === i.id ? 'selected' : ''} style="color:${G.RARITY[i.rarity].color}">${i.name}（${G.RARITY[i.rarity].name}）— ${statText(i.stats)}</option>`).join('')}</select></label>`).join('');
    renderArmy();
    renderCodex();
  }

  /** 武將等級、統率、金幣，以及軍團名冊與招募 */
  function renderArmy() {
    const A = G.Army, P = A.profile(), h = P.hero, cap = A.cap(), used = A.used();
    $('heroInfo').innerHTML = `
      <div class="stat"><span>等級</span><b>Lv${h.level}</b></div>
      <div class="xp"><i style="width:${h.level >= G.ARMY.heroMaxLevel ? 100 : h.xp / G.ARMY.heroXpToNext(h.level) * 100}%"></i><small>經驗 ${h.xp} / ${G.ARMY.heroXpToNext(h.level)}</small></div>
      <div class="stat"><span>統率</span><b class="${used > cap ? 'bad' : ''}">${used} / ${cap}</b></div>
      <div class="stat"><span>金幣</span><b>${P.gold}</b></div>
      <small class="hint">武將升級提高統率上限與生命。打仗獲得金幣與經驗。</small>`;
    $('roster').innerHTML = P.roster.length ? `<table class="roster">
      <tr><th>出戰</th><th>兵團</th><th>人數</th><th>經驗</th><th>統率</th><th></th></tr>
      ${P.roster.map(s => {
        const u = G.UNITS[s.type], full = s.men >= u.count, rc = A.refillCost(s), lvMax = s.level >= G.ARMY.squadMaxLevel, pts = A.vetPoints(s);
        return `<tr class="${s.deployed ? 'on' : ''} ${s.men ? '' : 'wiped'}">
          <td><button class="chk" data-dep="${s.id}">${s.deployed ? '■' : '□'}</button></td>
          <td>${u.name} <b>Lv${s.level}</b></td>
          <td class="${full ? '' : 'bad'}">${s.men} / ${u.count}</td>
          <td><div class="xp"><i style="width:${lvMax ? 100 : s.xp / G.ARMY.squadXpToNext(s.level) * 100}%"></i></div></td>
          <td>${A.costOf(s)}</td>
          <td><button class="mini ${pts ? 'hot' : ''}" data-vet-open="${s.id}">老兵${pts ? `（${pts} 點）` : ''}</button>
              ${full ? '' : `<button class="mini" data-refill="${s.id}">補員 ${rc} 金</button>`}
              <button class="mini warn" data-dismiss="${s.id}">${confirmDismiss === s.id ? '確定解散？' : '解散'}</button></td></tr>
          ${openVet === s.id ? `<tr class="vetRow"><td colspan="6">${vetTree(s, pts)}</td></tr>` : ''}`;
      }).join('')}</table>` : '<p class="note">名冊是空的，先招募兵團。</p>';
    $('recruit').innerHTML = Object.entries(G.UNITS).map(([k, u]) =>
      `<button class="mini" data-recruit="${k}">招募${u.name}（${u.count} 人・${A.recruitCost(k)} 金・統率 ${G.ARMY.leadership[k]}）</button>`).join('');
  }

  /** 老兵技能樹：兩條分支並排，已點的亮起、下一節可以點、其餘鎖住 */
  function vetTree(s, pts) {
    const branches = G.VETERAN[s.type].map((b, i) => `<div class="branch"><b>${b.name}</b>${b.nodes.map((n, j) => {
      const taken = j < s.vet[i], next = j === s.vet[i];
      const inner = `<span class="nm">${n.name}</span><small>${n.desc}</small>`;
      return next && pts ? `<button class="node next" data-vet-buy="${s.id}:${i}">${inner}</button>`
        : `<div class="node ${taken ? 'taken' : next ? 'next' : 'locked'}">${inner}</div>`;
    }).join('')}</div>`).join('');
    const spent = s.vet[0] + s.vet[1];
    return `<div class="vet"><div class="vetHead">老兵點：<b>${pts}</b>（兵團每升一級得 1 點，Lv${G.ARMY.squadMaxLevel} 共 ${G.ARMY.squadMaxLevel - 1} 點；同一條要依序點）
      ${spent ? `<button class="mini warn" data-vet-reset="${s.id}">重置（${G.VETERAN_RESET_COST} 金）</button>` : ''}</div>
      <div class="branches">${branches}</div></div>`;
  }

  /** 兵種圖鑑：直接從 js/data 產生，數值改了這裡就跟著變 */
  function renderCodex() {
    const types = Object.values(G.UNITS), short = { pike: '長槍', shield: '盾', archer: '弓', cav: '騎' };
    const head = `<tr><th>攻 \\ 守</th>${types.map(u => `<th>${u.name}</th>`).join('')}</tr>`;
    const rows = types.map(a => `<tr><th>${a.name}</th>${types.map(d => {
      const m = G.counterMul(a.type, d.type), note = a.type === 'archer' && d.frontRangedMul ? `（正面 ${d.frontRangedMul}）` : '';
      return `<td class="${m > 1.2 ? 'good' : m < 0.85 ? 'bad' : ''}">${m}${note}</td>`;
    }).join('')}</tr>`).join('');
    const cards = types.map(u => `<div class="unitCard"><b>${u.name}</b>
      <small>生命 ${u.hp}・攻擊 ${u.atk}・護甲 ${u.armor}・速度 ${u.speed}・射程 ${u.range}</small>
      <small>${u.desc}</small>
      <small>陣型：${u.formations.map(f => G.FORMATIONS[f].name).join('、')}</small>
      <small>技能：${u.skills.map(k => `<b>${G.UNIT_SKILLS[k].name}</b> ${G.UNIT_SKILLS[k].desc}`).join('<br>')}</small></div>`).join('');
    $('codex').innerHTML = `<table>${head}${rows}</table>
      <p class="note">情境：側面 ×${G.CONFIG.flankMul}、背後 ×${G.CONFIG.rearMul}、騎兵衝鋒 ×${G.CONFIG.chargeMul}（撞上架槍的長槍兵正面會被反制）</p>
      <div class="cards">${cards}</div>`;
  }

  function bind() {
    $('menu').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'startBtn') return go();
      const d = b.dataset, A = G.Army;
      let err;
      if (d.sc) lo.scenario = d.sc;
      if (d.wp) lo.weapon = d.wp;
      if (d.dep) err = A.toggleDeploy(+d.dep);
      if (d.refill) err = A.refill(+d.refill);
      if (d.recruit) err = A.recruit(d.recruit);
      if (d.vetOpen) openVet = openVet === +d.vetOpen ? null : +d.vetOpen;
      if (d.vetBuy) { const [id, br] = d.vetBuy.split(':').map(Number); err = A.buyVet(id, br); }
      if (d.vetReset) err = A.resetVet(+d.vetReset);
      if (d.dismiss) {
        if (confirmDismiss === +d.dismiss) { A.dismiss(+d.dismiss); confirmDismiss = null; }
        else confirmDismiss = +d.dismiss;
      } else confirmDismiss = null;
      msg(err);
      render();
    });
    $('menu').addEventListener('change', e => {
      const s = e.target;
      if (s.dataset.eq) lo.equip[s.dataset.eq] = s.value;
    });
    addEventListener('keydown', e => { if (e.code === 'Enter' && $('menu').style.display !== 'none') go(); });
  }

  /** 用目前選單設定＋名冊出戰；結算畫面按 R 也走這裡（名冊已經更新） */
  function go() {
    try { localStorage.setItem(KEY, JSON.stringify(lo)); } catch (e) {}
    const squads = G.Army.loadout();
    if (!squads.length && !G.Game.SCENARIOS[lo.scenario].test) { open(); msg('至少勾選一支有兵的兵團出戰'); return; }
    $('menu').style.display = 'none';
    G.Game.start({ ...JSON.parse(JSON.stringify(lo)), squads, heroLevel: G.Army.heroLevel() });
  }
  function open(text) { $('title').style.display = 'none'; $('menu').style.display = 'block'; render(); msg(text); }

  /** 開場畫面：按任意鍵或點一下進選單 */
  function showTitle() {
    const t = $('title'); t.style.display = 'flex'; t.classList.remove('leaving'); $('menu').style.display = 'none';
    startEmbers();
    let leaving = false;
    const go = e => {
      if (e.type === 'keydown' && ['F3', 'Tab'].includes(e.code)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (leaving) return; leaving = true;
      removeEventListener('keydown', go, true); t.removeEventListener('click', go);
      t.classList.add('leaving');
      setTimeout(() => { t.style.display = 'none'; stopEmbers(); open(); }, 480);
    };
    addEventListener('keydown', go, true); t.addEventListener('click', go);
  }

  /* 開場的火星與灰燼（往上飄） */
  let emberRaf = 0;
  function startEmbers() {
    const cv = $('embers'), ctx = cv.getContext('2d'), ps = [];
    const spawn = (init) => ({
      x: Math.random() * cv.width, y: init ? Math.random() * cv.height : cv.height + 10,
      vx: (Math.random() - 0.5) * 20, vy: -(30 + Math.random() * 90), r: Math.random() < 0.75 ? 2 + Math.random() * 2 : 4 + Math.random() * 2,
      life: 0, max: 3 + Math.random() * 5, ash: Math.random() < 0.3, wob: Math.random() * 6,
    });
    const resize = () => { cv.width = innerWidth; cv.height = innerHeight; };
    resize(); addEventListener('resize', resize);
    for (let i = 0; i < 160; i++) ps.push(spawn(true));
    let last = performance.now();
    const step = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of ps) {
        p.life += dt; p.x += (p.vx + Math.sin(p.life * 2 + p.wob) * 12) * dt; p.y += p.vy * dt;
        const k = 1 - p.life / p.max;
        if (k <= 0 || p.y < -10) Object.assign(p, spawn(false));
        ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = p.ash ? '#7a6a60' : (p.r > 2 ? '#ffd27a' : Math.random() < 0.5 ? '#ff8a2a' : '#ff5a1f');
        if (!p.ash) { ctx.shadowColor = '#ff7a20'; ctx.shadowBlur = 6; } else ctx.shadowBlur = 0;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.r, p.r);
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      emberRaf = requestAnimationFrame(step);
    };
    cancelAnimationFrame(emberRaf); emberRaf = requestAnimationFrame(step);
  }
  function stopEmbers() { cancelAnimationFrame(emberRaf); }

  return { init() { bind(); showTitle(); }, open, deploy: go };
})();
