/* ============ hero.js — 武將 ============
 * 數值 = 基礎（G.HERO_BASE）+ 武器 + 裝備。技能效果在 js/systems/skills.js。
 */
G.Hero = class {
  /** o：{ attrs: 屬性點, mastery: 這把武器的專精經驗, skills: 選的技能 { Q: 'alt' } }（js/data/heroes.js 的 G.HERO_ATTRS、G.MASTERY） */
  constructor(team, weaponKey, equip, x, y, level = 1, o = {}) {
    this.team = team; this.isHero = true;
    this.weaponKey = weaponKey; this.weapon = G.WEAPONS[weaponKey];
    const st = { hp: 0, armor: 0, atk: 0, cdr: 0, squadAtk: 0, squadSpeed: 0, squadArmor: 0 };
    for (const slot of G.EQUIP_SLOTS) {
      const item = (G.EQUIPMENT[slot.key] || []).find(i => i.id === equip[slot.key]);
      if (item) for (const [k, v] of Object.entries(item.stats)) st[k] += v;
    }
    this.stats = st;
    this.level = level;
    const ab = G.attrBonus(o.attrs), mLv = G.masteryLevel(o.mastery);
    this.masteryLv = mLv; this.skillSet = G.skillSetOf(weaponKey, o.skills, o.mastery);
    this.maxHp = Math.round(G.HERO_BASE.hp + st.hp + G.ARMY.heroHpPerLevel * (level - 1) + ab.hp); this.hp = this.maxHp;
    this.armor = G.HERO_BASE.armor + st.armor + (this.weapon.armor || 0) + ab.armor;   // 劍盾本身多護甲
    this.atk = this.weapon.atk * (1 + st.atk / 100) * ab.atkMul * (1 + G.MASTERY.atkPerLevel * mLv);
    this.atkCdMul = ab.atkCdMul;   // 普攻間隔（敏捷）
    this.cdr = Math.min(40, st.cdr) / 100;
    this.speed = G.HERO_BASE.speed * ab.speedMul; this.radius = G.HERO_BASE.radius;
    this.staminaMax = G.SPRINT.stamina + ab.stamina; this.stamina = this.staminaMax; this.restT = 0; this.tired = false; this.running = false;   // 跑步的耐力（battle/sim.js updateHero）
    this.x = x; this.y = y; this.z = 0; this.vz = 0; this.vx = 0; this.vy = 0; this.kx = 0; this.ky = 0;
    this.face = -Math.PI / 2; this.moving = false;
    this.anim = 'Idle'; this.animT = 0; this.action = null;   // action：正在播的一次性動作 { anim, until }
    this.cd = 0; this.skillCd = { Q: 0, E: 0, R: 0 };
    this.dash = null; this.whirl = 0; this.whirlTick = 0;
    this.stun = 0; this.flash = 0; this.dead = 0;
    this.type = 'hero';
  }
  /** 精靈圖：玩家選的外觀（look，見 js/data/looks.js），沒有就用武器預設的 */
  get sprite() {
    const base = this.look || this.weapon.sprite;
    if (!this.horse) return base;
    const m = base.replace(/^look_/, 'mount_');   // 戰鬥中騎馬（design.md 35）：用這個外觀的騎馬圖，沒有就用重騎兵
    return G.SPRITE_META && G.SPRITE_META[m] ? m : 'heavycav';
  }
  skillKey(slot) { return (this.skillSet || this.weapon.skills)[slot]; }

  doAction(anim, minDur = 0) {
    const d = Math.max(minDur, G.Sprites.duration(this.sprite, anim) || 0.3);
    this.action = { anim, until: d }; this.animT = 0;
  }

  /** 騎馬（大地圖）的影子：跟馬一樣長，橫著走時拉長；中心在馬蹄連線往上一點（四隻腳之間），不然看起來像浮在半空 */
  static horseShadow(x, y, face) {
    const c = Math.abs(Math.cos(face)), s = Math.abs(Math.sin(face));
    G.Render.shadow(x, y - G.Hero.HORSE_DY, 12 + 12 * c, 5 + 2 * s, 0.5);
    return 12 + 12 * c;
  }

  draw(ctx) {
    // 倒下：跟小兵一樣 1.2 秒淡出，之後不畫（以前半透明的人一直站在原地）
    const alpha = this.dead ? Math.max(0, 1 - this.dead / 1.2) : 1, y = this.y - this.z;
    if (alpha <= 0) return;
    const onHorse = this.mounted || this.horse;
    const rx = onHorse ? G.Hero.horseShadow(this.x, this.y, this.face) + 2 : (G.Render.shadow(this.x, this.y, 9, 3.5, 0.3), 12);
    // 腳下的主將光圈（騎馬時跟影子同一個中心）
    G.Render.under.ellipse(this.x, this.y - (onHorse ? G.Hero.HORSE_DY : 0), rx, rx * 0.375).stroke({ width: 1, color: this.team === (G.viewTeam || 0) ? 0xffd25a : 0xe65046, alpha: 0.8 * alpha });
    // 自身強化中（鬼神等）：腳下一圈閃動的紅色氣焰。同場戰鬥沒有 buff 物件，用伺服器送來的 buffOn
    if (!this.dead && (this.buffOn || (this.buff && G.Battle && this.buff.until > G.Battle.time))) {
      const p = 0.55 + Math.sin(performance.now() / 120) * 0.25;
      if (G.FX.drawFrame('aura_rage', performance.now() / 1000, this.x, this.y, { alpha })) { /* PixelLab 的紅色氣焰，畫在武將後面 */ } else {
      G.Render.under.ellipse(this.x, this.y, rx + 6, (rx + 6) * 0.4).stroke({ width: 3, color: 0xff4a30, alpha: Math.min(1, p + 0.2) * alpha });
      G.Render.zone(this.x, this.y, rx + 14, (rx + 14) * 0.45, 0xff3a20, (0.3 + p * 0.2) * alpha);
      }
    }
    let anim = 'Idle', t = 0;
    if (this.whirl > 0) { anim = 'Whirl'; t = this.animT; }
    else if (this.action) { anim = this.action.anim; t = this.animT; }
    else if (this.moving) { anim = 'Walk'; t = this.animT; }
    // 擊倒：躺平（快起來的最後 0.2 秒慢慢轉回來）；翻滾無敵時半透明
    const rot = this.down > 0 && !this.dead ? (this.downDir || 1) * Math.PI / 2 * Math.min(1, this.down / 0.2) : 0;
    G.Sprites.draw(this.sprite, rot ? 'Idle' : anim, this.face, t, this.x, y, { alpha: alpha * (this.iframes > 0 ? 0.55 : 1), flash: this.flash, rot });
    // 格擋：面前一道淡藍色的弧（盾面）
    if (this.blocking && !this.dead) {
      ctx.strokeStyle = 'rgba(200,225,255,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, y - 12, 13, this.face - G.BLOCK.arc / 2, this.face + G.BLOCK.arc / 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,160,220,0.5)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(this.x, y - 12, 16, this.face - 0.5, this.face + 0.5); ctx.stroke();
    }
    // 頭上的名字（畫在上層 canvas）：我方金色、敵方紅色
    if (this.name && !this.dead) {
      ctx.font = 'bold 7px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const ny = Math.round(y - (this.nameDy || (this.horse ? 62 : 42)));   // 騎馬時名字往上
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(this.name, this.x + 0.6, ny + 0.6);
      ctx.fillStyle = this.team === (G.viewTeam || 0) ? '#ffe28a' : '#ff9a8a'; ctx.fillText(this.name, this.x, ny);
    }
  }
};
G.Hero.HORSE_DY = 5;   // 騎馬的影子、光圈中心比馬蹄的錨點高幾 px（四隻腳之間）
