/* ============ game.js — 戰場：場景、主迴圈、武將操作、物理、繪製 ============ */
G.Game = (() => {
  const W = () => G.CONFIG.world;
  let cv, ctx, state = 'menu', loadout = null;
  let heroes = [], squads = [], timers = [], grid = new Map();
  let player = null, select = 'all', cam = { x: 0, y: 0 }, zoom = 1;
  let thinkT = 0, result = null, scenario = null, showPerf = false, fps = 0, frameMs = 0;
  let demo = false;   // 開場畫面背景：兩軍自動交戰，沒有玩家操作
  const api = { time: 0 };

  /* ---------- 場景 ---------- */
  const SCENARIOS = {
    field: {
      name: '野戰', desc: '平原遭遇戰，擊敗敵方武將與所有兵團。', seed: 7,
      player: { x: 520, y: 820, face: 0 },
      enemyHero: { weapon: 'glaive', x: 2050, y: 800 },
      enemies: [
        { type: 'pikeman', x: 1700, y: 700 }, { type: 'shieldman', x: 1700, y: 900 },
        { type: 'archer', x: 1900, y: 800 }, { type: 'cavalry', x: 1950, y: 520 },
      ],
      timeLimit: 0,
    },
    siege: {
      name: '攻城戰', desc: '打破城門，攻入城內佔領主堡（站在據點內、周圍沒有守軍）。', seed: 11,
      castle: { wallY: 640, gateX: 1280, gateHp: 1400, towers: [420, 2140], captureX: 1280, captureY: 300, defender: 1 },
      player: { x: 1280, y: 1400, face: -Math.PI / 2 },
      enemyHero: { weapon: 'glaive', x: 1280, y: 360 },
      enemies: [
        { type: 'archer', x: 1050, y: 590 }, { type: 'archer', x: 1510, y: 590 },
        { type: 'shieldman', x: 1280, y: 560 }, { type: 'pikeman', x: 1280, y: 470 },
        { type: 'cavalry', x: 900, y: 300 },
      ],
      timeLimit: 480,
    },
    defend: {
      name: '守城・出城', desc: '守住主堡。按 G 開關城門，可以出城迎擊；據點被佔領或武將陣亡就失敗。', seed: 23,
      castle: { wallY: 640, gateX: 1280, gateHp: 1400, towers: [420, 2140], captureX: 1280, captureY: 300, defender: 0 },
      player: { x: 1280, y: 480, face: Math.PI / 2 },
      enemyHero: { weapon: 'sword', x: 1280, y: 1350 },
      enemies: [
        { type: 'shieldman', x: 1180, y: 1120 }, { type: 'pikeman', x: 1380, y: 1120 },
        { type: 'archer', x: 1100, y: 1260 }, { type: 'archer', x: 1460, y: 1260 },
        { type: 'cavalry', x: 1800, y: 1200 },
      ],
      timeLimit: 0,
    },
  };

  function start(lo, isDemo = false) {
    demo = isDemo; if (!demo) loadout = lo; scenario = SCENARIOS[lo.scenario];
    heroes = []; squads = []; timers = []; result = null; api.time = 0; thinkT = 0; select = 'all';
    G.FX.reset(); G.Combat.reset();
    G.Map.setupCastle(scenario.castle || null);
    const dirt = scenario.castle ? [{ x: 0, y: 0, w: W().w, h: scenario.castle.wallY }, { x: scenario.castle.gateX - 60, y: scenario.castle.wallY, w: 120, h: W().h }] : [];
    // 出生點附近不放樹和石頭
    const avoid = [scenario.player, scenario.enemyHero, ...scenario.enemies].filter(Boolean);
    G.Map.buildGround(scenario.seed + (demo ? Math.floor(Math.random() * 1000) : 0), dirt, avoid);

    const p = scenario.player;
    player = new G.Hero(0, lo.weapon, lo.equip, p.x, p.y); player.face = p.face;
    heroes.push(player);
    const bonus = { atk: player.stats.squadAtk, speed: player.stats.squadSpeed, armor: player.stats.squadArmor };
    lo.squads.forEach((type, i) => {
      const side = i % 2 === 0 ? -1 : 1, back = 60 + Math.floor(i / 2) * 110;   // 兩隊一排，多的往後排
      const sx = p.x - Math.cos(p.face) * back + Math.cos(p.face + Math.PI / 2) * 50 * side;
      const sy = p.y - Math.sin(p.face) * back + Math.sin(p.face + Math.PI / 2) * 50 * side;
      const sq = new G.Squad(0, type, sx, sy, p.face, { cmd: 'follow', bonus, label: `第${i + 1}隊・${G.UNITS[type].name}` });
      sq.followSide = 46 * side; sq.followOffset = 20;
      squads.push(sq);
    });
    const eh = scenario.enemyHero;
    if (eh) { const h = new G.Hero(1, eh.weapon, {}, eh.x, eh.y); h.face = Math.PI - (p.face || 0); heroes.push(h); }
    const enemies = demo ? [...scenario.enemies, ...scenario.enemies.slice(0, 2).map(e => ({ ...e, x: e.x + (p.x < e.x ? 140 : -140) }))] : scenario.enemies;
    for (const e of enemies) {
      const face = Math.atan2(p.y - e.y, p.x - e.x);
      squads.push(new G.Squad(1, e.type, e.x, e.y, face, { cmd: 'hold' }));
    }
    state = demo ? 'demo' : 'battle';
    G.HUD.show(!demo);
    if (demo) for (const s of squads) s.cmd = 'attack';
  }

  /* ---------- 查詢工具（給 AI、技能用） ---------- */
  function allUnits() { const a = []; for (const s of squads) for (const u of s.units) a.push(u); for (const h of heroes) a.push(h); return a; }
  function rebuildGrid() {
    grid = new Map();
    for (const u of allUnits()) if (!u.dead) { const k = (u.x >> 6) + ',' + (u.y >> 6); (grid.get(k) || grid.set(k, []).get(k)).push(u); }
  }
  function forNear(x, y, r, fn) {
    for (let gx = (x - r) >> 6; gx <= (x + r) >> 6; gx++) for (let gy = (y - r) >> 6; gy <= (y + r) >> 6; gy++) {
      const a = grid.get(gx + ',' + gy); if (a) for (const u of a) fn(u);
    }
  }
  function forEachFoe(team, x, y, r, fn) {
    forNear(x, y, r, u => { if (u.team !== team && !u.dead && Math.hypot(u.x - x, u.y - y) <= r + (u.radius || 6)) fn(u); });
  }
  function nearestFoe(team, x, y, r) {
    let best = null, bd = r * r;
    if (r > 600) { for (const u of allUnits()) if (u.team !== team && !u.dead) { const d = (u.x - x) ** 2 + (u.y - y) ** 2; if (d < bd) { bd = d; best = u; } } return best; }
    forNear(x, y, r, u => { if (u.team !== team && !u.dead) { const d = (u.x - x) ** 2 + (u.y - y) ** 2; if (d < bd) { bd = d; best = u; } } });
    return best;
  }
  function nearestFoeSquad(sq) {
    let best = null, bd = Infinity; const c = sq.center;
    for (const o of squads) if (o.team !== sq.team && o.alive.length) { const d = G.U.dist(o.center, c); if (d < bd) { bd = d; best = o; } }
    return best && { center: best.center, face: best.face };
  }
  const squadsOf = team => squads.filter(s => s.team === team);
  const heroOf = team => heroes.find(h => h.team === team);
  function later(sec, fn) { timers.push({ t: api.time + sec, fn }); }

  function gateTarget(u) {
    const c = G.Map.castle, g = c.gate, side = u.y < c.wallY ? -1 : 1;
    return { gate: true, x: g.x + G.U.clamp(u.x - g.x, -g.w / 2 + 6, g.w / 2 - 6), y: c.wallY + side * (c.thick / 2 + 3), radius: 4, team: c.defender };
  }
  function hitGate(att, dmg) {
    const g = G.Map.castle.gate;
    if (g.hp <= 0) return;
    g.hp -= dmg; g.flash = 0.1;
    G.FX.hit(G.U.clamp(att.x, g.x - g.w / 2, g.x + g.w / 2), G.Map.castle.wallY, '#c8a070', 3);
    if (g.hp <= 0) {
      g.hp = 0; G.FX.addShake(8); G.HUD.toast('城門已被攻破！');
      for (let i = 0; i < 6; i++) G.FX.dust(g.x + G.U.rand(-25, 25), G.Map.castle.wallY + G.U.rand(-10, 10), 6);
    }
  }

  /* ---------- 輸入 ---------- */
  function handleInput() {
    const I = G.Input;
    if (I.pressed('Tab')) select = select === 'all' ? 0 : select === 0 ? 1 : 'all';
    const mine = squadsOf(0), sel = select === 'all' ? mine : [mine[select]].filter(Boolean);
    const cmd = I.pressed('Digit1') ? 'follow' : I.pressed('Digit2') ? 'hold' : I.pressed('Digit3') ? 'attack' : null;
    if (cmd) for (const sq of sel) {
      sq.cmd = cmd; sq.waypoint = null;
      if (cmd === 'hold') sq.cmdPoint = { x: player.x, y: player.y };
      if (cmd === 'attack') { const f = nearestFoe(0, player.x, player.y, 99999); sq.cmdPoint = f ? { x: f.x, y: f.y } : { x: player.x, y: player.y }; }
    }
    if (I.pressed('KeyF')) for (const sq of sel) sq.cycleFormation();
    if (I.pressed('KeyZ')) for (const sq of sel) G.Skills.useUnit(sq, sq.def.skills[0]);
    if (I.pressed('KeyX')) for (const sq of sel) G.Skills.useUnit(sq, sq.def.skills[1]);
    if (I.pressed('KeyG') && G.Map.castle && G.Map.castle.defender === 0) {
      const g = G.Map.castle.gate;
      if (g.hp > 0 && Math.hypot(player.x - g.x, player.y - G.Map.castle.wallY) < 160) { g.open = !g.open; G.HUD.toast(g.open ? '城門開啟' : '城門關閉'); }
      else if (g.hp > 0) G.HUD.toast('要靠近城門才能開關');
    }
    if (I.pressed('Equal')) stepZoom(1);
    if (I.pressed('Minus')) stepZoom(-1);
    if (I.pressed('F3')) showPerf = !showPerf;
    if (I.pressed('KeyV')) { G.FX.S.shake = !G.FX.S.shake; G.HUD.toast(G.FX.S.shake ? '畫面震動：開' : '畫面震動：關'); }
  }
  function stepZoom(d) { const L = G.CONFIG.zoomLevels; zoom = L[G.U.clamp(L.indexOf(zoom) + d, 0, L.length - 1)]; }

  /* ---------- 武將 ---------- */
  function updateHero(h, dt) {
    h.animT += dt; if (h.flash > 0) h.flash -= dt; if (h.cd > 0) h.cd -= dt;
    for (const k in h.skillCd) if (h.skillCd[k] > 0) h.skillCd[k] -= dt;
    if (h.action) { h.action.until -= dt; if (h.action.until <= 0) h.action = null; }
    if (h.dead) return;
    if (h.stun > 0) { h.stun -= dt; h.vx = h.vy = 0; h.moving = false; return; }
    G.Skills.updateHero(h, dt);
    if (h.dash) return;
    let mx = 0, my = 0, attack = false;
    if (h === player && !demo) {
      const I = G.Input;
      mx = (I.down('KeyD') ? 1 : 0) - (I.down('KeyA') ? 1 : 0);
      my = (I.down('KeyS') ? 1 : 0) - (I.down('KeyW') ? 1 : 0);
      h.blocking = I.down('KeyK') && !h.action && h.whirl <= 0;
      attack = I.down('KeyJ');
      for (const [code, slot] of [['KeyQ', 'Q'], ['KeyE', 'E'], ['KeyR', 'R']]) if (I.pressed(code)) G.Skills.useHero(h, slot);
    } else ({ mx, my, attack } = enemyHeroBrain(h));
    const slow = h.blocking ? G.CONFIG.heroBlockSpeedMul : h.action ? 0.35 : 1;
    if (mx || my) {
      const l = Math.hypot(mx, my); h.vx = mx / l * h.speed * slow; h.vy = my / l * h.speed * slow; h.moving = true;
      if (!h.blocking && !h.action) h.face = Math.atan2(my, mx);
    } else { h.vx = h.vy = 0; h.moving = false; }
    if (attack && h.cd <= 0 && !h.blocking && h.whirl <= 0) heroAttack(h);
  }

  function heroAttack(h) {
    const w = h.weapon;
    h.cd = w.atkCd; h.doAction('Attack', 0.2);
    G.FX.slash(h.x, h.y - 12, h.face, w.range - 8, w.arc, { life: 0.18, width: 4 });
    forEachFoe(h.team, h.x, h.y, w.range, o => {
      if (G.U.angDiff(Math.atan2(o.y - h.y, o.x - h.x), h.face) < w.arc / 2 + 0.2) G.Combat.damage(h, o, h.atk * G.U.rand(0.9, 1.1), { knock: 7 });
    });
    const c = G.Map.castle;
    if (c && c.defender !== h.team && !G.Map.gatePassable() && Math.abs(h.x - c.gate.x) < c.gate.w / 2 + w.range && Math.abs(h.y - c.wallY) < c.thick / 2 + w.range) hitGate(h, h.atk);
  }

  /** 敵方武將：找最近的目標接近、攻擊，偶爾放技能 */
  function enemyHeroBrain(h) {
    const t = nearestFoe(h.team, h.x, h.y, 360);
    const home = h.team === 1 ? scenario.enemyHero : scenario.player;
    let tx = home.x, ty = home.y;
    if (t) { tx = t.x; ty = t.y; }
    const d = Math.hypot(tx - h.x, ty - h.y);
    if (t) {
      h.face = Math.atan2(ty - h.y, tx - h.x);
      if (d < 60) for (const slot of ['Q', 'E', 'R']) if (h.skillCd[slot] <= 0 && Math.random() < 0.01) G.Skills.useHero(h, slot);
    }
    const reach = h.weapon.range - 6;
    const r = G.Map.route(h, tx, ty);
    return { mx: d > reach ? r.x - h.x : 0, my: d > reach ? r.y - h.y : 0, attack: t && d < h.weapon.range };
  }

  /* ---------- 物理 ---------- */
  function physics(dt) {
    const all = allUnits();
    for (const u of all) {
      if (u.dead) { u.dead += dt; }
      u.x += (u.vx + u.kx) * dt; u.y += (u.vy + u.ky) * dt;
      const k = Math.exp(-7 * dt); u.kx *= k; u.ky *= k;
      if (u.z > 0 || u.vz > 0) {
        u.vz -= 420 * dt; u.z += u.vz * dt;
        if (u.z <= 0) { if (u.vz < -120) G.FX.dust(u.x, u.y, 3); u.z = 0; u.vz = 0; }
      }
      if (u.flash > 0) u.flash -= dt;
      if (u.animT !== undefined) u.animT += dt;
      if (!u.isHero && u.anim === 'Attack' && u.animT > (G.Sprites.duration(u.def.sprite, 'Attack') || 0.3)) u.play('Idle');
    }
    // 互相推開
    for (const u of all) {
      if (u.dead || u.z > 4) continue;
      forNear(u.x, u.y, 20, o => {
        if (o === u || o.dead) return;
        const dx = u.x - o.x, dy = u.y - o.y, d = Math.hypot(dx, dy) || 0.01, min = (u.radius || 6) + (o.radius || 6);
        if (d < min) {
          const push = (min - d) / d * 0.5 * (u.isHero ? 0.25 : o.isHero ? 1.2 : 1);
          u.x += dx * push; u.y += dy * push;
        }
      });
    }
    for (const u of all) {
      u.x = G.U.clamp(u.x, 8, W().w - 8); u.y = G.U.clamp(u.y, 8, W().h - 8);
      if (!u.dead) G.Map.resolve(u);
    }
    for (const s of squads) s.units = s.units.filter(u => !u.dead || u.dead < 1.2);
  }

  /* ---------- 勝負 ---------- */
  function checkResult(dt) {
    if (result) return;
    const castle = G.Map.castle;
    if (player.dead) return end(false, '武將陣亡');
    if (castle) {
      const cp = castle.capture, att = 1 - castle.defender;
      let a = 0, d = 0;
      for (const u of allUnits()) if (!u.dead && Math.hypot(u.x - cp.x, (u.y - cp.y) / 0.6) < cp.r) u.team === att ? a++ : d++;
      if (a && !d) cp.progress = Math.min(1, cp.progress + dt / 10);
      else if (d && !a) cp.progress = Math.max(0, cp.progress - dt / 10);
      if (cp.progress >= 1) return end(att === 0, att === 0 ? '主堡已佔領！' : '主堡失守');
    }
    const foes = allUnits().filter(u => u.team === 1 && !u.dead).length;
    if (!foes) return end(true, '敵軍全滅！');
    if (scenario.timeLimit && api.time > scenario.timeLimit) return end(castle ? castle.defender === 0 : false, '時間到');
  }
  function end(win, msg) {
    result = { win, msg };
    if (demo) setTimeout(() => { if (state === 'demo') startDemo(); }, 2500);   // 開場對戰打完就換一場
    else G.HUD.result(win, msg, G.Combat.stats);
  }
  /** 開場畫面背景用的自動對戰 */
  function startDemo() {
    start({ scenario: Math.random() < 0.5 ? 'field' : 'siege', weapon: Math.random() < 0.5 ? 'sword' : 'glaive', equip: {}, squads: ['shieldman', 'pikeman', 'archer', 'cavalry'] }, true);
  }

  /* ---------- 主迴圈 ---------- */
  function update(dt) {
    if (G.FX.update(dt)) return;     // 命中停頓
    api.time += dt;
    for (const t of timers) if (api.time >= t.t) { t.fn(); t.done = true; }
    timers = timers.filter(t => !t.done);
    rebuildGrid();
    if (!result && !demo) handleInput();
    for (const h of heroes) updateHero(h, dt);
    if ((thinkT -= dt) <= 0) { thinkT = 0.5; for (const s of squads) if (s.team === 1 || demo) G.AI.think(s); }
    for (const s of squads) G.AI.updateSquad(s, dt);
    G.Combat.updateProjectiles(dt, allUnits());
    physics(dt);
    const c = G.Map.castle; if (c && c.gate.flash > 0) c.gate.flash -= dt;
    checkResult(dt);
  }

  function draw() {
    const vw = cv.width / zoom, vh = cv.height / zoom;
    let fx = player.x, fy = player.y;
    if (demo) {   // 開場：鏡頭慢慢跟著交戰中心
      const f = nearestFoe(0, player.x, player.y, 99999); if (f) { fx = (player.x + f.x) / 2; fy = (player.y + f.y) / 2; }
      fx = cam.x + vw / 2 + (fx - cam.x - vw / 2) * 0.02; fy = cam.y + vh / 2 + (fy - cam.y - vh / 2) * 0.02;
    }
    cam.x = G.U.clamp(fx - vw / 2, 0, Math.max(0, W().w - vw));
    cam.y = G.U.clamp(fy - vh / 2, 0, Math.max(0, W().h - vh));
    const sh = G.FX.shakeOffset();
    ctx.setTransform(zoom, 0, 0, zoom, Math.round((-cam.x + sh.x) * zoom), Math.round((-cam.y + sh.y) * zoom));
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1b1f17'; ctx.fillRect(cam.x - 20, cam.y - 20, vw + 40, vh + 40);
    G.Map.drawGround(ctx);
    G.Combat.drawGround(ctx);
    G.Map.drawCapture(ctx, api.time);
    // 依 y 排序繪製
    const list = [];
    for (const u of allUnits()) if (u.x > cam.x - 60 && u.x < cam.x + vw + 60 && u.y > cam.y - 60 && u.y < cam.y + vh + 80) list.push({ y: u.y, draw: c => u.draw(c) });
    list.push(...G.Map.wallDrawables({ x: cam.x, y: cam.y, w: vw, h: vh }));
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw(ctx);
    G.Combat.drawAir(ctx);
    G.FX.drawWorld(ctx);
    drawBanners();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    G.FX.drawScreen(ctx, cv.width, cv.height);
    if (!demo) G.HUD.update({ player, squads: squadsOf(0), select, time: api.time, scenario, castle: G.Map.castle, stats: G.Combat.stats, foes: allUnits().filter(u => u.team === 1 && !u.dead).length, perf: showPerf && { fps, frameMs, units: allUnits().length }, zoom });
  }

  /** 兵團旗標：藍色我方、紅色敵方，顯示人數；選中的兵團有金框 */
  function drawBanners() {
    ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    squads.forEach(s => {
      const a = s.alive.length; if (!a) return;
      const c = s.center, x = Math.round(c.x), y = Math.round(c.y - 44);
      const mine = s.team === 0, selected = mine && (select === 'all' || squadsOf(0)[select] === s);
      ctx.fillStyle = mine ? '#2f5fb0' : '#a8322a';
      ctx.fillRect(x - 13, y - 6, 26, 12);
      if (selected) { ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 1; ctx.strokeRect(x - 13.5, y - 6.5, 27, 13); }
      ctx.fillStyle = '#fff'; ctx.fillText(a, x + 3, y + 0.5);
      ctx.fillStyle = mine ? '#9cc3ff' : '#ffb3a8';
      ctx.fillText({ pike: '槍', shield: '盾', archer: '弓', cav: '騎' }[s.def.type], x - 7, y + 0.5);
    });
  }

  let last = 0, acc = 0, frames = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (state === 'battle' || state === 'demo') {
      const t0 = performance.now();
      if (!result) update(dt); else G.FX.update(dt);
      if (!demo && result && G.Input.pressed('KeyR')) start(loadout);
      if (!demo && G.Input.pressed('Escape')) { G.HUD.show(false); startDemo(); G.Menu.open(); }
      draw();
      frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;
      frames++; acc += dt; if (acc >= 0.5) { fps = frames / acc; frames = 0; acc = 0; }
    }
    G.Input.endFrame();
    requestAnimationFrame(loop);
  }

  function init() {
    cv = document.getElementById('game'); ctx = cv.getContext('2d');
    const resize = () => { cv.width = innerWidth; cv.height = innerHeight; };
    addEventListener('resize', resize); resize();
    zoom = G.CONFIG.zoom;
    requestAnimationFrame(loop);
  }

  Object.assign(api, { SCENARIOS, init, start, startDemo, forEachFoe, nearestFoe, nearestFoeSquad, squadsOf, heroOf, later, gateTarget, hitGate });
  Object.defineProperty(api, 'state', { get: () => state });
  // 除錯用：在主控台看目前戰場
  Object.defineProperty(api, 'debug', { get: () => ({ heroes, squads, player, result }) });
  return api;
})();
