/* ============ net.js — 多人連線（瀏覽器端）：其他玩家、聊天、共用的城池歸屬 ============
 * 協定見 server/src/live.js。登入後 start()：先拿城池歸屬（GET /api/world），再連 WebSocket（斷線會自動重連）。
 * 場景：城內 'town:<城池 id>'、大地圖 'world'、戰鬥 'battle'（戰鬥中不送位置）。同場景的玩家才看得到彼此。
 * 其他玩家的位置每 100ms 收一次，畫的時候往目標位置平滑移動（lerp），看起來不會一格一格跳。
 * 聊天：左下角，按 / 開始打字，Enter 送出，Esc 取消。
 * 斷線重連：斷線後 1、2、4、8、10 秒…一直重試；網路恢復（online 事件）時馬上重連；
 *   30 秒沒收到任何訊息（伺服器每 100ms～20 秒一定會送東西）就當作假連線，主動斷開重連。重連後自動回到原本的場景。
 */
G.Net = (() => {
  const $ = id => document.getElementById(id);
  let ws = null, me = null, cities = {}, scene = 'none', sx = 0, sy = 0, retry = 0, lastPos = 0, last = '', stopped = true, heard = 0, timer = null;
  const peers = new Map();   // 連線 id → { name, look, flag, x, y, tx, ty, f, m, animT }
  const listeners = [];
  let request = null, party = null;   // 別人發來的對決／組隊邀請；自己的隊伍 { leader, members }
  let pendingExit = null, invite = null, raids = [], fights = [];   // 開戰後打完要回哪裡；別人邀請加入的戰鬥（30 秒內按 J）；正在打的城（{ room, city, owner, n }）

  async function start() {
    stopped = false;
    try { await refreshCities(); } catch (e) { console.warn('拿不到城池資料', e); }
    connect();
  }
  function stop() { stopped = true; if (ws) ws.close(); peers.clear(); }
  async function refreshCities() { const w = await G.Api.world(); me = w.me; setCities(w.cities); }
  function setCities(c) { cities = c || {}; for (const fn of listeners) fn(); }

  function connect() {
    if (stopped || (ws && ws.readyState <= 1)) return;
    clearTimeout(timer);
    heard = performance.now();
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => { retry = 0; status('已連線'); send({ t: 'scene', scene, x: sx, y: sy }); refreshCities().catch(() => {}); };
    ws.onmessage = e => { heard = performance.now(); let m; try { m = JSON.parse(e.data); } catch { return; } onMessage(m); };
    ws.onclose = e => {
      peers.clear(); party = null; request = null;   // 斷線後伺服器那邊的隊伍也沒了
      if (e.code === 4002) { stopped = true; status('已在別處登入'); G.HUD.toast('這個帳號在別的地方登入了，這裡已經離線'); return; }
      if (stopped || e.code === 4001) { status(e.code === 4001 ? '未登入' : '離線'); return; }
      status('重新連線中…');
      timer = setTimeout(connect, Math.min(10000, 1000 * 2 ** retry++));
    };
  }
  // 網路恢復：馬上重連；太久沒收到訊息：當作斷線
  addEventListener('online', () => { retry = 0; connect(); });
  setInterval(() => {
    if (!stopped && ws && ws.readyState === 1 && performance.now() - heard > 30000) { status('連線沒有回應，重新連線中…'); ws.close(); }
  }, 5000);
  const send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

  function onMessage(m) {
    if (m.t === 'peer') {
      const p = peers.get(m.id);
      if (p) Object.assign(p, { name: m.name, look: m.look, flag: m.flag });
      else peers.set(m.id, { name: m.name, look: m.look, flag: m.flag, x: m.x, y: m.y, tx: m.x, ty: m.y, f: Math.PI / 2, m: 0, animT: 0 });
    } else if (m.t === 'leave') peers.delete(m.id);
    else if (m.t === 'snap') for (const [id, x, y, f, mv] of m.p) { const p = peers.get(id); if (p) { p.tx = x; p.ty = y; p.f = f; p.m = mv; } }
    else if (m.t === 'chat') addChat(m.name, m.text);
    else if (m.t === 'cities') setCities(m.cities);
    else if (m.t === 'ping') send({ t: 'pong' });
    else if (m.t === 'raids') raids = m.list;   // 北境聯軍（server/src/world-sim.js）
    else if (m.t === 'food') {   // 伺服器算的糧食；斷糧時連名冊一起更新（有人餓死）
      const P = G.Army.profile(); P.food = m.food;
      if (m.roster) { P.roster = m.roster; G.HUD.toast('斷糧了！士兵一個個倒下，快回城買糧'); }
    }
    // 同場戰鬥（js/net/remote.js、server/src/battle-host.js）
    else if (m.t === 'b.s') G.Remote.onState(m);
    else if (m.t === 'b.start') { const f = pendingExit; pendingExit = null; G.Remote.start(m, f); }
    else if (m.t === 'b.end') G.Remote.end(m);
    else if (m.t === 'b.msg') G.HUD.toast(m.text);
    else if (m.t === 'b.err') { pendingExit = null; G.HUD.toast(m.text); }
    else if (m.t === 'b.rooms') fights = Array.isArray(m.list) ? m.list : [];
    // 對決、組隊的邀請：20 秒內按 Y 接受、N 拒絕（大地圖 world.js 處理按鍵）
    else if (m.t === 'b.duelReq') { request = { kind: 'duel', from: m.from, until: performance.now() + 20000 }; const s = `${m.name} 向你發起對決：Y 接受・N 拒絕`; G.HUD.toast(s); addChat('系統', s); }
    else if (m.t === 'b.duelNo') { pendingExit = null; G.HUD.toast(m.text); }
    else if (m.t === 'p.invite') { request = { kind: 'party', from: m.from, until: performance.now() + 20000 }; const s = `${m.name} 邀請你組隊：Y 接受・N 拒絕`; G.HUD.toast(s); addChat('系統', s); }
    else if (m.t === 'party') party = m.leader ? m : null;
    else if (m.t === 'b.invite') { invite = { room: m.room, side: m.side, until: performance.now() + 30000 }; G.HUD.toast(m.text); addChat('系統', m.text); }
  }

  /** 換場景（城內、大地圖、戰鬥）；x, y 是出現的位置 */
  function setScene(name, x = 0, y = 0) {
    if (name === scene) return;
    scene = name; sx = x; sy = y; peers.clear(); last = '';
    send({ t: 'scene', scene, x, y });
    $('chat').style.display = name.startsWith('town') || name === 'world' ? 'block' : 'none';
  }
  /** 自己的位置：最多每 100ms 送一次，沒變就每秒送一次 */
  function pos(x, y, f, moving) {
    const now = performance.now(), key = `${Math.round(x)},${Math.round(y)},${moving ? 1 : 0}`;
    if (now - lastPos < 100 || (key === last && now - lastPos < 1000)) return;
    lastPos = now; last = key;
    send({ t: 'pos', x, y, f, m: moving ? 1 : 0 });
  }

  /** 每幀：其他玩家往目標位置靠近 */
  function update(dt) {
    for (const p of peers.values()) {
      const k = Math.min(1, dt * 10);
      p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
      if (Math.hypot(p.tx - p.x, p.ty - p.y) > 400) { p.x = p.tx; p.y = p.ty; }   // 太遠（例如瞬移）直接跳過去
      p.animT += dt;
    }
  }
  /** 其他玩家的可繪製物件（跟建築、單位一起依 y 排序）；mounted：大地圖上騎馬 */
  function drawables(mounted) {
    return [...peers].map(([id, p]) => ({ y: p.y, draw: ctx => {
      const mount = p.look && p.look.replace(/^look_/, 'mount_');
      const sprite = mounted ? (G.SPRITE_META[mount] ? mount : G.WORLD.mount) : G.SPRITE_META[p.look] ? p.look : 'hero_sword';
      if (mounted) G.Hero.horseShadow(p.x, p.y, p.f); else G.Render.shadow(p.x, p.y, 9, 3.5, 0.3);
      G.Sprites.draw(sprite, p.m ? 'Walk' : 'Idle', p.f, p.m ? p.animT : 0, p.x, p.y, {});
      // 頭上：旗幟徽章＋名字（其他玩家用淡藍色，跟自己的金色分開）
      ctx.font = 'bold 7px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      const ny = Math.round(p.y - (mounted ? 62 : 42)), w = ctx.measureText(p.name).width, x0 = Math.round(p.x - (w + 9) / 2);
      ctx.drawImage(G.Heraldry.draw(p.flag || G.Heraldry.DEFAULT, 6, 8), x0, ny - 8);
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(p.name, x0 + 9.6, ny + 0.6);
      ctx.fillStyle = party && party.members.some(m => m.id === id) ? '#9fe6a0' : '#a9c8ff'; ctx.fillText(p.name, x0 + 9, ny);   // 隊友綠色
    } }));
  }

  /* ---------- 聊天 ---------- */
  function addChat(name, text) {
    const box = $('chatLog'), row = document.createElement('div');
    row.innerHTML = `<b></b><span></span>`;
    row.querySelector('b').textContent = name; row.querySelector('span').textContent = text;   // textContent：玩家打的字不能變成 HTML
    box.append(row);
    while (box.children.length > 30) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
  }
  function status(text) { $('chatStatus').textContent = text; }
  function focusChat() { $('chatIn').focus(); }
  function bind() {
    $('chatIn').addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) send({ t: 'chat', text: v }); e.target.value = ''; e.target.blur(); }
      if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); }
    });
  }
  const typing = () => document.activeElement === $('chatIn');

  return {
    send,
    /** 攻打城池（伺服器開房間跑戰鬥）；onExit(結果) 是打完或撤退後要做的事 */
    attackCity(city, onExit) { if (!ws || ws.readyState !== 1) return false; pendingExit = onExit; send({ t: 'b.attack', city }); return true; },
    /** 接受邀請（J）：加入別人正在打的戰鬥 */
    acceptInvite(onExit) {
      if (!invite || performance.now() > invite.until) { invite = null; return false; }
      pendingExit = onExit; send({ t: 'b.join', room: invite.room, side: invite.side }); invite = null; return true;
    },
    get raids() { return raids; },
    /** 這座城正在打仗嗎（大地圖標「交戰中」；到城門口按 Enter 就加入，攻城的訊息走 attackCity） */
    fightAt: city => fights.find(f => f.city === city) || null,
    /** 對決（F）：onExit 是打完回大地圖要做的事 */
    duel(id, onExit) { if (!ws || ws.readyState !== 1) return false; pendingExit = onExit; send({ t: 'b.duel', to: id }); return true; },
    inviteParty(id) { send({ t: 'p.invite', to: id }); },
    leaveParty() { send({ t: 'p.leave' }); },
    /** 回應別人的邀請（Y／N）；接受對決時 onExit 是打完回大地圖要做的事 */
    answer(ok, onExit) {
      const r = request; request = null;
      if (!r || performance.now() > r.until) return false;
      if (r.kind === 'duel') { if (ok) pendingExit = onExit; send({ t: 'b.duelAnswer', ok }); }
      else send({ t: 'p.answer', ok });
      return true;
    },
    get request() { return request && performance.now() < request.until ? request : null; },
    get party() { return party; },
    get invite() { return invite && performance.now() < invite.until ? invite : null; },
    start, stop, bind, setScene, pos, update, drawables, focusChat, typing, refreshCities,
    async saveCity(id, name, art) { setCities((await G.Api.saveCity(id, name, art)).cities); },
    onCities(fn) { listeners.push(fn); },
    get cities() { return cities; }, get me() { return me; }, get peers() { return peers; },
  };
})();
