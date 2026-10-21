/* ============ hero.js — 武將 ============
 * 數值 = 基礎（G.HERO_BASE）+ 武器 + 裝備。技能效果在 js/systems/skills.js。
 */
G.Hero = class {
  constructor(team, weaponKey, equip, x, y) {
    this.team = team; this.isHero = true;
    this.weaponKey = weaponKey; this.weapon = G.WEAPONS[weaponKey];
    const st = { hp: 0, armor: 0, atk: 0, cdr: 0, squadAtk: 0, squadSpeed: 0, squadArmor: 0 };
    for (const slot of G.EQUIP_SLOTS) {
      const item = (G.EQUIPMENT[slot.key] || []).find(i => i.id === equip[slot.key]);
      if (item) for (const [k, v] of Object.entries(item.stats)) st[k] += v;
    }
    this.stats = st;
    this.maxHp = G.HERO_BASE.hp + st.hp; this.hp = this.maxHp;
    this.armor = G.HERO_BASE.armor + st.armor;
    this.atk = this.weapon.atk * (1 + st.atk / 100);
    this.cdr = Math.min(40, st.cdr) / 100;
    this.speed = G.HERO_BASE.speed; this.radius = G.HERO_BASE.radius;
    this.x = x; this.y = y; this.z = 0; this.vz = 0; this.vx = 0; this.vy = 0; this.kx = 0; this.ky = 0;
    this.face = -Math.PI / 2; this.moving = false; this.blocking = false;
    this.anim = 'Idle'; this.animT = 0; this.action = null;   // action：正在播的一次性動作 { anim, until }
    this.cd = 0; this.skillCd = { Q: 0, E: 0, R: 0 };
    this.dash = null; this.whirl = 0; this.whirlTick = 0;
    this.stun = 0; this.flash = 0; this.dead = 0;
    this.type = 'hero';
  }
  get sprite() { return this.weapon.sprite; }
  skillKey(slot) { return this.weapon.skills[slot]; }

  doAction(anim, minDur = 0) {
    const d = Math.max(minDur, G.Sprites.duration(this.sprite, anim) || 0.3);
    this.action = { anim, until: d }; this.animT = 0;
  }

  draw(ctx) {
    const alpha = this.dead ? 0.5 : 1, y = this.y - this.z;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(this.x, this.y, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    // 腳下的主將光圈
    ctx.strokeStyle = this.team === 0 ? 'rgba(255,210,90,0.8)' : 'rgba(230,80,70,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(this.x, this.y, 12, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
    let anim = 'Idle', t = 0;
    if (this.whirl > 0) { anim = 'Whirl'; t = this.animT; }
    else if (this.action) { anim = this.action.anim; t = this.animT; }
    else if (this.moving) { anim = 'Walk'; t = this.animT; }
    G.Sprites.draw(ctx, this.sprite, anim, this.face, t, this.x, y, { alpha, flash: this.flash });
    if (this.blocking) {
      ctx.strokeStyle = 'rgba(150,210,255,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, y - 14, 16, this.face - G.CONFIG.heroBlockArc, this.face + G.CONFIG.heroBlockArc); ctx.stroke();
    }
  }
};
