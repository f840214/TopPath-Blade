/* ============ remote.js — 同場戰鬥的瀏覽器端：照伺服器送來的狀態畫戰場、把按鍵送回去 ============
 * 模擬在伺服器跑（server/src/battle-host.js），這裡不算傷害、不判勝負，只負責：
 *   - b.start：建地圖（城牆、地面），切到 G.Game 的遠端模式
 *   - b.s（每 50ms）：更新畫面用的單位、武將、兵團、投射物、器械、城門與據點；播放特效；自己的選取、後備、提示
 *   - 每 50ms 把按著的鍵、剛按下的鍵送給伺服器
 *   - b.end：顯示結算（伺服器已經結算好）
 * 畫面物件用 G.Unit / G.Hero 的 prototype 建出來（只有畫圖要的欄位），位置在兩次狀態之間平滑移動。
 */
G.Remote = (() => {
  const units = new Map(), heroes = new Map(), squads = new Map();
  let me = null, info = null, time = 0, kills = [0, 0], lastSend = 0, exitTo = null;
  const hits = new Set();
  // 戰鬥會用到的按鍵（移動、技能、指揮、補給、器械、城門）
  const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'Tab', 'KeyT', 'KeyH', 'KeyF', 'KeyZ', 'KeyX', 'KeyB', 'KeyG',
    'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];

  /** 伺服器說開戰了 */
  function start(m, onExit) {
    units.clear(); heroes.clear(); squads.clear(); hits.clear();
    info = { room: m.room, team: m.team, id: m.me, scenario: m.scenario };
    me = { id: m.me, team: m.team, group: 'escort', select: 'all', reserve: [], supplyOpen: false, supplyCd: 0, hero: null };
    time = 0; kills = [0, 0]; exitTo = onExit || null;
    G.Game.startRemote(m.scenario, m.team);
  }

  /* ---------- 收狀態 ---------- */
  const ANIM = ['Idle', 'Walk', 'Attack'];
  function onState(m) {
    if (!info) return;
    time = m.tm; kills = m.K;
    // 兵團
    const seenS = new Set();
    for (const [nid, team, type, label, ownerId, ai, field, order, alive, morale, rout] of m.S) {
      let s = squads.get(nid);
      if (!s) {
        s = Object.create(G.Squad.prototype);
        Object.assign(s, { nid, team, typeKey: type, def: G.UNITS[type], units: [], formation: G.UNITS[type].formations[0], mods: {}, cmdPoint: { x: 0, y: 0 }, skillCd: {}, fx: {}, cmd: 'follow' });
        squads.set(nid, s);
      }
      Object.assign(s, { label, ownerId, ai: !!ai, field: !!field, order, aliveN: alive, morale, rout, units: [] });
      seenS.add(nid);
    }
    for (const k of squads.keys()) if (!seenS.has(k)) squads.delete(k);
    // 士兵
    const seenU = new Set();
    for (const [nid, sq, x, y, z, face, code, dead, flash] of m.U) {
      let u = units.get(nid);
      const s = squads.get(sq);
      if (!s) continue;
      if (!u) { u = Object.create(G.Unit.prototype); Object.assign(u, { nid, squad: s, team: s.team, def: s.def, radius: s.def.radius, x, y, animT: Math.random(), anim: 'Idle' }); units.set(nid, u); }
      const anim = ANIM[code];
      if (anim !== (u.moving ? 'Walk' : u.anim)) u.animT = 0;
      Object.assign(u, { tx: x, ty: y, z, face, moving: code === 1, anim: code === 2 ? 'Attack' : 'Idle', dead, flash: flash ? 0.1 : 0 });
      s.units.push(u);
      seenU.add(nid);
    }
    for (const k of units.keys()) if (!seenU.has(k)) units.delete(k);
    // 武將
    const seenH = new Set();
    for (const [nid, team, x, y, z, face, anim, hp, maxHp, dead, respawnT, cmdrId, weapon, look, name, flash] of m.H) {
      let h = heroes.get(nid);
      if (!h) {
        h = Object.create(G.Hero.prototype);
        Object.assign(h, { nid, team, isHero: true, weaponKey: weapon, weapon: G.WEAPONS[weapon], x, y, radius: G.HERO_BASE.radius, animT: 0, skillCd: { Q: 0, E: 0, R: 0 }, whirl: 0, action: null });
        heroes.set(nid, h);
      }
      const prev = h.whirl > 0 ? 'Whirl' : h.action ? h.action.anim : h.moving ? 'Walk' : 'Idle';
      if (prev !== anim) h.animT = 0;
      Object.assign(h, { tx: x, ty: y, z, face, hp, maxHp, dead, flash: flash ? 0.1 : 0, cmdrId, look: look || null, name,
        respawnT: respawnT >= 0 ? respawnT : undefined, moving: anim === 'Walk', whirl: anim === 'Whirl' ? 1 : 0, action: anim === 'Idle' || anim === 'Walk' || anim === 'Whirl' ? null : { anim } });
      if (cmdrId === me.id) me.hero = h;
      seenH.add(nid);
    }
    for (const k of heroes.keys()) if (!seenH.has(k)) heroes.delete(k);
    // 投射物、燃燒區、器械、落石
    G.Combat.mirror(m.P.map(([sx, sy, tx, ty, t, dur, arc, kind, fire]) => ({ sx, sy, tx, ty, t, dur, arc, kind, fire })), m.Z.map(([x, y, r, t, dur]) => ({ x, y, r, t, dur })));
    G.Siege.mirror(m.E.map(([kind, team, x, y, state, hp, maxHp, dead, swing, crew, radius]) => ({ kind, team, x, y, state, hp, maxHp, dead, swing, crew, radius })),
      m.HZ.map(([kind, x, y, t, warn, r, sx, sy]) => ({ kind, x, y, t, warn, r, sx, sy })));
    // 城門、城牆、雲梯、據點
    const c = G.Map.castle;
    if (c && m.C) {
      for (const [i, [kind, x, w, hp, maxHp, open, up, flash]] of m.C.o.entries()) {
        let o = c.openings[i];
        if (!o) { o = { kind, x, w }; c.openings.push(o); }   // 新搭上的雲梯
        Object.assign(o, { hp, maxHp, open: !!open, up: !!up, flash: flash ? 0.1 : 0 });
      }
      m.C.p.forEach(([progress, taken], i) => Object.assign(c.points[i], { progress, taken: !!taken }));
    }
    // 特效
    for (const [name, ...args] of m.F) if (G.FX[name]) G.FX[name](...args);
    // 自己的
    const e = m.me;
    me.select = e.sel; me.supplyOpen = !!e.so; me.supplyCd = e.cd; me.group = e.grp || 'escort';
    me.reserve = e.res; me.supply = e.sup.map(([x, y]) => ({ x, y })); me.near = e.near && { x: e.near[0], y: e.near[1] };
    for (const [nid, cmd, formation, crew, skillCd, fx, waypoint] of e.sq) {
      const s = squads.get(nid); if (!s) continue;
      Object.assign(s, { cmd, formation, crew: crew ? { kind: crew } : null, skillCd, fx, waypoint: !!waypoint, mine: true });
    }
    for (const text of e.msg) G.HUD.toast(text);
  }

  /** 每幀：位置往伺服器給的目標靠近、動畫時間往前走；每 50ms 送一次按鍵 */
  function update(dt) {
    const k = Math.min(1, dt * 15), I = G.Input, h = me.hero;
    // 自己的武將先照按鍵在本機移動（預測），再慢慢拉回伺服器的位置：延遲高時操作也不會慢半拍
    if (h && h.tx !== undefined && !h.dead && (!h.action || h.action.anim === 'Attack')) {
      const mx = (I.down('KeyD') ? 1 : 0) - (I.down('KeyA') ? 1 : 0), my = (I.down('KeyS') ? 1 : 0) - (I.down('KeyW') ? 1 : 0);
      if (mx || my) {
        const l = Math.hypot(mx, my), sp = G.HERO_BASE.speed * G.Map.terrainSpeed(h);
        h.x += mx / l * sp * dt; h.y += my / l * sp * dt; h.face = Math.atan2(my, mx); h.moving = true;
        G.Map.resolve(h);
      }
      const err = Math.hypot(h.tx - h.x, h.ty - h.y), pull = Math.min(1, dt * (mx || my ? 3 : 8));
      if (err > 80) { h.x = h.tx; h.y = h.ty; } else { h.x += (h.tx - h.x) * pull; h.y += (h.ty - h.y) * pull; }
      h.animT += dt; if (h.flash > 0) h.flash -= dt;
    }
    for (const u of [...units.values(), ...heroes.values()]) {
      if (u.tx === undefined || (u === h && !h.dead && (!h.action || h.action.anim === 'Attack'))) continue;
      u.x += (u.tx - u.x) * k; u.y += (u.ty - u.y) * k;
      if (Math.hypot(u.tx - u.x, u.ty - u.y) > 200) { u.x = u.tx; u.y = u.ty; }
      u.animT += dt; if (u.flash > 0) u.flash -= dt;
    }
    G.Combat.advance(dt);
    for (const key of KEYS) if (I.pressed(key)) hits.add(key);
    const now = performance.now();
    if (now - lastSend >= 50) {
      lastSend = now;
      G.Net.send({ t: 'b.in', held: KEYS.filter(key => I.down(key)), hit: [...hits], orders: G.Input.orders() });
      hits.clear();
    }
  }

  /** 給 G.Game.draw 的資料（格式同單人戰鬥的 view()） */
  function view() {
    const sq = [...squads.values()];
    const mine = sq.filter(s => s.mine && s.ownerId === me.id && !s.ai);
    return { units: [...units.values(), ...heroes.values()], squads: sq, time, me, mine, supply: me.supply || [], near: me.near, stats: { kills, combo: 0 } };
  }
  function leave() { G.Net.send({ t: 'b.leave' }); }
  function end(m) { const f = exitTo; exitTo = null; info = null; G.Game.remoteEnd(m, f); }

  return { start, onState, update, view, leave, end, get active() { return !!info; } };
})();
