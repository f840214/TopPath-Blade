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
   * att 打 def，基礎傷害 base。o：{ ranged, charge, knock, launch, stun, down（擊倒秒數）, dtype（傷害類型，預設看攻擊方）, color, noCounter, fire }
   * 回傳實際傷害。
   */
  function damage(att, def, base, o = {}) {
    if (!def || def.dead) return 0;
    if (def.engine) return G.Siege.damage(att, def, base, o);   // 攻城器械
    if (def.isHero && def.iframes > 0) { G.FX.number(def.x, def.y, '閃', '#cfe8ff'); return 0; }   // 翻滾中無敵
    let dmg = base;
    if (!att.isHero && !def.isHero && !o.noCounter) dmg *= G.counterMul(att.type, def.type);
    if (!o.fire) dmg *= sideMul(att, def);
    if (att.squad) dmg *= att.squad.atkMul(G.Battle.time) * att.squad.skillMod('vsMul', def.type, 1) * (att.squad.morale < 50 ? 0.85 : 1);   // 士氣低打得沒力   // 老兵：對特定兵種加傷
    // 地形：躲在樹林裡的吃遠程傷害少；站在高地上射下來的傷害高
    if (o.ranged) {
      const tDef = G.Map.terrainAt(def.x, def.y), tAtt = G.Map.terrainAt(att.x, att.y);
      if (tDef === 'forest') dmg *= 0.6;
      if (tAtt === 'hill' && tDef !== 'hill') dmg *= 1.2;
      if (def.squad) dmg *= def.squad.fm.rangedTakenMul || 1;
      if (def.def && def.def.frontRangedMul && isFront(att, def))
        dmg *= (def.squad.fx.shieldwall > 0 ? G.UNIT_SKILLS.shieldwall.frontRangedMul : def.def.frontRangedMul) * def.squad.mod('frontRangedMul', 1);
    } else if (def.squad && def.squad.fx.shieldwall > 0 && isFront(att, def)) dmg *= G.UNIT_SKILLS.shieldwall.meleeTakenMul;
    // 武將自己的強化（鬼神）、舉盾減傷
    if (att.isHero && att.buff && att.buff.until > G.Battle.time) dmg *= att.buff.atkMul;
    if (def.isHero && def.guard > 0) dmg *= def.guardS.takenMul;
    // 散開：遠程打不太到、近戰比較難頂；固守：正面的近戰少吃一點
    if (def.squad && def.squad.spread) dmg *= o.ranged ? 0.65 : 1.1;
    if (def.squad && def.squad.fx.stand > 0 && !o.ranged && isFront(att, def)) dmg *= 0.85;
    // 傷害類型 × 護甲等級，破甲無視一部分護甲（counters.js）
    const dt = G.DAMAGE_TYPES[o.dtype || (att.isHero ? att.weapon.dtype : att.def && G.dtypeOf(att.def))] || G.DAMAGE_TYPES.slash;
    dmg *= dt[G.armorClass(def.armor || 0, def.isHero)];
    if (dt === G.DAMAGE_TYPES.bullet) dmg *= G.weatherOf().bulletMul;   // 雨天火藥受潮
    const pen = Math.max(dt.pen || 0, (att.def && att.def.pen) || 0);
    dmg *= C().armorK / (C().armorK + (def.armor || 0) * (1 - pen));
    let kn = o.knock, stun = o.stun;
    // 武將格擋：正面來的傷害、擊退大減，擋一下耗耐力；耐力耗光破防暈眩
    if (def.isHero && def.blocking && G.U.angDiff(Math.atan2(att.y - def.y, att.x - def.x), def.face) < G.BLOCK.arc / 2) {
      const B = G.BLOCK;
      def.stamina -= Math.max(B.minCost, dmg * B.staminaPerDmg); def.restT = G.SPRINT.delay;
      dmg *= B.takenMul; kn = kn && kn * B.knockMul; stun = 0; o = { ...o, launch: 0 };
      G.FX.hit(def.x + Math.cos(def.face) * 8, def.y - 14 + Math.sin(def.face) * 8, '#d8e8ff', 6);
      if (def.stamina <= 0) { def.stamina = 0; def.tired = true; def.blocking = false; def.blockBroken = 0.6; stun = B.breakStun; G.FX.number(def.x, def.y, '破防', '#ff9a6a'); }
    }
    // 騎馬的武將被擊倒、挑飛、暈、或被長槍類近戰刺中（25%）：落馬（倒地 1 秒）
    if (def.isHero && def.horse && !o.ranged && (o.down || o.launch || (stun || 0) >= 0.8 || (att.def && att.def.type === 'pike' && Math.random() < 0.25))) {
      def.horse = false; o = { ...o, down: Math.max(o.down || 0, 1) }; G.FX.number(def.x, def.y, '落馬', '#ffb06a'); G.FX.dust(def.x, def.y, 6);
    }
    // 固守：擊退大減
    if (kn && def.squad && def.squad.fx.stand > 0) kn *= 0.3;
    def.hp -= dmg; def.flash = 0.12;
    if (kn) knock(def, att.x, att.y, kn);
    if (o.launch) { def.vz = o.launch; def.z = Math.max(def.z, 0.1); }
    if (stun) def.stun = Math.max(def.stun, stun);
    if (o.down && !(def.isHero && def.blocking)) { def.down = Math.max(def.down || 0, o.down); def.downDir = Math.cos(Math.atan2(def.y - att.y, def.x - att.x)) < 0 ? -1 : 1; def.stun = Math.max(def.stun, o.down); }   // 擊倒：倒在地上（畫成躺平）、起來前不能動
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
    // 士氣：自己兵團有人倒下會掉（小兵團掉得多），擊殺的兵團加一點；武將倒下全軍士氣大跌、敵軍士氣上升
    if (u.squad) u.squad.morale = (u.squad.morale ?? 100) - 140 / u.squad.def.count;
    if (by && by.squad) by.squad.morale = Math.min(100, (by.squad.morale ?? 100) + 1);
    if (u.isHero) {
      for (const s of G.Battle.squadsOf(u.team)) s.morale = (s.morale ?? 100) - 25;
      for (const s of G.Battle.squadsOf(1 - u.team)) s.morale = Math.min(100, (s.morale ?? 100) + 8);
      G.Battle.notify(null, `${u.name || '武將'} 倒下了！`);
      // 擊殺提示（右上角）＋短暫慢動作（瀏覽器單人戰鬥才有慢動作，同場戰鬥只有提示）
      const who = by ? by.name || (by.squad ? by.squad.def.name : by.engine ? G.SIEGE[by.kind].name : '') : '';
      G.FX.feed(`${who ? who + ' 擊殺 ' : ''}${u.name || '武將'}`, 1, u.team);
      G.FX.slowMo(0.8, 0.35);
    } else if (u.squad && !u.squad.units.some(o => o !== u && !o.dead)) G.FX.feed(`${u.squad.label ? u.squad.label.replace(/^(隨身|配置)・/, '') : u.squad.def.name} 全滅`, 0, u.team);   // 整支兵團被打光
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
    const R = o.ranged || att.def.ranged, d = Math.hypot(tx - sx, ty - sy), speed = R.speed;   // o.ranged：武將射擊時給（武將沒有 def）
    // flat：子彈、弩箭幾乎直線飛；splash：炸彈落地爆炸
    projectiles.push({ att, target: o.area ? null : target, sx, sy, tx, ty, t: 0, dur: d / speed, arc: R.flat ? 3 : Math.min(60, d * 0.25), area: o.area, base: o.base ?? (att.def ? att.def.atk : att.atk), fire: o.fire, knock: o.knock || 0, splash: R.splash, kind: R.splash ? 'bomb' : R.flat ? 'bolt' : 'arrow' });
  }

  function updateProjectiles(dt, units) {
    for (const p of projectiles) {
      p.t += dt;
      if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
      if (p.t >= p.dur) {
        p.done = true;
        if (p.fire && !G.weatherOf().fire) G.FX.dust(p.tx, p.ty, 3);   // 雨天：火箭落地就熄了
        else if (p.fire) {
          zones.push({ x: p.tx, y: p.ty, r: p.fire.radius, t: 0, dur: p.fire.dur, dps: p.fire.dps, team: p.att.team, att: p.att });
          G.FX.embers(p.tx, p.ty, 16, 20);
        } else if (p.splash) {
          G.Battle.forEachFoe(p.att.team, p.tx, p.ty, p.splash, o => damage(p.att, o, p.base, { ranged: true, knock: 8, dtype: 'blunt' }));   // 炸彈、砲彈：鈍擊
          G.FX.embers(p.tx, p.ty, 8, 10); G.FX.dust(p.tx, p.ty, 4); G.FX.ring(p.tx, p.ty, p.splash, 'rgba(255,170,80,0.8)', 0.3);
        } else if (p.area) {
          const hit = G.Battle.nearestFoe(p.att.team, p.tx, p.ty, 10);
          if (hit && p.base) damage(p.att, hit, p.base, { ranged: true });
          else if (p.kind === 'arrow') G.FX.stuck(p.tx, p.ty, Math.atan2(p.ty - p.sy, p.tx - p.sx));   // 落空：插在地上
        } else if (p.target && !p.target.dead && Math.hypot(p.target.x - p.tx, p.target.y - p.ty) < 12) {
          damage(p.att, p.target, p.base, { ranged: true, knock: p.knock });
        } else if (p.kind === 'arrow') G.FX.stuck(p.tx, p.ty, Math.atan2(p.ty - p.sy, p.tx - p.sx));
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
      if (p.kind === 'bomb') { ctx.fillStyle = '#222'; ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 4, 4); ctx.fillStyle = '#ffb347'; ctx.fillRect(Math.round(x + 1), Math.round(y - 3), 1, 1); continue; }
      ctx.strokeStyle = p.fire ? '#ff8a2a' : p.kind === 'bolt' ? '#e8d8a0' : '#3b2a1a';
      ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 5, y - Math.sin(a) * 5); ctx.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3); ctx.stroke();
    }
  }

  /** 同場戰鬥：瀏覽器不跑模擬，直接用伺服器送來的投射物、燃燒區來畫；advance 讓箭在兩次狀態之間繼續飛 */
  function mirror(p, z) { projectiles = p; zones = z; }
  function advance(dt) { for (const p of projectiles) p.t += dt; for (const z of zones) z.t += dt; }
  return { stats, reset, damage, knock, kill, arrow, isFront, updateProjectiles, drawGround, drawAir, mirror, advance,
    get projectiles() { return projectiles; }, get zones() { return zones; } };
})();
