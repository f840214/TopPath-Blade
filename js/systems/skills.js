/* ============ skills.js — 兵團技能與武將技能的效果 ============ */
G.Skills = (() => {
  const Dmg = (...a) => G.Combat.damage(...a);

  /* ---------- 兵團技能 ---------- */
  function canUnit(sq, key) { return sq.alive.length && (sq.skillCd[key] || 0) <= 0; }

  function useUnit(sq, key) {
    if (!canUnit(sq, key)) return false;
    const S = G.UNIT_SKILLS[key], foe = G.Game.nearestFoeSquad(sq);
    // 老兵技能樹：冷卻、持續、傷害、暈眩、輪數、範圍（G.VETERAN）
    const M = (k, d) => sq.skillMod(k, key, d), dur = S.dur + M('durAdd', 0), dmgMul = (S.dmgMul || 1) * M('dmgMul', 1);
    sq.skillCd[key] = S.cd * M('cdMul', 1);
    switch (key) {
      case 'brace':
      case 'shieldwall':
        sq.fx[key] = dur;
        if (foe) sq.face = Math.atan2(foe.center.y - sq.center.y, foe.center.x - sq.center.x);
        if (sq.cmd !== 'hold') sq.prevCmd = sq.cmd;   // 技能結束後恢復原本的指令
        sq.cmd = 'hold'; sq.cmdPoint = sq.center;
        for (const u of sq.alive) { u.face = sq.face; G.FX.dust(u.x, u.y, 1); }
        break;
      case 'thrust':
        for (const u of sq.alive) {
          u.play('Attack');
          G.Game.forEachFoe(u.team, u.x, u.y, S.reach + 8, o => {
            if (G.U.angDiff(Math.atan2(o.y - u.y, o.x - u.x), u.face) < 0.6) Dmg(u, o, u.def.atk * dmgMul, { knock: 6 });
          });
        }
        break;
      case 'shieldbash':
        for (const u of sq.alive) {
          u.play('Attack');
          G.Game.forEachFoe(u.team, u.x, u.y, 24, o => {
            if (G.U.angDiff(Math.atan2(o.y - u.y, o.x - u.x), u.face) < 0.8) Dmg(u, o, u.def.atk * dmgMul, { knock: S.knock, stun: S.stun + M('stunAdd', 0) });
          });
        }
        break;
      case 'volley':
      case 'firearrow': {
        const tgt = foe && G.U.dist(foe.center, sq.center) < sq.range * 1.4 ? foe.center : null;
        if (!tgt) { sq.skillCd[key] = 1; return false; }   // 範圍內沒有敵人，不扣冷卻
        if (key === 'volley') {
          for (let w = 0; w < S.waves + M('wavesAdd', 0); w++) G.Game.later(w * S.interval, () => {
            for (const u of sq.alive) {
              const a = Math.random() * Math.PI * 2, r = Math.random() * S.radius;
              G.Combat.arrow(u, null, { area: { x: tgt.x + Math.cos(a) * r, y: tgt.y + Math.sin(a) * r * 0.6 } });
              u.play('Attack');
            }
          });
        } else {
          const shooter = sq.alive[0], F = { radius: S.radius * M('radiusMul', 1), dur, dps: S.dps * dmgMul };
          G.Combat.arrow(shooter, null, { area: { ...tgt }, fire: F });
          for (const u of sq.alive.slice(1, 6)) G.Combat.arrow(u, null, { area: { x: tgt.x + G.U.rand(-20, 20), y: tgt.y + G.U.rand(-12, 12) }, fire: { ...F, radius: F.radius * 0.6 } });
        }
        break;
      }
      case 'charge':
        sq.fx.charge = dur; sq.cmd = 'attack';
        if (foe) sq.cmdPoint = foe.center;
        break;
      case 'flank': {
        if (!foe) { sq.skillCd[key] = 1; return false; }
        const fc = foe.center, f = foe.face, side = Math.random() < 0.5 ? 1 : -1;
        // 目標的側後方
        sq.waypoint = { x: fc.x - Math.cos(f) * S.dist * 0.7 + Math.cos(f + Math.PI / 2) * S.dist * side, y: fc.y - Math.sin(f) * S.dist * 0.7 + Math.sin(f + Math.PI / 2) * S.dist * side };
        sq.cmd = 'attack'; sq.cmdPoint = fc;
        break;
      }
    }
    return true;
  }

  /* ---------- 武將技能 ---------- */
  function useHero(h, slot) {
    const key = h.skillKey(slot), S = G.HERO_SKILLS[key];
    if (!S || h.skillCd[slot] > 0 || h.dead || h.stun > 0) return false;
    h.skillCd[slot] = S.cd * (1 - h.cdr);
    const f = h.face, fire = true, base = h.atk * (S.dmgMul || 1);
    // 只有大招（R）跳特寫，Q / E 太常用，每次都跳會打斷操作
    if (h.team === 0 && slot === 'R') G.FX.showCutin(S.name, 'assets/portraits/hero.png');
    switch (key) {
      case 'spin':
        h.doAction(S.anim);
        G.FX.slash(h.x, h.y - 12, f, S.radius - 6, Math.PI * 2, { fire, life: 0.4, width: 6, spin: 14 });
        G.FX.ring(h.x, h.y, S.radius * 1.4, 'rgba(255,150,60,0.9)');
        G.Game.forEachFoe(h.team, h.x, h.y, S.radius, o => Dmg(h, o, base, { knock: 14, launch: 70, color: '#ffb347' }));
        G.FX.addShake(4); G.FX.addHitStop(0.05);
        break;
      case 'dash':
        h.doAction('Attack');
        h.dash = { vx: Math.cos(f) * S.dist / 0.18, vy: Math.sin(f) * S.dist / 0.18, t: 0.18, hit: new Set(), S, base };
        G.FX.slash(h.x + Math.cos(f) * S.dist / 2, h.y - 12 + Math.sin(f) * S.dist / 2, f + Math.PI / 2, 16, Math.PI, { fire, life: 0.3, width: 5 });
        break;
      case 'warcry':
        h.doAction(S.anim, 0.6);
        for (const sq of G.Game.squadsOf(h.team)) sq.buff = { atkMul: S.atkMul, speedMul: S.speedMul, until: G.Game.time + S.dur };
        G.FX.ring(h.x, h.y, 140, 'rgba(255,215,120,0.9)', 0.6);
        G.FX.embers(h.x, h.y - 10, 24, 18);
        G.FX.addShake(3);
        break;
      case 'sweep':
        h.doAction(S.anim);
        G.FX.slash(h.x, h.y - 12, f, S.radius - 4, S.arc, { fire, life: 0.35, width: 7 });
        G.Game.forEachFoe(h.team, h.x, h.y, S.radius, o => {
          if (G.U.angDiff(Math.atan2(o.y - h.y, o.x - h.x), f) < S.arc / 2) Dmg(h, o, base, { knock: S.knock, launch: 50, color: '#ffb347' });
        });
        G.FX.addShake(4); G.FX.addHitStop(0.05);
        break;
      case 'launch': {
        h.doAction(S.anim);
        const cx = Math.cos(f), cy = Math.sin(f);
        for (let d = 10; d <= S.dist; d += 14) G.FX.embers(h.x + cx * d, h.y + cy * d, 3, 6);
        G.Game.forEachFoe(h.team, h.x + cx * S.dist / 2, h.y + cy * S.dist / 2, S.dist / 2 + S.width, o => {
          const along = (o.x - h.x) * cx + (o.y - h.y) * cy, across = Math.abs(-(o.x - h.x) * cy + (o.y - h.y) * cx);
          if (along > 0 && along < S.dist && across < S.width) Dmg(h, o, base, { launch: 160, stun: S.stun, knock: 4, color: '#ffb347' });
        });
        G.FX.addShake(3);
        break;
      }
      case 'whirl':
        h.whirl = S.dur; h.whirlTick = 0;
        break;
    }
    return true;
  }

  /** 每幀：突進、旋風這類持續型武將技能 */
  function updateHero(h, dt) {
    if (h.dash) {
      const d = h.dash;
      h.x += d.vx * dt; h.y += d.vy * dt; d.t -= dt;
      G.FX.embers(h.x, h.y - 6, 2, 4);
      G.Game.forEachFoe(h.team, h.x, h.y, d.S.width, o => { if (!d.hit.has(o)) { d.hit.add(o); Dmg(h, o, d.base, { knock: 12, launch: 40, color: '#ffb347' }); } });
      if (d.t <= 0) h.dash = null;
    }
    if (h.whirl > 0) {
      const S = G.HERO_SKILLS.whirl;
      h.whirl -= dt; h.whirlTick -= dt;
      if (h.whirlTick <= 0) {
        h.whirlTick = S.tick;
        G.FX.slash(h.x, h.y - 12, Math.random() * 6, S.radius - 6, Math.PI * 1.6, { fire: true, life: 0.25, width: 5, spin: 18 });
        G.Game.forEachFoe(h.team, h.x, h.y, S.radius, o => Dmg(h, o, h.atk * S.dmgMul, { knock: 8, color: '#ffb347' }));
        G.FX.addShake(1.5);
      }
    }
  }

  return { useUnit, canUnit, useHero, updateHero };
})();
