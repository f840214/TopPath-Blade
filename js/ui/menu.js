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
  let openDoc = null;          // 展開戰術書的兵團 id
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
    $('horseInfo').textContent = `目前馬匹 ${G.Army.horses()} 匹。騎兵、騎射兵、重甲騎兵招募和補員，每個人要一匹馬（每匹 ${G.ARMY.horsePrice} 金）。`;
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
    renderGear();
    renderArmy();
    renderGrowth();
    if (panel === 'social') renderSocial();
    if (panel === 'market') renderMarket();
    $('matchBox').innerHTML = `<button class="mini ${G.Net.queued ? 'warn' : 'hot'}" data-match="1">${G.Net.queued ? `取消配對（排隊 ${G.Net.queued} 人）` : '多人野戰配對'}</button><small>　跟其他玩家分兩隊打一場野戰（湊到 2～10 人開打，人數平均分）；打贏有材料、裝備、戰術書</small>`;
    renderCodex();
  }

  /** 裝備：穿著的（耐久、修理）、倉庫（穿上、拆解）、材料；鐵匠鋪多一個打造清單 */
  function renderGear() {
    const A = G.Army, P = A.profile(), g = A.gearOf(), GR = G.GEAR;
    const name = i => `<b style="color:${G.RARITY[i.rarity].color}">${i.name}</b>`;
    $('equip').innerHTML = G.EQUIP_SLOTS.map(s => {
      const it = g[s.key], info = it && A.itemOf(it.id), rc = A.repairCost(s.key);
      return `<div class="stat"><span>${s.name}　${info ? name(info) : '—'}<small>　${info ? statText(info.stats) : ''}</small></span>
        <span><small class="${it && it.dur ? '' : 'bad'}">${it ? (it.dur ? `耐久 ${it.dur}` : '壞了') : ''}</small>${rc ? ` <button class="mini" data-repair="${s.key}">修理 ${rc} 金</button>` : ''}</span></div>`;
    }).join('')
      + `<p class="note">材料：${Object.entries(G.MATERIALS).map(([k, n]) => `${n} <b>${P.mats[k] || 0}</b>`).join('　')}</p>`
      + `<h4>倉庫（${P.stash.length} / ${GR.stashMax}）</h4>` + (P.stash.length ? P.stash.map((it, i) => { const info = A.itemOf(it.id); return info ? `<div class="stat"><span>${name(info)}<small>　${G.EQUIP_SLOTS.find(s => s.key === info.slot).name}・${statText(info.stats)}・耐久 ${it.dur}</small></span>
        <span><button class="mini hot" data-equip="${i}">穿上</button> <button class="mini warn" data-salvage="${i}">拆解</button></span></div>` : ''; }).join('') : '<p class="note">打贏攻城、北境聯軍、強盜會掉材料，有機會掉裝備。每打一場穿著的裝備會掉耐久，壞了就沒有效果。</p>')
      + (panel === 'smith' ? `<h4>打造</h4>` + G.EQUIP_SLOTS.flatMap(s => G.EQUIPMENT[s.key]).map(i => { const r = G.CRAFT[i.rarity];
        return `<div class="stat"><span>${name(i)}<small>　${statText(i.stats)}</small></span><span><small>${r.gold} 金・${Object.entries(G.MATERIALS).filter(([k]) => r[k]).map(([k, n]) => `${n} ${r[k]}`).join('・')}</small> <button class="mini" data-craft="${i.id}">打造</button></span></div>`; }).join('') : '');
  }

  /** 主堡、鐵匠鋪：屬性點（每升一級 2 點）、每把武器的專精、專精 3 級後可以換技能 */
  function renderGrowth() {
    const A = G.Army, h = A.profile().hero, at = h.attrs || {}, pts = A.attrPoints(), HA = G.HERO_ATTRS;
    $('heroAttrs').innerHTML = `<p class="note">可用點數 <b>${pts}</b>（每升一級 ${HA.perLevel} 點）</p>`
      + Object.entries(HA.list).map(([k, a]) => `<div class="stat"><span>${a.name} <b>${at[k] || 0}</b><small>　${a.desc}</small></span><button class="mini ${pts ? 'hot' : ''}" data-attr="${k}" ${pts ? '' : 'disabled'}>+1</button></div>`).join('')
      + `<button class="mini warn" data-attr-reset="1">重新分配（${HA.resetCost} 金）</button>`;
    const M = G.MASTERY, ms = h.mastery || {}, wk = lo.weapon, w = G.WEAPONS[wk], lv = G.masteryLevel(ms[wk]), next = M.xp[lv];
    const choice = (lo.skills && lo.skills[wk]) || {}, can = lv >= M.altAt;
    $('heroMastery').innerHTML = `<p class="note">用一把武器打仗會累積它的專精：武將親手擊殺每人 +${M.xpPerKill}、打贏 +${M.xpWin}。每級這把武器攻擊 +${Math.round(M.atkPerLevel * 100)}%，${M.altAt} 級可以換技能。</p>`
      + `<div class="stat"><span>${w.name} 專精 <b>Lv${lv}</b></span><small>${next ? `${ms[wk] || 0} / ${next}` : '已滿級'}</small></div>`
      + `<div class="xp"><i style="width:${next ? (ms[wk] || 0) / next * 100 : 100}%"></i></div>`
      + ['Q', 'E', 'R'].filter(s => w.alt && w.alt[s]).map(s => {
        const alt = choice[s] === 'alt';
        return `<div class="stat"><span>${s}</span><span><button class="mini ${alt ? '' : 'hot'}" data-skill="${s}:def">${G.HERO_SKILLS[w.skills[s]].name}</button>
          <button class="mini ${alt ? 'hot' : ''}" data-skill="${s}:alt" ${can ? '' : `disabled title="專精 ${M.altAt} 級解鎖"`}>${G.HERO_SKILLS[w.alt[s]].name}${can ? '' : '（鎖）'}</button></span></div>`;
      }).join('')
      + `<small class="hint">其他武器：${Object.entries(G.WEAPONS).filter(([k]) => k !== wk && ms[k]).map(([k, o]) => `${o.name} Lv${G.masteryLevel(ms[k])}`).join('、') || '還沒用過'}</small>`;
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
        const u = G.UNITS[s.type], full = s.men >= u.count, rc = A.refillCost(s, G.Town.cityId), lvMax = s.level >= G.ARMY.squadMaxLevel, pts = A.vetPoints(s);
        return `<tr class="${s.deployed || s.field ? 'on' : ''} ${s.men ? '' : 'wiped'}">
          <td><button class="chk" data-dep="${s.id}">${s.deployed ? '■' : '□'}</button></td>
          <td><button class="chk" data-field="${s.id}">${s.field ? '■' : '□'}</button></td>
          <td class="rName">${G.Sprites.icon(u.sprite, 1) ? `<img class="rIcon" src="${G.Sprites.icon(u.sprite, 1)}" alt="">` : ''}${u.name} <b>Lv${s.level}</b></td>
          <td class="${full ? '' : 'bad'}">${s.men} / ${u.count}</td>
          <td><div class="xp"><i style="width:${lvMax ? 100 : s.xp / G.ARMY.squadXpToNext(s.level) * 100}%"></i></div></td>
          <td>${A.costOf(s)}</td>
          <td class="rAct"><button class="mini ${pts ? 'hot' : ''}" data-vet-open="${s.id}">專精${pts ? `・${pts} 點可用` : ''}</button>
              <button class="mini" data-doc-open="${s.id}">戰術書 ${A.slotsOf(s).filter(Boolean).length}/${A.slotsOf(s).length}</button>
              ${full ? '' : `<button class="mini" data-refill="${s.id}">補員 ${rc} 金</button>`}
              <button class="mini warn" data-dismiss="${s.id}">${confirmDismiss === s.id ? '確定解散？' : '解散'}</button></td></tr>
          ${openVet === s.id ? `<tr class="vetRow"><td colspan="7">${vetTree(s, pts)}</td></tr>` : ''}
          ${openDoc === s.id ? `<tr class="vetRow"><td colspan="7">${docPanel(s)}</td></tr>` : ''}`;
      }).join('')}</table>` : '<p class="note">名冊是空的，先招募兵團。</p>';
    // 招募：每個兵種一張卡（兵種圖、類別、人數、統率、說明，下面是價錢按鈕）
    $('recruit').innerHTML = `<h3 class="ribbon">招募兵團${A.localMul(G.Town.cityId) < 1 ? '（在自己的城：八折）' : ''}</h3><div class="rcGrid">${Object.entries(G.UNITS).map(([k, u]) => {
      const cost = A.recruitCost(k, G.Town.cityId), poor = P.gold < cost, ic = G.Sprites.icon(u.sprite, 2);
      if (!A.isUnlocked(k)) return `<div class="rcCard poor locked">
        <div class="rcPic">${ic ? `<img src="${ic}" alt="" style="filter:grayscale(1) brightness(0.6)">` : ''}</div>
        <div class="rcInfo"><b>${u.name}</b><span class="rcTag">${G.TYPE_NAMES[u.type] || ''}</span><small>🔒 ${A.unlockHint(k)}</small><p>${u.desc || ''}</p></div>
        <button class="mini rcBuy" disabled>未解鎖</button></div>`;
      return `<div class="rcCard ${poor ? 'poor' : ''}">
        <div class="rcPic">${ic ? `<img src="${ic}" alt="">` : ''}</div>
        <div class="rcInfo"><b>${u.name}</b><span class="rcTag">${G.TYPE_NAMES[u.type] || ''}</span>
          <small>${u.count} 人・統率 ${G.ARMY.leadership[k]}${u.mounted ? `・馬 ${u.count} 匹` : ''}</small><p>${u.desc || ''}</p></div>
        <button class="mini rcBuy" data-recruit="${k}" ${poor ? 'title="金幣不夠"' : ''}>招募　${cost} 金</button></div>`;
    }).join('')}</div>`;
  }

  /** 兵團的戰術書：上面是欄位（點了卸下），下面是書庫（點了插進第一個空格，滿了換掉第一格） */
  function docPanel(s) {
    const A = G.Army, sl = A.slotsOf(s), D = A.docsOf(), D2 = G.DOCTRINES;
    const tag = k => `<b style="color:${G.RARITY[D2[k].rarity].color}">${D2[k].name}</b><small>　${D2[k].desc}</small>`;
    return `<div class="docs"><p class="note">戰術書打贏戰鬥會掉。兵團 Lv1 兩格、Lv6 三格；同一本不能插兩次。</p>`
      + sl.map((k, i) => `<div class="stat"><span>第 ${i + 1} 格　${k ? tag(k) : '<small>空</small>'}</span>${k ? `<button class="mini warn" data-doc-unset="${s.id}:${i}">卸下</button>` : ''}</div>`).join('')
      + `<h4>書庫（${D.length} / ${G.DOCTRINE_MAX}）</h4>`
      + (D.length ? D.map((k, i) => D2[k] ? `<div class="stat"><span>${tag(k)}</span><button class="mini hot" data-doc-set="${s.id}:${i}" ${sl.includes(k) ? 'disabled' : ''}>插上</button></div>` : '').join('') : '<p class="note">書庫是空的。</p>')
      + '</div>';
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
    $('horseBuy').onclick = e => { const b = e.target.closest('[data-horse]'); if (!b) return; const err = G.Army.buyHorses(+b.dataset.horse); msg(err || `買了 ${b.dataset.horse} 匹馬`); render(); };
    // 主堡的武將面板：重新選外觀與頭像
    $('changeLook').onclick = () => { const p = panel, t = $('panelTitle').textContent; closePanel(); G.Create.open(lo, (look, portrait) => { if (look) { setLook(look, portrait); if (G.Town.hero) G.Town.hero.look = look; G.Town.renderHud(); } openPanel(p, t); }, { edit: true }); };
    $('menu').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'startBtn') return go();
      if (b.id === 'logoutBtn') return logout();
      if (b.id === 'closePanel') return closePanel();
      const d = b.dataset, A = G.Army;
      if (Object.keys(d).some(k => /^(fr|pm|gd|mk)[A-Z]|^(pm|party)$/.test(k))) { socialClick(d); return; }   // 會館、市集：送到伺服器
      if (d.match) { G.Net.queue(!G.Net.queued); render(); return; }   // 野戰配對
      if (d.pw) { changePassword(); return; }
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
      if (d.refill) err = A.refill(+d.refill, G.Town.cityId);
      if (d.recruit) err = A.recruit(d.recruit, G.Town.cityId);
      if (d.vetOpen) openVet = openVet === +d.vetOpen ? null : +d.vetOpen;
      if (d.docOpen) openDoc = openDoc === +d.docOpen ? null : +d.docOpen;
      if (d.docSet) { const [id, i] = d.docSet.split(':').map(Number), sl = A.slotsOf(A.profile().roster.find(s => s.id === id)); const k = sl.indexOf(null); err = A.setDoc(id, k < 0 ? 0 : k, i); }
      if (d.docUnset) { const [id, k] = d.docUnset.split(':').map(Number); err = A.unsetDoc(id, k); }
      if (d.vetBuy) { const [id, br] = d.vetBuy.split(':').map(Number); err = A.buyVet(id, br); }
      if (d.vetReset) err = A.resetVet(+d.vetReset);
      if (d.equip) err = A.equip(+d.equip);
      if (d.salvage) err = A.salvage(+d.salvage);
      if (d.repair) err = A.repair(d.repair);
      if (d.craft) err = A.craft(d.craft) || `打造好了：${A.itemOf(d.craft).name}（放進倉庫）`;
      if (d.attr) err = A.buyAttr(d.attr);
      if (d.attrReset) err = A.resetAttrs();
      if (d.skill) { const [s, v] = d.skill.split(':'); lo.skills = lo.skills || {}; const c = lo.skills[lo.weapon] = { ...(lo.skills[lo.weapon] || {}) }; if (v === 'alt') c[s] = 'alt'; else delete c[s]; }
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
    // 演習在伺服器上打（大軍測試是效能測試，還是在瀏覽器跑）；沒連上才在瀏覽器算
    if (!G.Game.SCENARIOS[lo.scenario].test && G.Net.solo('drill', lo.scenario, null)) { closePanel(); return; }
    // 演習也要出戰單（伺服器記錄出戰兵團；演習不計傷亡、不給獎勵）
    try { await G.Army.beginBattle('drill', lo.scenario); } catch (e) { openPanel('drill', '兵營・演習'); msg(e.message); return; }
    closePanel();
    G.Game.start({ ...JSON.parse(JSON.stringify(lo)), squads: escort, field, heroLevel: G.Army.heroLevel(), name: user });
  }
  function open(text) { openPanel('drill', '兵營・演習'); msg(text); }

  /** 城內建築的面板：只顯示 data-p 包含 p 的段落；title 是建築名稱 */
  const TITLES = { drill: '兵營・演習', recruit: '募兵處', smith: '鐵匠鋪', hero: '主角', codex: '兵營・兵種圖鑑', help: '遊戲說明', inn: '旅店', social: '會館・社群', market: '市集' };
  function openPanel(p, title) {
    panel = p; $('title').style.display = 'none';
    $('menu').style.display = 'block';
    for (const el of $('menu').querySelectorAll('[data-p]')) el.style.display = el.dataset.p.split(' ').includes(p) ? '' : 'none';
    $('panelTitle').textContent = title || TITLES[p] || 'TopPath Blade';
    render(); msg('');
    $('menu').scrollTop = 0;
    if (p === 'social') { social = null; renderSocial(); refreshSocial(); }
    if (p === 'market') { marketData = null; renderMarket(); refreshMarket(); }
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

  /** 說明面板的改密碼 */
  async function changePassword() {
    const old = $('pwOld').value, a = $('pwNew').value, b = $('pwNew2').value;
    if (!a || a !== b) return msg('兩次輸入的新密碼不一樣');
    try { await G.Api.changePassword(old, a); msg('密碼改好了'); for (const id of ['pwOld', 'pwNew', 'pwNew2']) $(id).value = ''; }
    catch (e) { msg(e.message); }
  }

  /* ---------- 會館：好友、家族（server/src/social.js）---------- */
  let social = null;   // GET /api/social 的結果
  async function refreshSocial() {
    if (panel !== 'social') return;
    try { social = await G.Api.social(); } catch (e) { msg(e.message); return; }
    renderSocial();
  }
  function renderSocial() {
    const S = social; if (!S) { $('socialBox').innerHTML = '<p class="note">讀取中…</p>'; return; }
    const esc = G.U.esc, on = o => `<i class="dot ${o ? 'on' : ''}"></i>`;
    const friends = S.friends.length ? S.friends.map(f => `<div class="stat"><span>${on(f.online)}${esc(f.name)}<small>${f.accepted ? (f.online ? '　在線上' : '　離線') : f.incoming ? '　想加你好友' : '　等對方接受'}</small></span><span>
        ${f.incoming ? `<button class="mini hot" data-fr-accept="${f.id}">接受</button>` : ''}${f.accepted && f.online ? `<button class="mini" data-pm="${esc(f.name)}">私訊</button><button class="mini" data-party="${f.id}">組隊</button>` : ''}
        <button class="mini warn" data-fr-remove="${f.id}">${f.accepted ? '刪除' : '取消'}</button></span></div>`).join('') : '<p class="note">還沒有好友。</p>';
    const g = S.guild, ROLE = { leader: '族長', officer: '幹部', member: '成員' }, myRole = g && (g.members.find(m => m.id === S.me) || {}).role;
    const guild = g ? `<p class="note">家族 <b>${esc(g.name)}</b>［${esc(g.tag)}］・${g.members.length} 人。家族頻道：聊天框打 <kbd>/g 內容</kbd>。家族的城大家都可以回防、不能互打。</p>`
      + g.members.map(m => `<div class="stat"><span>${on(m.online)}${esc(m.name)}<small>　${ROLE[m.role]}</small></span><span>
        ${myRole === 'leader' && m.id !== S.me ? `<button class="mini" data-gd-promote="${m.id}">${m.role === 'officer' ? '撤幹部' : '升幹部'}</button>` : ''}
        ${myRole !== 'member' && m.id !== S.me && m.role !== 'leader' && !(myRole === 'officer' && m.role === 'officer') ? `<button class="mini warn" data-gd-kick="${m.id}">移出</button>` : ''}</span></div>`).join('')
      + (myRole !== 'member' ? `<div class="row"><input id="gdInvite" placeholder="帳號名稱" maxlength="20"><button class="mini" data-gd-invite="1">邀請加入</button></div>` : '')
      // 聯盟：結盟的家族（族長可以解除）、別人提出的結盟（族長接受）、族長用簡稱提出結盟
      + `<h4>聯盟</h4>` + ((g.allies || []).length ? g.allies.map(a => `<div class="stat"><span>${esc(a.name)}［${esc(a.tag)}］</span>${myRole === 'leader' ? `<button class="mini warn" data-gd-ally-break="${a.id}">解除</button>` : ''}</div>`).join('') : '<p class="note">還沒有結盟。結盟的家族之間不能互打、可以回防、可以進彼此的城。</p>')
      + (g.allyInvites || []).map(a => `<div class="stat"><span>${esc(a.name)}［${esc(a.tag)}］想結盟</span>${myRole === 'leader' ? `<button class="mini hot" data-gd-ally-accept="${a.id}">接受</button>` : ''}</div>`).join('')
      + (myRole === 'leader' ? `<div class="row"><input id="gdAlly" placeholder="對方家族的簡稱" maxlength="4"><button class="mini" data-gd-ally="1">提出結盟</button></div>` : '')
      + `<button class="mini warn" data-gd-leave="1">離開家族</button>`
      : `<p class="note">還沒有家族。建立家族要 ${S.guildCost} 金。</p><div class="row"><input id="gdName" placeholder="家族名稱（12 字內）" maxlength="12"><input id="gdTag" placeholder="簡稱（4 字內）" maxlength="4" style="width:90px"><button class="mini hot" data-gd-create="1">建立</button></div>`
      + (S.invites.length ? '<h4>家族邀請</h4>' + S.invites.map(i => `<div class="stat"><span>${esc(i.name)}［${esc(i.tag)}］</span><span><button class="mini hot" data-gd-accept="${i.id}">加入</button><button class="mini warn" data-gd-decline="${i.id}">拒絕</button></span></div>`).join('') : '');
    $('socialBox').innerHTML = `<div class="two"><div><h4>好友</h4><div class="row"><input id="frName" placeholder="帳號名稱" maxlength="20"><button class="mini" data-fr-add="1">加好友</button></div>${friends}
      <p class="note">私訊：聊天框打 <kbd>/w 名字 內容</kbd>。</p></div><div><h4>家族</h4>${guild}</div></div>`;
  }
  /** 會館、市集的按鈕（伺服器處理完再重畫） */
  async function socialClick(d) {
    const A = G.Api, val = id => ($(id) ? $(id).value.trim() : '');
    let r;
    try {
      if (d.frAdd) r = await A.friends({ op: 'add', name: val('frName') });
      else if (d.frAccept) r = await A.friends({ op: 'accept', id: +d.frAccept });
      else if (d.frRemove) r = await A.friends({ op: 'remove', id: +d.frRemove });
      else if (d.pm) { closePanel(); return G.Net.whisper(d.pm); }
      else if (d.party) { G.Net.inviteFriend(+d.party); msg('已送出組隊邀請'); return true; }
      else if (d.gdCreate) r = await A.guild({ op: 'create', name: val('gdName'), tag: val('gdTag') });
      else if (d.gdInvite) r = await A.guild({ op: 'invite', name: val('gdInvite') });
      else if (d.gdAccept) r = await A.guild({ op: 'accept', id: +d.gdAccept });
      else if (d.gdDecline) r = await A.guild({ op: 'decline', id: +d.gdDecline });
      else if (d.gdLeave) r = await A.guild({ op: 'leave' });
      else if (d.gdKick) r = await A.guild({ op: 'kick', id: +d.gdKick });
      else if (d.gdPromote) r = await A.guild({ op: 'promote', id: +d.gdPromote });
      else if (d.gdAlly) r = await A.guild({ op: 'ally', tag: val('gdAlly') });
      else if (d.gdAllyAccept) r = await A.guild({ op: 'allyAccept', id: +d.gdAllyAccept });
      else if (d.gdAllyBreak) r = await A.guild({ op: 'allyBreak', id: +d.gdAllyBreak });
      else if (d.mkBuy) r = await A.marketOp({ op: 'buy', id: +d.mkBuy });
      else if (d.mkCancel) r = await A.marketOp({ op: 'cancel', id: +d.mkCancel });
      else if (d.mkSell) {
        const [kind, key] = d.mkSell.split(':'), price = Math.round(+val('mkPrice'));
        r = await A.marketOp(kind === 'mat' ? { op: 'sell', kind, mat: key, n: Math.round(+val('mkN')) || 1, price } : { op: 'sell', kind, i: +key, price });
      } else return false;
    } catch (e) { msg(e.message); return true; }
    if (r && r.data) G.Army.adopt(r.data);
    if (d.gdCreate || d.gdAccept || d.gdLeave || d.gdAllyAccept || d.gdAllyBreak) G.Net.refreshCities().catch(() => {});   // 家族變了：城池名牌、家族的城算不算自己人
    msg(r && r.ok);
    if (panel === 'social') refreshSocial(); else if (panel === 'market') refreshMarket();
    return true;
  }

  /* ---------- 市集：玩家之間買賣材料、裝備、戰術書 ---------- */
  let marketData = null;
  async function refreshMarket() {
    if (panel !== 'market') return;
    try { marketData = await G.Api.market(); } catch (e) { msg(e.message); return; }
    renderMarket();
  }
  function renderMarket() {
    const M = marketData, P = G.Army.profile(), A = G.Army, esc = G.U.esc;
    const desc = (kind, it) => kind === 'mat' ? `${G.MATERIALS[it.mat]} ×${it.n}` : kind === 'doc' ? `戰術書 <b style="color:${G.RARITY[G.DOCTRINES[it.doc].rarity].color}">${G.DOCTRINES[it.doc].name}</b><small>　${G.DOCTRINES[it.doc].desc}</small>`
      : (i => i ? `<b style="color:${G.RARITY[i.rarity].color}">${i.name}</b><small>　耐久 ${it.dur}</small>` : '?')(A.itemOf(it.id));
    const list = !M ? '<p class="note">讀取中…</p>' : M.list.length ? M.list.map(l => `<div class="stat"><span>${desc(l.kind, l.item)}<small>　${esc(l.seller)}</small></span><span><b>${l.price} 金</b>
      ${l.mine ? `<button class="mini warn" data-mk-cancel="${l.id}">下架</button>` : `<button class="mini hot" data-mk-buy="${l.id}" ${P.gold < l.price ? 'disabled' : ''}>買</button>`}</span></div>`).join('') : '<p class="note">市集上還沒有東西。</p>';
    A.gearOf();
    const mine = [...Object.entries(G.MATERIALS).filter(([k]) => (P.mats[k] || 0) > 0).map(([k, n]) => `<button class="mini" data-mk-sell="mat:${k}">${n}（有 ${P.mats[k]}）</button>`),
      ...P.stash.map((it, i) => { const info = A.itemOf(it.id); return info ? `<button class="mini" data-mk-sell="item:${i}">${info.name}</button>` : ''; }),
      ...(P.docs || []).map((k, i) => G.DOCTRINES[k] ? `<button class="mini" data-mk-sell="doc:${i}">${G.DOCTRINES[k].name}</button>` : '')].join('');
    $('marketBox').innerHTML = `<div class="two"><div><h4>市集上的東西</h4>${list}</div><div><h4>上架</h4>
      <p class="note">先填價格（材料再填數量），再點要賣的東西。上架時東西就交給市集；賣出後收到價格扣 ${Math.round((M ? M.tax : 0.05) * 100)}% 稅的金幣，沒賣出可以下架拿回來。</p>
      <div class="row"><input id="mkPrice" type="number" min="1" placeholder="價格（金）" style="width:110px"><input id="mkN" type="number" min="1" value="1" placeholder="數量" style="width:70px"></div>
      <div class="row wrap">${mine || '<p class="note">沒有可以賣的東西。</p>'}</div></div></div>`;
  }

  return {
    refreshSocial, refresh: () => { if (panel) render(); },
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
