/* ============ combat.js — 傷害計算、擊退、投射物、燃燒區 ============ */
G.Combat = (() => {
  const C = () => G.CONFIG;
  let projectiles = [], zones = [];
  const stats = { kills: [0, 0], combo: 0, comboT: 0 };

  function reset() { projectiles = []; zones = []; stats.kills = [0, 0]; stats.combo = 0; stats.comboT = 0; }

  /** 攻擊從防守方的哪一面打進來：1 正面、flankMul 側面、rearMul 背後 */
  function sideMul(att, def) {
    if (def.isHero || def.face === undefined) return 1;
    const inc = Math.atan2(att.y - def.y, att.x - def.x), d = G.U.angDiff(inc, def.face);
    if (d < Math.PI / 3) return 1;
    if (d < Math.PI * 2 / 3) return C().flankMul * (def.squad ? def.squad.fm.flankTakenMul || 1 : 1);
    return C().rearMul;
  }
  const isFront = (att, def) => G.U.angDiff(Math.atan2(att.y - def.y, att.x - def.x), def.face) < Math.PI / 3;

  /**
   * att 打 def，基礎傷害 base。o：{ ranged, charge, knock, launch, stun, color, noCounter, fire }
   * 回傳實際傷害。
   */
  function damage(att, def, base, o = {}) {
    if (!def || def.dead) return 0;
    let dmg = base;
    if (!att.isHero && !def.isHero && !o.noCounter) dmg *= G.counterMul(att.type, def.type);
    if (!o.fire) dmg *= sideMul(att, def);
    if (att.squad) dmg *= att.squad.atkMul(G.Game.time);
    if (o.ranged) {
      if (def.squad) dmg *= def.squad.fm.rangedTakenMul || 1;
      if (def.def && def.def.frontRangedMul && isFront(att, def))
        dmg *= def.squad.fx.shieldwall > 0 ? G.UNIT_SKILLS.shieldwall.frontRangedMul : def.def.frontRangedMul;
    } else if (def.squad && def.squad.fx.shieldwall > 0 && isFront(att, def)) dmg *= G.UNIT_SKILLS.shieldwall.meleeTakenMul;
    if (def.isHero && def.blocking && G.U.angDiff(Math.atan2(att.y - def.y, att.x - def.x), def.face) < C().heroBlockArc) {
      dmg *= 1 - C().heroBlockReduction;
      G.FX.hit(def.x, def.y - 14, '#bfe3ff', 3);
    }
    dmg *= C().armorK / (C().armorK + (def.armor || 0));
    def.hp -= dmg; def.flash = 0.12;
    if (o.knock) knock(def, att.x, att.y, o.knock);
    if (o.launch) { def.vz = o.launch; def.z = Math.max(def.z, 0.1); }
    if (o.stun) def.stun = Math.max(def.stun, o.stun);
    G.FX.hit(def.x, def.y - 12, o.color || '#fff2b0', att.isHero ? 5 : 2);
    if (att.isHero || o.charge) G.FX.blood(def.x, def.y - 10, 3);
    if (att.isHero || o.big) G.FX.number(def.x, def.y, dmg, att.team === 0 ? '#ffe28a' : '#ff8a7a');
    if (att.isHero && att.team === 0) { stats.combo++; stats.comboT = 2.5; }
    if (def.hp <= 0) kill(def, att);
    return dmg;
  }

  function knock(u, fromX, fromY, power) {
    if (u.isHero) power *= 0.4;
    const a = Math.atan2(u.y - fromY, u.x - fromX);
    u.kx += Math.cos(a) * power * 6; u.ky += Math.sin(a) * power * 6;
  }

  function kill(u, by) {
    u.hp = 0; u.dead = 0.001;
    if (by) {
      stats.kills[by.team]++;
      if (by.squad) by.squad.kills = (by.squad.kills || 0) + 1;   // 兵團經驗（G.Army.settle）
      else if (by.isHero) by.kills = (by.kills || 0) + 1;
    }
    // 被打死時往後彈飛一點
    if (by && !u.isHero) { knock(u, by.x, by.y, 10); u.vz = Math.max(u.vz, 60); }
    G.FX.dust(u.x, u.y, 4);
  }

  /** 箭：target 是單位就追蹤；area 是落點（範圍箭） */
  function arrow(att, target, o = {}) {
    const sx = att.x, sy = att.y - 16, tx = o.area ? o.area.x : target.x, ty = o.area ? o.area.y : target.y;
    const d = Math.hypot(tx - sx, ty - sy), speed = att.def.ranged.speed;
    projectiles.push({ att, target: o.area ? null : target, sx, sy, tx, ty, t: 0, dur: d / speed, arc: Math.min(60, d * 0.25), area: o.area, base: o.base ?? att.def.atk, fire: o.fire });
  }

  function updateProjectiles(dt, units) {
    for (const p of projectiles) {
      p.t += dt;
      if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
      if (p.t >= p.dur) {
        p.done = true;
        if (p.fire) {
          zones.push({ x: p.tx, y: p.ty, r: p.fire.radius, t: 0, dur: p.fire.dur, dps: p.fire.dps, team: p.att.team, att: p.att });
          G.FX.embers(p.tx, p.ty, 16, 20);
        } else if (p.area) {
          const hit = G.Game.nearestFoe(p.att.team, p.tx, p.ty, 10);
          if (hit) damage(p.att, hit, p.base, { ranged: true });
        } else if (p.target && !p.target.dead && Math.hypot(p.target.x - p.tx, p.target.y - p.ty) < 12) {
          damage(p.att, p.target, p.base, { ranged: true });
        }
      }
    }
    projectiles = projectiles.filter(p => !p.done);
    for (const z of zones) {
      z.t += dt;
      if (Math.random() < dt * 8) G.FX.embers(z.x, z.y, 1, z.r * 0.7);
      for (const u of units) if (!u.dead && u.team !== z.team && Math.hypot(u.x - z.x, (u.y - z.y) / 0.6) < z.r) {
        u.hp -= z.dps * dt; u.flash = Math.max(u.flash, 0.05);
        if (u.hp <= 0) kill(u, z.att);
      }
    }
    zones = zones.filter(z => z.t < z.dur);
    if (stats.comboT > 0 && (stats.comboT -= dt) <= 0) stats.combo = 0;
  }

  function drawGround() {
    for (const z of zones) G.Render.zone(z.x, z.y, z.r, z.r * 0.6, 0xffa028, 0.45 * (1 - z.t / z.dur));
  }
  function drawAir(ctx) {
    ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1;
    for (const p of projectiles) {
      const k = Math.min(1, p.t / p.dur), x = p.sx + (p.tx - p.sx) * k, y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * p.arc;
      const k2 = Math.min(1, k + 0.04), x2 = p.sx + (p.tx - p.sx) * k2, y2 = p.sy + (p.ty - p.sy) * k2 - Math.sin(k2 * Math.PI) * p.arc;
      const a = Math.atan2(y2 - y, x2 - x);
      ctx.strokeStyle = p.fire ? '#ff8a2a' : '#3b2a1a';
      ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 5, y - Math.sin(a) * 5); ctx.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3); ctx.stroke();
    }
  }

  return { stats, reset, damage, knock, kill, arrow, isFront, updateProjectiles, drawGround, drawAir };
})();
