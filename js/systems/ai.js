/* ============ ai.js — 兵團與士兵行為 ============
 * 指令：follow（跟著武將）、hold（守在 cmdPoint）、attack（推進到 cmdPoint 並自動找下一群敵人）。
 * 電腦方（team 1，或守城方）由 think() 每 0.5 秒決定指令和技能。
 */
G.AI = (() => {
  const C = () => G.CONFIG;

  function updateSquad(sq, dt) {
    for (const k in sq.fx) if (sq.fx[k] > 0) sq.fx[k] -= dt;
    for (const k in sq.skillCd) if (sq.skillCd[k] > 0) sq.skillCd[k] -= dt;
    const alive = sq.alive;
    if (!alive.length) return;
    if (sq.prevCmd && !sq.rooted) { sq.cmd = sq.prevCmd; sq.prevCmd = null; }
    const leader = G.Game.heroOf(sq.team);

    // 迂迴：先走到繞後點
    if (sq.waypoint) {
      const c = sq.center;
      if (Math.hypot(c.x - sq.waypoint.x, c.y - sq.waypoint.y) < 30) sq.waypoint = null;
    }
    // 進攻中：目標附近沒敵人了就換下一群
    if (sq.cmd === 'attack' && !sq.waypoint) {
      const tgt = G.Game.nearestFoe(sq.team, sq.cmdPoint.x, sq.cmdPoint.y, C().squadAggro.attack);
      if (!tgt) {
        const next = G.Game.nearestFoe(sq.team, sq.center.x, sq.center.y, 99999);
        if (next) sq.cmdPoint = { x: next.x, y: next.y };
      }
    }

    let anchor, face;
    if (sq.waypoint) { anchor = sq.waypoint; const c = sq.center; face = Math.atan2(anchor.y - c.y, anchor.x - c.x); }
    else if (sq.cmd === 'follow' && leader && !leader.dead) {
      face = leader.face;
      const back = 34 + sq.followOffset * 1;
      anchor = { x: leader.x - Math.cos(face) * back + Math.cos(face + Math.PI / 2) * sq.followSide, y: leader.y - Math.sin(face) * back + Math.sin(face + Math.PI / 2) * sq.followSide };
    } else {
      anchor = sq.cmdPoint;
      const c = sq.center, foe = G.Game.nearestFoe(sq.team, c.x, c.y, 400);
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
      const slot = sq.slotWorld(slots[u.slot], anchor.x, anchor.y, sq.face);
      if (sq.rooted) { u.vx = u.vy = 0; u.moving = false; u.face = sq.face; meleeInPlace(u); continue; }

      // 找目標：離自己近、而且沒跑離陣地太遠的敵人
      let t = u.target && !u.target.dead && !u.target.gate ? u.target : null;
      // 沒有目標時每 0.2～0.35 秒才重找一次（人多時找目標是最花時間的地方）
      if (!t && engage && (u.seekT -= dt) <= 0) { u.seekT = G.U.rand(0.2, 0.35); t = G.Game.nearestFoe(u.team, u.x, u.y, engage + (u.def.ranged ? u.def.range * 0.5 : 0)); }
      if (t && Math.hypot(t.x - anchor.x, t.y - anchor.y) > engage + C().squadLeash) t = null;
      // 攻城：目標在牆的另一邊、城門還沒破 → 打城門
      const castle = G.Map.castle;
      if (castle && !G.Map.gatePassable() && !u.def.ranged && sq.team !== castle.defender) {
        const goal = t || sq.cmdPoint;
        if ((goal.y < castle.wallY) !== (u.y < castle.wallY)) t = G.Game.gateTarget(u);
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
    const sp = Math.min(u.def.speed * sq.speedMul(G.Game.time), d * 5);
    u.vx = dx / d * sp; u.vy = dy / d * sp; u.face = Math.atan2(dy, dx); u.moving = true;
  }

  function melee(u, t, sq) {
    const d = Math.hypot(t.x - u.x, t.y - u.y), reach = u.def.range + (t.radius || 6);
    // 騎兵衝鋒：高速撞上目標
    if (u.def.mounted && !t.gate && (u.chargeCd || 0) <= 0 && d < reach + 6) {
      const sp = Math.hypot(u.vx, u.vy);
      if (sp > u.def.speed * C().chargeSpeedRatio) { chargeHit(u, t, sq); return; }
    }
    if (d > reach) { move(u, t.x, t.y, sq, 0); return; }
    u.vx = u.vy = 0; u.moving = false; u.face = Math.atan2(t.y - u.y, t.x - u.x);
    if (u.cd <= 0) {
      u.cd = u.def.atkCd * G.U.rand(0.85, 1.15); u.play('Attack');
      if (t.gate) G.Game.hitGate(u, u.def.atk);
      else G.Combat.damage(u, t, u.def.atk * G.U.rand(0.8, 1.2), { knock: u.def.mounted ? 6 : 3 });
    }
  }

  /** 架槍、盾牆時原地攻擊正前方 */
  function meleeInPlace(u) {
    if (u.cd > 0) return;
    const t = G.Game.nearestFoe(u.team, u.x, u.y, u.def.range + 8);
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
      G.Combat.damage(t, u, C().braceReflect, { noCounter: true, stun: C().braceStun, knock: 10, big: true });
      u.vx *= -0.3; u.vy *= -0.3;
      G.FX.hit(u.x, u.y - 14, '#ffffff', 8);
      return;
    }
    let mul = C().chargeMul * (sq.fm.chargeMul || 1) * (sq.fx.charge > 0 ? G.UNIT_SKILLS.charge.chargeMul : 1);
    const a = Math.atan2(t.y - u.y, t.x - u.x);
    G.Game.forEachFoe(u.team, u.x + Math.cos(a) * 10, u.y + Math.sin(a) * 10, 16, o =>
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
    if (d > u.def.range) { move(u, t.x, t.y, sq, 0); return; }
    u.vx = u.vy = 0; u.moving = false; u.face = Math.atan2(t.y - u.y, t.x - u.x);
    if (u.cd <= 0) { u.cd = u.def.atkCd * G.U.rand(0.85, 1.2); u.play('Attack'); G.Combat.arrow(u, t); }
  }

  /* ---------- 電腦指揮 ---------- */
  function think(sq) {
    if (!sq.alive.length) return;
    const c = sq.center, castle = G.Map.castle;
    // 友軍在附近開打時一起支援
    const alert = G.Game.squadsOf(sq.team).some(o => o !== sq && o.cmd === 'attack' && o.alive.length && G.U.dist(o.center, c) < 600);
    const foe = G.Game.nearestFoe(sq.team, c.x, c.y, alert ? 700 : C().enemyAggro);
    const defending = castle && castle.defender === sq.team;
    if (defending && sq.def.ranged) { sq.cmd = 'hold'; sq.cmdPoint = sq.home; }
    else if (defending && !G.Map.gatePassable()) {
      sq.cmd = 'hold'; sq.cmdPoint = sq.home;
    } else if (foe) { sq.cmd = 'attack'; if (!sq.waypoint) sq.cmdPoint = { x: foe.x, y: foe.y }; }
    else if (castle && !defending) {
      // 攻城方：沒遇到敵人就往主堡推進（城門沒破時會先去打城門）
      sq.cmd = 'attack'; sq.cmdPoint = { x: castle.capture.x, y: castle.capture.y };
    } else { sq.cmd = 'hold'; sq.cmdPoint = sq.home; }

    // 技能
    const near = (types, r) => G.Game.squadsOf(1 - sq.team).some(o => o.alive.length && types.includes(o.def.type) && G.U.dist(o.center, c) < r);
    const [s1, s2] = sq.def.skills;
    const tryUse = k => G.Skills.canUnit(sq, k) && G.Skills.useUnit(sq, k);
    switch (sq.def.type) {
      case 'pike':   if (near(['cav'], 170)) tryUse(s1); else if (near(['pike', 'shield', 'archer', 'cav'], 40)) tryUse(s2); break;
      case 'shield': if (near(['archer'], 230)) tryUse(s1); else if (near(['pike', 'shield', 'cav'], 30)) tryUse(s2); break;
      case 'archer': if (foe && G.U.dist(foe, c) < sq.def.range) { if (!tryUse(s2)) tryUse(s1); } break;
      case 'cav':    if (foe && G.U.dist(foe, c) < 320) { if (Math.random() < 0.3) tryUse(s2); else tryUse(s1); } break;
    }
  }

  return { updateSquad, think };
})();
