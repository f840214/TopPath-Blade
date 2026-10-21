/* ============ menu.js — 出戰準備：場景、武器、裝備、兵團，以及兵種圖鑑 ============ */
G.Menu = (() => {
  const $ = id => document.getElementById(id);
  const KEY = 'tpb-loadout';
  let lo = { scenario: 'field', weapon: 'sword', equip: { helm: 'helm_iron', armor: 'armor_mail', gloves: 'gloves_leather', cape: 'cape_wool' }, squads: ['pikeman', 'archer'] };
  try { Object.assign(lo, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}

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
    $('squadPick').innerHTML = [0, 1].map(i => `<label>第${i + 1}隊<select data-sq="${i}">${Object.entries(G.UNITS).map(([k, u]) =>
      `<option value="${k}" ${lo.squads[i] === k ? 'selected' : ''}>${u.name}（${u.count} 人）</option>`).join('')}</select></label>`).join('');
    renderCodex();
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
      if (b.dataset.sc) lo.scenario = b.dataset.sc;
      if (b.dataset.wp) lo.weapon = b.dataset.wp;
      if (b.id === 'startBtn') return go();
      render();
    });
    $('menu').addEventListener('change', e => {
      const s = e.target;
      if (s.dataset.eq) lo.equip[s.dataset.eq] = s.value;
      if (s.dataset.sq) lo.squads[+s.dataset.sq] = s.value;
    });
    addEventListener('keydown', e => { if (e.code === 'Enter' && $('menu').style.display !== 'none') go(); });
  }

  function go() {
    try { localStorage.setItem(KEY, JSON.stringify(lo)); } catch (e) {}
    $('menu').style.display = 'none';
    G.Game.start(JSON.parse(JSON.stringify(lo)));
  }
  function open() { $('title').style.display = 'none'; $('menu').style.display = 'block'; render(); }

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

  return { init() { bind(); showTitle(); }, open };
})();
