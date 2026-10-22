/* ============ menu.js — 登入、出戰準備（場景、武器、裝備、武將、軍團名冊），以及兵種圖鑑 ============
 * 開場畫面 → 登入／註冊（G.Api）→ 載入伺服器上的存檔（G.Army）→ 選單。
 * 場景、武器、裝備的選擇存在存檔的 settings 裡。
 */
G.Menu = (() => {
  const $ = id => document.getElementById(id);
  const DEFAULT_LO = { scenario: 'field', weapon: 'sword', equip: { helm: 'helm_iron', armor: 'armor_mail', gloves: 'gloves_leather', cape: 'cape_wool' } };
  let lo = JSON.parse(JSON.stringify(DEFAULT_LO));
  let user = null;             // 登入中的帳號名稱
  let confirmDismiss = null;   // 解散要按兩次：第一次記下 id
  let openVet = null;          // 展開老兵技能樹的兵團 id
  let panel = null;            // 目前打開的面板（城內建築的 role）；null 是沒開

  function msg(text) { $('menuMsg').textContent = text || ''; }

  /* ---------- 登入 ---------- */
  /** 離開開場畫面後：已登入就直接進選單，否則顯示登入框 */
  async function enter() {
    try { const me = await G.Api.me(); await afterLogin(me.username); }
    catch (e) { showLogin(e.status === 401 ? '' : e.message); }
  }
  function showLogin(text) {
    $('menu').style.display = 'none'; $('login').style.display = 'flex';
    $('lgMsg').textContent = text || '';
    $('lgUser').focus();
  }
  async function afterLogin(name) {
    const { data } = await G.Api.loadProfile();
    user = name;
    G.Army.useProfile(data);
    lo = { ...JSON.parse(JSON.stringify(DEFAULT_LO)), ...((data && data.settings) || {}) };
    if (!G.Game.SCENARIOS[lo.scenario]) lo.scenario = DEFAULT_LO.scenario;
    const face = document.getElementById('heroFace'); if (face) face.src = lo.portrait || 'assets/portraits/hero.png';
    $('login').style.display = 'none';
    G.Net.start();   // 多人連線：城池歸屬、其他玩家、聊天
    // 還沒選外觀（新帳號）：先創角
    if (G.LOOKS && G.LOOKS.length && !lo.look) return G.Create.open(lo, (look, portrait) => { setLook(look, portrait); G.Town.enter(`歡迎來到${G.TOWNS.main.name}`); });
    G.Town.enter(`歡迎回到${G.TOWNS.main.name}`);
  }
  /** 存角色外觀與頭像（設定的一部分） */
  function setLook(look, portrait) {
    lo.look = look; lo.portrait = portrait;
    const l = (G.LOOKS || []).find(l => l.key === look); if (l && l.weapon) lo.weapon = l.weapon;   // 外觀綁職業
    G.Army.saveSettings(JSON.parse(JSON.stringify(lo)));
    const f = document.getElementById('heroFace'); if (f) f.src = portrait;
  }
  async function submitLogin(action) {
    const u = $('lgUser').value.trim(), pw = $('lgPass').value;
    $('lgMsg').textContent = action === 'register' ? '註冊中…' : '登入中…';
    try {
      const r = await (action === 'register' ? G.Api.register(u, pw) : G.Api.login(u, pw));
      $('lgPass').value = '';
      await afterLogin(r.username);
    } catch (e) { $('lgMsg').textContent = e.message; }
  }
  async function logout() {
    try { await G.Api.logout(); } catch (e) {}
    user = null; G.Net.stop(); closePanel(); G.Town.leave(); G.Game.startDemo(); showLogin('已登出');
  }

  const statText = st => Object.entries(st).map(([k, v]) => ({
    hp: `生命 +${v}`, armor: `護甲 +${v}`, atk: `攻擊 +${v}%`, cdr: `冷卻 -${v}%`,
    squadAtk: `兵團攻擊 +${v}%`, squadSpeed: `兵團移速 +${v}%`, squadArmor: `兵團護甲 +${v}`,
  }[k])).join('、');

  /** 旅店：糧食（出城行軍會吃，斷糧會餓死士兵） */
  function renderInn() {
    const P = G.Army.profile(), men = P.roster.filter(s => s.deployed || s.field).reduce((a, s) => a + s.men, 0);
    $('foodInfo').textContent = `目前糧食 ${P.food ?? 200} 份。在大地圖上每 30 秒吃 ${Math.max(1, Math.ceil(men / 40))} 份（出戰 ${men} 人），吃完就斷糧：行軍變慢、士兵會餓死。每份 ${G.WORLD.foodPrice} 金。`;
  }
  function render() {
    if (panel === 'inn') renderInn();
    const fo = lo.fieldOrder === 'attack' ? 'attack' : 'defend';
    $('fieldOrder').innerHTML = `<small>配置兵團開戰時：</small>${[['defend', '防守'], ['attack', '進攻']].map(([k, n]) =>
      `<button class="mini ${fo === k ? 'hot' : ''}" data-order="${k}">${n}</button>`).join('')}<small>（戰鬥中按 H 切換）</small>`;
    $('scenarios').innerHTML = Object.entries(G.Game.SCENARIOS).map(([k, s]) =>
      `<button class="card ${lo.scenario === k ? 'on' : ''}" data-sc="${k}"><b>${s.name}</b><small>${s.desc}</small></button>`).join('');
    $('weapons').innerHTML = Object.entries(G.WEAPONS).map(([k, w]) =>
      `<button class="card ${lo.weapon === k ? 'on' : ''}" data-wp="${k}"><b>${w.name}</b><small>${w.desc}</small><small>外觀：${(G.LOOKS || []).filter(l => l.weapon === k).map(l => l.name).join('、') || '—'}</small>
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
      <div class="stat"><span>隨身統率</span><b class="${used > cap ? 'bad' : ''}">${used} / ${cap}</b></div>
      <div class="stat"><span>配置統率</span><b class="${A.fieldUsed() > A.fieldCap() ? 'bad' : ''}">${A.fieldUsed()} / ${A.fieldCap()}</b></div>
      <div class="stat"><span>金幣</span><b>${P.gold}</b></div>
      <small class="hint">隨身兵團一次只上場一支，在補給點（T）換下一支；配置兵團開戰時擺在戰場上，可以用左下角的指揮列切到「配置」用滑鼠指揮。武將升級提高兩種統率上限與生命。</small>`;
    $('roster').innerHTML = P.roster.length ? `<table class="roster">
      <tr><th>隨身</th><th>配置</th><th>兵團</th><th>人數</th><th>經驗</th><th>統率</th><th></th></tr>
      ${P.roster.map(s => {
        const u = G.UNITS[s.type], full = s.men >= u.count, rc = A.refillCost(s), lvMax = s.level >= G.ARMY.squadMaxLevel, pts = A.vetPoints(s);
        return `<tr class="${s.deployed || s.field ? 'on' : ''} ${s.men ? '' : 'wiped'}">
          <td><button class="chk" data-dep="${s.id}">${s.deployed ? '■' : '□'}</button></td>
          <td><button class="chk" data-field="${s.id}">${s.field ? '■' : '□'}</button></td>
          <td class="rName">${G.Sprites.icon(u.sprite, 1) ? `<img class="rIcon" src="${G.Sprites.icon(u.sprite, 1)}" alt="">` : ''}${u.name} <b>Lv${s.level}</b></td>
          <td class="${full ? '' : 'bad'}">${s.men} / ${u.count}</td>
          <td><div class="xp"><i style="width:${lvMax ? 100 : s.xp / G.ARMY.squadXpToNext(s.level) * 100}%"></i></div></td>
          <td>${A.costOf(s)}</td>
          <td class="rAct"><button class="mini ${pts ? 'hot' : ''}" data-vet-open="${s.id}">專精${pts ? `・${pts} 點可用` : ''}</button>
              ${full ? '' : `<button class="mini" data-refill="${s.id}">補員 ${rc} 金</button>`}
              <button class="mini warn" data-dismiss="${s.id}">${confirmDismiss === s.id ? '確定解散？' : '解散'}</button></td></tr>
          ${openVet === s.id ? `<tr class="vetRow"><td colspan="7">${vetTree(s, pts)}</td></tr>` : ''}`;
      }).join('')}</table>` : '<p class="note">名冊是空的，先招募兵團。</p>';
    // 招募：每個兵種一張卡（兵種圖、類別、人數、統率、說明，下面是價錢按鈕）
    $('recruit').innerHTML = `<h3 class="ribbon">招募兵團</h3><div class="rcGrid">${Object.entries(G.UNITS).map(([k, u]) => {
      const cost = A.recruitCost(k), poor = P.gold < cost, ic = G.Sprites.icon(u.sprite, 2);
      return `<div class="rcCard ${poor ? 'poor' : ''}">
        <div class="rcPic">${ic ? `<img src="${ic}" alt="">` : ''}</div>
        <div class="rcInfo"><b>${u.name}</b><span class="rcTag">${G.TYPE_NAMES[u.type] || ''}</span>
          <small>${u.count} 人・統率 ${G.ARMY.leadership[k]}</small><p>${u.desc || ''}</p></div>
        <button class="mini rcBuy" data-recruit="${k}" ${poor ? 'title="金幣不夠"' : ''}>招募　${cost} 金</button></div>`;
    }).join('')}</div>`;
  }

  /** 兵團專精（老兵技能樹）：兩條分支並排，已點的亮起、下一節可以點、其餘鎖住 */
  function vetTree(s, pts) {
    const branches = G.VETERAN[s.type].map((b, i) => `<div class="branch"><b>${b.name}</b>${b.nodes.map((n, j) => {
      const taken = j < s.vet[i], next = j === s.vet[i];
      const inner = `<span class="nm">${n.name}</span><small>${n.desc}</small>`;
      return next && pts ? `<button class="node next" data-vet-buy="${s.id}:${i}">${inner}</button>`
        : `<div class="node ${taken ? 'taken' : next ? 'next' : 'locked'}">${inner}</div>`;
    }).join('')}</div>`).join('');
    const spent = s.vet[0] + s.vet[1];
    return `<div class="vet"><div class="vetHead">兵團專精　可用點數：<b>${pts}</b>（兵團每升一級得 1 點，Lv${G.ARMY.squadMaxLevel} 共 ${G.ARMY.squadMaxLevel - 1} 點；同一條要依序點）
      ${spent ? `<button class="mini warn" data-vet-reset="${s.id}">重置（${G.VETERAN_RESET_COST} 金）</button>` : ''}</div>
      <div class="branches">${branches}</div></div>`;
  }

  /** 兵種圖鑑：直接從 js/data 產生，數值改了這裡就跟著變 */
  function renderCodex() {
    // 克制表依類別列（20 種兵種兩兩列太大）；每張兵種卡寫出自己屬於哪一類
    const types = Object.values(G.UNITS), cats = Object.keys(G.COUNTERS), N = G.TYPE_NAMES;
    const head = `<tr><th>攻 \\ 守</th>${cats.map(c => `<th>${N[c]}</th>`).join('')}</tr>`;
    const rows = cats.map(a => `<tr><th>${N[a]}</th>${cats.map(d => {
      const m = G.counterMul(a, d);
      return `<td class="${m > 1.2 ? 'good' : m < 0.85 ? 'bad' : ''}">${m}</td>`;
    }).join('')}</tr>`).join('');
    const cards = types.map(u => `<div class="unitCard"><b>${u.name}</b><small>類別：${N[u.type]}${u.frontRangedMul ? `・正面受遠程 ×${u.frontRangedMul}` : ''}${u.engineer ? '・操作器械一人算兩人' : ''}</small>
      <small>生命 ${u.hp}・攻擊 ${u.atk}・護甲 ${u.armor}・速度 ${u.speed}・射程 ${u.range}</small>
      <small>${u.desc}</small>
      <small>陣型：${u.formations.map(f => G.FORMATIONS[f].name).join('、')}</small>
      <small>技能：${u.skills.map(k => `<b>${G.UNIT_SKILLS[k].name}</b> ${G.UNIT_SKILLS[k].desc}`).join('<br>')}</small></div>`).join('');
    $('codex').innerHTML = `<table>${head}${rows}</table>
      <p class="note">情境：側面 ×${G.CONFIG.flankMul}、背後 ×${G.CONFIG.rearMul}、騎兵衝鋒 ×${G.CONFIG.chargeMul}（撞上架槍的長槍兵正面會被反制）</p>
      <div class="cards">${cards}</div>`;
  }

  function bind() {
    $('foodBuy').onclick = e => { const b = e.target.closest('[data-food]'); if (!b) return; const err = G.Army.buyFood(+b.dataset.food); msg(err || `買了 ${b.dataset.food} 份糧食`); render(); };
    // 主堡的武將面板：重新選外觀與頭像
    $('changeLook').onclick = () => { const p = panel, t = $('panelTitle').textContent; closePanel(); G.Create.open(lo, (look, portrait) => { if (look) { setLook(look, portrait); if (G.Town.hero) G.Town.hero.look = look; G.Town.renderHud(); } openPanel(p, t); }, { edit: true }); };
    $('menu').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'startBtn') return go();
      if (b.id === 'logoutBtn') return logout();
      if (b.id === 'closePanel') return closePanel();
      const d = b.dataset, A = G.Army;
      let err;
      if (d.sc) lo.scenario = d.sc;
      if (d.wp) {   // 換職業：外觀跟著換成這個職業的（目前的外觀不是這個職業才換）
        lo.weapon = d.wp;
        const L = G.LOOKS || [], cur = L.find(l => l.key === lo.look);
        if (!cur || cur.weapon !== d.wp) { const nl = L.find(l => l.weapon === d.wp); if (nl) { setLook(nl.key, nl.portrait); if (G.Town.hero) G.Town.hero.look = nl.key; G.Town.renderHud(); } }
      }
      if (d.dep) err = A.toggleDeploy(+d.dep, 'escort');
      if (d.field) err = A.toggleDeploy(+d.field, 'field');
      if (d.order) lo.fieldOrder = d.order;
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
    // Enter 只有在兵營的「演習」面板才是開戰
    addEventListener('keydown', e => { if (e.code === 'Enter' && panel === 'drill' && $('menu').style.display !== 'none') go(); });
    // 登入框：Enter 送出＝登入；「註冊新帳號」另外一個按鈕
    $('loginForm').addEventListener('submit', e => { e.preventDefault(); submitLogin('login'); });
    $('registerBtn').addEventListener('click', () => submitLogin('register'));
    // 存檔上傳失敗：登入過期就回登入框，其他錯誤顯示在選單上
    G.Army.onSaveError(e => e.status === 401 ? showLogin('登入已過期，請重新登入') : msg(`存檔失敗：${e.message}`));
  }

  /** 用目前選單設定＋名冊出戰；結算畫面按 R 也走這裡（名冊已經更新） */
  async function go() {
    G.Army.saveSettings(JSON.parse(JSON.stringify(lo)));
    const { escort, field } = G.Army.loadout();
    if (!escort.length && !G.Game.SCENARIOS[lo.scenario].test) { openPanel('drill', '兵營・演習'); msg('至少勾選一支有兵的隨身兵團'); return; }
    // 演習也要出戰單（伺服器記錄出戰兵團；演習不計傷亡、不給獎勵）
    try { await G.Army.beginBattle('drill', lo.scenario); } catch (e) { openPanel('drill', '兵營・演習'); msg(e.message); return; }
    closePanel();
    G.Game.start({ ...JSON.parse(JSON.stringify(lo)), squads: escort, field, heroLevel: G.Army.heroLevel(), name: user });
  }
  function open(text) { openPanel('drill', '兵營・演習'); msg(text); }

  /** 城內建築的面板：只顯示 data-p 包含 p 的段落；title 是建築名稱 */
  const TITLES = { drill: '兵營・演習', recruit: '募兵處', smith: '鐵匠鋪', hero: '主角', codex: '兵營・兵種圖鑑', help: '遊戲說明', inn: '旅店' };
  function openPanel(p, title) {
    panel = p; $('title').style.display = 'none';
    $('menu').style.display = 'block';
    for (const el of $('menu').querySelectorAll('[data-p]')) el.style.display = el.dataset.p.split(' ').includes(p) ? '' : 'none';
    $('panelTitle').textContent = title || TITLES[p] || 'TopPath Blade';
    render(); msg('');
    $('menu').scrollTop = 0;
  }
  function closePanel() {
    if (panel) G.Army.saveSettings(JSON.parse(JSON.stringify(lo)));   // 選的武器、裝備、戰場存起來
    panel = null; $('menu').style.display = 'none';
  }

  /** 開場畫面：按任意鍵或點一下進選單 */
  function showTitle() {
    const t = $('title'); t.style.display = 'flex'; t.classList.remove('leaving'); $('menu').style.display = 'none';
    startEmbers();
    let leaving = false;
    const go = e => {
      if (e.type === 'keydown' && ['F3', 'Tab'].includes(e.code)) return;
      if (!G.Assets.done) return;   // 圖片還在載入
      e.preventDefault(); e.stopImmediatePropagation();
      if (leaving) return; leaving = true;
      removeEventListener('keydown', go, true); t.removeEventListener('click', go);
      t.classList.add('leaving');
      setTimeout(() => { t.style.display = 'none'; stopEmbers(); enter(); }, 480);
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

  return {
    init() { bind(); showTitle(); }, open, deploy: go, openPanel, closePanel,
    panelOpen: () => !!panel || G.Create.isOpen(),
    logout,
    /** 目前的武器、裝備、配置兵團預設與帳號名稱（城內場景用） */
    loadout: () => ({ ...lo, name: user }),
    setLook,
    /** 頭像圖（沒選過用預設） */
    portrait: () => lo.portrait || 'assets/portraits/hero.png',
  };
})();
