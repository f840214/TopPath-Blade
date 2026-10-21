/* ============ unit.js — 士兵與兵團 ============
 * Squad 管指令、陣型、技能、增益；Unit 是單一士兵（移動、動畫、受擊狀態）。
 */
G.Squad = class {
  constructor(team, typeKey, x, y, face, o = {}) {
    this.team = team; this.typeKey = typeKey; this.def = G.UNITS[typeKey];
    this.formation = this.def.formations[0];
    this.cmd = o.cmd || 'hold'; this.cmdPoint = { x, y };
    this.face = face; this.home = { x, y };
    this.skillCd = {}; this.fx = {};          // fx：brace / shieldwall / charge 的剩餘秒數
    this.buff = { atkMul: 1, speedMul: 1, until: 0 };
    this.bonus = o.bonus || { atk: 0, speed: 0, armor: 0 };   // 披風等裝備給的固定加成（%）
    this.label = o.label || this.def.name;
    this.waypoint = null;
    this.units = [];
    const n = o.count || this.def.count;
    const slots = this.slots(n);
    for (let i = 0; i < n; i++) {
      const p = this.slotWorld(slots[i], x, y, face);
      this.units.push(new G.Unit(this, i, p.x, p.y));
    }
  }
  get alive() { return this.units.filter(u => !u.dead); }
  get center() {
    const a = this.alive; if (!a.length) return { ...this.cmdPoint };
    let x = 0, y = 0; for (const u of a) { x += u.x; y += u.y; } return { x: x / a.length, y: y / a.length };
  }
  slots(n) { return G.FORMATIONS[this.formation].slots(n); }
  slotWorld(s, cx, cy, f) {
    const c = Math.cos(f), sn = Math.sin(f);
    return { x: cx + s.x * c - s.y * sn, y: cy + s.x * sn + s.y * c };
  }
  get fm() { return G.FORMATIONS[this.formation]; }
  atkMul(now) { return (1 + this.bonus.atk / 100) * (now < this.buff.until ? this.buff.atkMul : 1); }
  speedMul(now) {
    let m = (1 + this.bonus.speed / 100) * (this.fm.speedMul || 1) * (now < this.buff.until ? this.buff.speedMul : 1);
    if (this.fx.charge > 0) m *= G.UNIT_SKILLS.charge.speedMul;
    return m;
  }
  get rooted() { return this.fx.brace > 0 || this.fx.shieldwall > 0; }
  cycleFormation() {
    const list = this.def.formations, i = list.indexOf(this.formation);
    this.formation = list[(i + 1) % list.length];
  }
};

G.Unit = class {
  constructor(squad, slot, x, y) {
    this.squad = squad; this.team = squad.team; this.def = squad.def; this.slot = slot;
    this.x = x; this.y = y; this.z = 0; this.vz = 0;
    this.vx = 0; this.vy = 0; this.kx = 0; this.ky = 0;   // 擊退速度
    this.hp = this.def.hp; this.maxHp = this.def.hp;
    this.face = squad.face; this.cd = Math.random() * this.def.atkCd;
    this.anim = 'Idle'; this.animT = Math.random(); this.moving = false;
    this.target = null; this.seekT = Math.random() * 0.2; this.stun = 0; this.flash = 0; this.dead = 0;
    this.radius = this.def.radius;
  }
  get type() { return this.def.type; }
  get armor() { return this.def.armor + this.squad.bonus.armor; }

  play(anim) { if (this.anim !== anim) { this.anim = anim; this.animT = 0; } }

  draw(ctx) {
    const red = this.team === 1, alpha = this.dead ? Math.max(0, 1 - this.dead / 1.2) : 1;
    const y = this.y - this.z;
    // 影子在 game.js 的 drawShadows 一次畫完
    const anim = this.moving ? 'Walk' : (this.anim === 'Attack' ? 'Attack' : 'Idle');
    const t = anim === 'Idle' ? 0 : this.animT;
    // 騎兵沒有攻擊動畫，衝鋒時用奔跑代替
    const a = this.def.mounted && anim === 'Attack' ? 'Walk' : anim;
    G.Sprites.draw(ctx, this.def.sprite, a, this.face, t, this.x, y, { red, alpha, flash: this.flash });
    if (this.stun > 0 && !this.dead) {
      ctx.fillStyle = '#ffe680';
      for (let i = 0; i < 3; i++) { const a = this.animT * 6 + i * 2.1; ctx.fillRect(Math.round(this.x + Math.cos(a) * 6), Math.round(y - 36 + Math.sin(a) * 2), 2, 2); }
    }
  }
};
