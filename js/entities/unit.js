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
    this.level = o.level || 1;
    this.levelMul = 1 + G.ARMY.squadLevelBonus * (this.level - 1);   // 兵團等級：生命與攻擊加成
    this.mods = o.mods || {};   // 老兵技能樹的效果（G.Army.modsOf）
    this.kills = 0;
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
  // lineCols：拖曳拉線排的陣型（一排幾個人，sim.js lineOrder）；spread：散開指令，間距拉大
  slots(n) { const s = this.lineCols ? G.formationGrid(n, Math.min(this.lineCols, n), 15) : G.FORMATIONS[this.formation].slots(n); return this.spread ? s.map(p => ({ x: p.x * 1.7, y: p.y * 1.7 })) : s; }
  slotWorld(s, cx, cy, f) {
    const c = Math.cos(f), sn = Math.sin(f);
    return { x: cx + s.x * c - s.y * sn, y: cy + s.x * sn + s.y * c };
  }
  get fm() { return G.FORMATIONS[this.formation]; }
  /** 老兵效果：mod('atkMul', 1)；skillMod('cdMul', 'brace', 1) 取某個兵團技能的值。沒點到的回傳預設值 d */
  mod(k, d) { const v = this.mods[k]; return v === undefined ? d : v; }
  skillMod(k, skill, d) { const o = this.mods[k]; return o && o[skill] !== undefined ? o[skill] : d; }
  get range() { return this.def.range * this.mod('rangeMul', 1) * (this.def.ranged ? G.weatherOf().rangeMul : 1); }   // 霧天遠程射程變短
  /** weak：兵力過低（活著的人少於編制的 G.ARMY.weakAt）攻擊打折 */
  get weak() { return this.units.filter(u => !u.dead).length < this.def.count * G.ARMY.weakAt; }
  atkMul(now) { return (1 + this.bonus.atk / 100) * this.levelMul * this.mod('atkMul', 1) * (now < this.buff.until ? this.buff.atkMul : 1) * (this.weak ? G.ARMY.weakMul : 1); }
  speedMul(now) {
    let m = (1 + this.bonus.speed / 100) * (this.fm.speedMul || 1) * this.mod('speedMul', 1) * (now < this.buff.until ? this.buff.speedMul : 1);
    if (this.fx.charge > 0) m *= G.UNIT_SKILLS.charge.speedMul;
    if (this.fx.rush > 0) m *= G.SQUAD_ORDERS.rush.speedMul;
    return m;
  }
  get rooted() { return this.fx.brace > 0 || this.fx.shieldwall > 0 || this.fx.stand > 0; }
  cycleFormation() {
    const list = this.def.formations, i = list.indexOf(this.formation);
    this.formation = list[(i + 1) % list.length]; this.lineCols = undefined;
  }
};

G.Unit = class {
  constructor(squad, slot, x, y) {
    this.squad = squad; this.team = squad.team; this.def = squad.def; this.slot = slot;
    this.x = x; this.y = y; this.z = 0; this.vz = 0;
    this.vx = 0; this.vy = 0; this.kx = 0; this.ky = 0;   // 擊退速度
    this.hp = this.maxHp = this.def.hp * squad.levelMul * squad.mod('hpMul', 1);
    this.face = squad.face; this.cd = Math.random() * this.def.atkCd;
    this.anim = 'Idle'; this.animT = Math.random(); this.moving = false;
    this.target = null; this.seekT = Math.random() * 0.2; this.stun = 0; this.flash = 0; this.dead = 0;
    this.radius = this.def.radius;
  }
  get type() { return this.def.type; }
  get armor() { return this.def.armor + this.squad.bonus.armor + this.squad.mod('armor', 0); }

  play(anim) { if (this.anim !== anim) { this.anim = anim; this.animT = 0; } }

  draw(ctx) {
    const red = this.team !== (G.viewTeam || 0), alpha = this.dead ? Math.max(0, 1 - this.dead / 1.2) : 1;
    const y = this.y - this.z;
    // 影子在 game.js 的 drawShadows 一次畫完
    const anim = this.moving ? 'Walk' : (this.anim === 'Attack' ? 'Attack' : 'Idle');
    const t = anim === 'Idle' ? 0 : this.animT;
    // 美術還沒生成好的兵種用 base 的圖；沒有攻擊動畫的騎兵（衝鋒）用奔跑代替，騎射兵有射箭動畫
    const sprite = G.SPRITE_META[this.def.sprite] ? this.def.sprite : this.def.base;
    const a = this.def.mounted && anim === 'Attack' && !(G.SPRITE_META[sprite] && G.SPRITE_META[sprite].anims.Attack) ? 'Walk' : anim;
    // 擊倒：躺平；陣亡：0.25 秒內倒下（之後 game.js 把屍體留在地上）
    const side = this.downDir || ((this.nid || this.slot || 0) % 2 ? 1 : -1);
    const rot = this.dead ? side * Math.PI / 2 * Math.min(1, this.dead / 0.25) : this.down > 0 ? side * Math.PI / 2 * Math.min(1, this.down / 0.2) : 0;
    G.Sprites.draw(sprite, rot ? 'Idle' : a, this.face, rot ? 0 : t, this.x, y, { red, alpha, flash: this.flash, rot });
    // 下面這些畫在上層 canvas（ctx）
    if (this.stun > 0 && !this.dead) {
      ctx.fillStyle = '#ffe680';
      for (let i = 0; i < 3; i++) { const a = this.animT * 6 + i * 2.1; ctx.fillRect(Math.round(this.x + Math.cos(a) * 6), Math.round(y - 36 + Math.sin(a) * 2), 2, 2); }
    }
  }
};
