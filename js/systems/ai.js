/* ============ ai.js — 兵團與士兵行為 ============
 * 指令：follow（跟著武將）、hold（守在 cmdPoint）、attack（推進到 cmdPoint 並自動找下一群敵人）。
 * 電腦方（team 1，或守城方）由 think() 每 0.5 秒決定指令和技能。
 * 操作攻城器械的兵團（sq.crew，見 js/systems/siege.js）不打仗，圍在器械旁邊跟著走。
 * 玩家的配置兵團（sq.field）也由 think() 指揮：order 'defend' 守在配置點、敵人靠近才接戰；'attack' 跟電腦攻方一樣推進。
 */
G.AI = (() => {
  const C = () => G.CONFIG;

  /** 士氣 0～100：陣亡、武將倒下會掉（combat.js），擊殺會加；沒有敵人在附近時回得快。低於 20 潰散 6 秒，之後重整到 45 */
  /** 通知用的名字：不帶「隨身・」「配置・」 */
  const shortName = sq => (sq.label || sq.def.name).replace(/^(隨身|配置)・/, '');
  function morale(sq, dt) {
    if (sq.morale === undefined) sq.morale = 100;
    const c = sq.center, near = G.Battle.nearestFoe(sq.team, c.x, c.y, 220);
    if (sq.rout > 0) { if ((sq.rout -= dt) <= 0) { sq.rout = 0; sq.morale = 45; G.Battle.notifyTeam(sq.team, `${shortName(sq)} 重整完畢`); } return; }
    sq.morale = Math.min(100, sq.morale + (near ? 0.5 : 3) * dt);
    if (sq.morale < 20 && !sq.crew) {
      sq.rout = 6; sq.morale = 20;
      G.Battle.notifyTeam(sq.team, `${shortName(sq)} 潰散了！`); G.Battle.notifyTeam(1 - sq.team, `敵方${sq.def.name}潰散！`);
    }
  }
  /** 潰散：每個人往遠離最近敵軍的方向跑 */
  function routMove(sq, alive) {
    const foe = G.Battle.nearestFoeSquad(sq), c = sq.center;
    const a = foe ? Math.atan2(c.y - foe.center.y, c.x - foe.center.x) : sq.face + Math.PI;
    for (const u of alive) {
      if (u.stun > 0) continue;
      const r = G.Map.route(u, u.x + Math.cos(a) * 60, u.y + Math.sin(a) * 60), dx = r.x - u.x, dy = r.y - u.y, d = Math.hypot(dx, dy) || 1;
      const sp = u.def.speed * 0.95 * G.Map.terrainSpeed(u);
      u.vx = dx / d * sp; u.vy = dy / d * sp; u.moving = true; u.face = Math.atan2(dy, dx); u.target = null;
    }
  }

  function updateSquad(sq, dt) {
    for (const k in sq.fx) if (sq.fx[k] > 0) sq.fx[k] -= dt;
    for (const k in sq.skillCd) if (sq.skillCd[k] > 0) sq.skillCd[k] -= dt;
    const alive = sq.alive;
    if (!alive.length) return;
    if (sq.crew) return crewUpdate(sq, alive, dt);
    if (sq.prevCmd && !sq.rooted) { sq.cmd = sq.prevCmd; sq.prevCmd = null; }
    const leader = sq.leader || G.Battle.heroOf(sq.team);   // 隨身兵團跟著自己的武將（同場戰鬥有好幾個武將）

    // 迂迴：先走到繞後點
    if (sq.waypoint) {
      const c = sq.center;
      if (Math.hypot(c.x - sq.waypoint.x, c.y - sq.waypoint.y) < 30) sq.waypoint = null;
    }
    // 進攻中：目標附近沒敵人了就換下一群
    // 滑鼠點地面進攻（sq.goTo）：先走到點的地方（路上照樣打附近的敵人），到了才換下一群
    if (sq.goTo && (sq.cmd !== 'attack' || Math.hypot(sq.center.x - sq.cmdPoint.x, sq.center.y - sq.cmdPoint.y) < 40)) sq.goTo = false;
    if (sq.cmd === 'attack' && !sq.waypoint && !sq.goTo) {
      const tgt = G.Battle.nearestFoe(sq.team, sq.cmdPoint.x, sq.cmdPoint.y, C().squadAggro.attack);
      if (!tgt) {
        const next = G.Battle.nearestFoe(sq.team, sq.center.x, sq.center.y, 99999);
        if (next) sq.cmdPoint = { x: next.x, y: next.y };
      }
    }

    // 士氣：太低就潰散（往遠離敵人的方向逃、不打仗），逃一陣子後重整
    morale(sq, dt);
    if (sq.rout > 0) return routMove(sq, alive);

    let anchor, face;
    if (sq.waypoint) { anchor = sq.waypoint; const c = sq.center; face = Math.atan2(anchor.y - c.y, anchor.x - c.x); }
    else if (sq.cmd === 'follow' && leader && !leader.dead) {
      face = leader.face;
      const back = 34 + sq.followOffset * 1;
      anchor = { x: leader.x - Math.cos(face) * back + Math.cos(face + Math.PI / 2) * sq.followSide, y: leader.y - Math.sin(face) * back + Math.sin(face + Math.PI / 2) * sq.followSide };
    } else {
      anchor = sq.cmdPoint;
      const c = sq.center, foe = G.Battle.nearestFoe(sq.team, c.x, c.y, 400);
      face = sq.rooted ? sq.face : foe ? Math.atan2(foe.y - c.y, foe.x - c.x) : sq.face;
      if (sq.cmd === 'attack' && Math.hypot(anchor.x - c.x, anchor.y - c.y) > 40) face = Math.atan2(anchor.y - c.y, anchor.x - c.x);
    }
    if (!sq.rooted) sq.face = face;
    // 依存活人數重排陣型：有人陣亡時後排會往前補位
    const slots = sq.slots(alive.length);
    const engage = sq.waypoint ? 0 : C().squadAggro[sq.cmd] || 100;

    alive.forEach((u, i) => u.slot = i);
    for (const u of sq.units) {
      if (u.dead) continue;
      u.cd -= dt; if (u.chargeCd > 0) u.chargeCd -= dt;
      if (u.stun > 0) { u.stun -= dt; u.vx = u.vy = 0; u.moving = false; continue; }
      const sw = sq.slotWorld(slots[u.slot], anchor.x, anchor.y, sq.face), slot = G.Map.sameSide(sw.x, sw.y, anchor.x, anchor.y);
      if (sq.rooted) { u.vx = u.vy = 0; u.moving = false; u.face = sq.face; meleeInPlace(u); continue; }

      // 找目標：離自己近、而且沒跑離陣地太遠的敵人
      let t = u.target && !u.target.dead && !u.target.gate && !(u.target.engine && u.target.state === 'up') ? u.target : null;
      // 沒有目標時每 0.2～0.35 秒才重找一次（人多時找目標是最花時間的地方）
      if (!t && engage && (u.seekT -= dt) <= 0) { u.seekT = G.U.rand(0.2, 0.35); t = G.Battle.nearestFoe(u.team, u.x, u.y, engage + (u.def.ranged ? sq.range * 0.5 : 0)); }
      if (t && Math.hypot(t.x - anchor.x, t.y - anchor.y) > engage + C().squadLeash) t = null;
      const castle = G.Map.castle;
      if (castle) {
        // 攻城器械：守方遠程三分之二的人優先集火，其他人附近沒敵人時才打
        if (u.def.ranged && sq.team === castle.defender && u.slot % 3 !== 2) { if (!t || !t.engine) t = G.Siege.nearestFoeEngine(u.team, u.x, u.y, sq.range) || t; }
        else if (!t && engage) t = G.Siege.nearestFoeEngine(u.team, u.x, u.y, engage);
      }
      // 攻城：目標在牆的另一邊、牆上沒有任何入口 → 打城門
      if (castle && !G.Map.anyPassable() && !u.def.ranged && sq.team !== castle.defender) {
        const goal = t || sq.cmdPoint;
        if ((goal.y < castle.wallY) !== (u.y < castle.wallY)) t = G.Battle.gateTarget(u);
      }
      u.target = t;

      if (t && u.def.ranged) shoot(u, t, sq, dt);
      else if (t) melee(u, t, sq);
      else move(u, slot.x, slot.y, sq, 2);
      if (!u.moving && !t) u.face = sq.face;
    }
  }

  function move(u, tx, ty, sq, stop) {
    const r = G.Map.route(u, tx, ty), dx = r.x - u.x, dy = r.y - u.y, d = Math.hypot(dx, dy);
    if (d <= stop) { u.vx = u.vy = 0; u.moving = false; return; }
    const sp = Math.min(u.def.speed * sq.speedMul(G.Battle.time) * (G.Map.castle ? G.Map.climbMul(u) : 1) * G.Map.terrainSpeed(u), d * 5);
    u.vx = dx / d * sp; u.vy = dy / d * sp; u.face = Math.atan2(dy, dx); u.moving = true;
  }

  function melee(u, t, sq) {
    const d = Math.hypot(t.x - u.x, t.y - u.y), reach = u.def.range + (t.radius || 6);
    // 騎兵衝鋒：高速撞上目標
    if (u.def.mounted && !t.gate && !t.engine && (u.chargeCd || 0) <= 0 && d < reach + 6) {
      const sp = Math.hypot(u.vx, u.vy);
      if (sp > u.def.speed * C().chargeSpeedRatio) { chargeHit(u, t, sq); return; }
    }
    if (d > reach) { move(u, t.x, t.y, sq, 0); return; }
    u.vx = u.vy = 0; u.moving = false; u.face = Math.atan2(t.y - u.y, t.x - u.x);
    if (u.cd <= 0) {
      u.cd = u.def.atkCd * G.U.rand(0.85, 1.15); u.play('Attack');
      if (t.gate) G.Battle.hitGate(u, u.def.atk * G.SIEGE.meleeGateMul);
      else G.Combat.damage(u, t, u.def.atk * G.U.rand(0.8, 1.2), { knock: u.def.mounted ? 6 : 3 });
    }
  }

  /** 操作器械：兩排站在器械左右、往後排，跟著器械走；不找敵人 */
  function crewUpdate(sq, alive, dt) {
    const e = sq.crew, c = Math.cos(e.face), s = Math.sin(e.face);
    sq.face = e.face;
    alive.forEach((u, i) => {
      u.cd -= dt; u.target = null;
      if (u.stun > 0) { u.stun -= dt; u.vx = u.vy = 0; u.moving = false; return; }
      const lx = (i % 2 ? 1 : -1) * (e.radius + 5), back = -e.radius + 4 + (i >> 1) * 9;   // lx：往右多少；back：往後多少
      move(u, e.x - s * lx - c * back, e.y + c * lx - s * back, sq, 1.5);
      if (!u.moving) u.face = e.face;
    });
  }

  /** 架槍、盾牆時原地攻擊正前方 */
  function meleeInPlace(u) {
    if (u.cd > 0) return;
    const t = G.Battle.nearestFoe(u.team, u.x, u.y, u.def.range + 8);
    if (t && G.U.angDiff(Math.atan2(t.y - u.y, t.x - u.x), u.face) < 1.2) {
      u.cd = u.def.atkCd; u.play('Attack');
      G.Combat.damage(u, t, u.def.atk * G.U.rand(0.8, 1.2), { knock: 4 });
    }
  }

  function chargeHit(u, t, sq) {
    u.chargeCd = 3;
    const braced = t.squad && t.squad.fx.brace > 0 && G.Combat.isFront(u, t);
    if (braced) {
      // 撞上長槍陣：衝鋒無效、反傷、暈眩
      const reflect = C().braceReflect * t.squad.mod('reflectMul', 1) * sq.mod('braceTakenMul', 1);   // 老兵：倒刺、馬鎧
      G.Combat.damage(t, u, reflect, { noCounter: true, stun: C().braceStun, knock: 10, big: true });
      u.vx *= -0.3; u.vy *= -0.3;
      G.FX.hit(u.x, u.y - 14, '#ffffff', 8);
      return;
    }
    const mul = C().chargeMul * (sq.fm.chargeMul || 1) * sq.mod('chargeMul', 1) * (sq.fx.charge > 0 ? G.UNIT_SKILLS.charge.chargeMul : 1);
    const a = Math.atan2(t.y - u.y, t.x - u.x);
    G.Battle.forEachFoe(u.team, u.x + Math.cos(a) * 10, u.y + Math.sin(a) * 10, 16, o =>
      G.Combat.damage(u, o, u.def.atk * mul, { knock: C().chargeKnockback, launch: 50, big: true }));
    G.FX.dust(u.x, u.y, 6); G.FX.addShake(1.5);
    u.vx *= 0.4; u.vy *= 0.4; u.play('Attack');
  }

  function shoot(u, t, sq, dt) {
    const d = Math.hypot(t.x - u.x, t.y - u.y);
    // 敵人貼太近：往後拉開（駐守時不退）
    if (d < u.def.ranged.minRange && sq.cmd !== 'hold') {
      const a = Math.atan2(u.y - t.y, u.x - t.x);
      move(u, u.x + Math.cos(a) * 40, u.y + Math.sin(a) * 40, sq, 0);
      return;
    }
    if (d > sq.range) { move(u, t.x, t.y, sq, 0); return; }
    u.vx = u.vy = 0; u.moving = false; u.face = Math.atan2(t.y - u.y, t.x - u.x);
    if (u.cd <= 0) { u.cd = u.def.atkCd * G.U.rand(0.85, 1.2); u.play('Attack'); G.Combat.arrow(u, t); }
  }

  /* ---------- 電腦指揮 ---------- */
  function think(sq) {
    if (!sq.alive.length || sq.crew) return;   // 操作器械中：交給 G.Siege
    const c = sq.center, castle = G.Map.castle;
    // 友軍在附近開打時一起支援
    const alert = G.Battle.squadsOf(sq.team).some(o => o !== sq && o.cmd === 'attack' && o.alive.length && G.U.dist(o.center, c) < 600);
    const foe = G.Battle.nearestFoe(sq.team, c.x, c.y, alert ? 700 : C().enemyAggro);
    const defending = castle && castle.defender === sq.team, fieldDefend = sq.field && sq.order === 'defend';
    // 攻城方的步兵：牆上還沒有入口時，附近有沒人操作的器械就去推（衝車撞最近的城門或城牆段，雲梯搭在離自己最近的牆上）
    if (castle && !defending && !fieldDefend && !sq.def.ranged && !sq.def.mounted && !G.Map.anyPassable()) {
      const e = G.Siege.freeEngine(sq.team, c.x, c.y, 500);
      if (e && G.Siege.assign(sq, e, c.x)) return;
    }
    // 守方近戰：敵方搭好雲梯就去梯頂堵人
    const ladder = defending && !sq.def.ranged && G.Siege.ladderThreat(sq.team, c, 900);
    if (defending && sq.def.ranged) { sq.cmd = 'hold'; sq.cmdPoint = sq.home; }
    else if (ladder) { sq.cmd = 'hold'; sq.cmdPoint = { x: ladder.x, y: castle.wallY - castle.thick / 2 - 14 }; }
    else if (defending && !G.Map.anyPassable()) {
      sq.cmd = 'hold'; sq.cmdPoint = sq.home;
    } else if (fieldDefend) {
      // 配置兵團防守：只打配置點附近的敵人，沒有就回去站好
      const near = G.Battle.nearestFoe(sq.team, sq.home.x, sq.home.y, C().enemyAggro);
      if (near) { sq.cmd = 'attack'; sq.cmdPoint = { x: near.x, y: near.y }; } else { sq.cmd = 'hold'; sq.cmdPoint = sq.home; }
    } else if (sq.goTo) sq.cmd = 'attack';   // 玩家點了地面：照玩家的點走
    else if (foe) { sq.cmd = 'attack'; if (!sq.waypoint) sq.cmdPoint = { x: foe.x, y: foe.y }; }
    else if (castle && !defending && castle.capture) {
      // 攻城方：沒遇到敵人就往目前要搶的據點推進（沒有入口時會先去打城門）
      sq.cmd = 'attack'; sq.cmdPoint = { x: castle.capture.x, y: castle.capture.y };
    } else if (sq.army || sq.field) {
      // 大軍測試的兵團：附近沒敵人就往全場最近的敵人推進，不回原位駐守
      const f = G.Battle.nearestFoe(sq.team, c.x, c.y, 99999);
      sq.cmd = 'attack'; if (f) sq.cmdPoint = { x: f.x, y: f.y };
    } else { sq.cmd = 'hold'; sq.cmdPoint = sq.home; }

    // 技能
    const near = (types, r) => G.Battle.squadsOf(1 - sq.team).some(o => o.alive.length && types.includes(o.def.type) && G.U.dist(o.center, c) < r);
    const [s1, s2] = sq.def.skills;
    const tryUse = k => G.Skills.canUnit(sq, k) && G.Skills.useUnit(sq, k);
    // 依技能決定什麼時候放（新兵種沿用同一套技能，不用一個兵種寫一次）
    const melee = ['pike', 'shield', 'shock', 'archer', 'cav'];
    const when = {
      brace: () => near(['cav'], 170), shieldwall: () => near(['archer'], 230),
      thrust: () => near(melee, 40), shieldbash: () => near(melee, 30), cleave: () => near(melee, 36), frenzy: () => near(melee, 80),
      volley: () => foe && G.U.dist(foe, c) < sq.range, firearrow: () => foe && G.U.dist(foe, c) < sq.range,
      charge: () => foe && G.U.dist(foe, c) < 320, flank: () => foe && G.U.dist(foe, c) < 320 && Math.random() < 0.3,
    };
    for (const k of sq.def.ranged ? [s2, s1] : [s1, s2]) if (when[k] && when[k]() && tryUse(k)) break;
  }

  return { updateSquad, think };
})();
