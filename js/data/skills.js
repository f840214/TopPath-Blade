/* ============ skills.js — 兵團技能與武將技能 ============
 * 效果實作在 js/systems/skills.js，這裡只放名稱、說明與數值。
 */
G.UNIT_SKILLS = {
  brace:      { name: '長槍陣', cd: 14, dur: 6, desc: '原地架槍。正面撞上的騎兵衝鋒無效並受反傷；不能移動。' },
  thrust:     { name: '突刺',   cd: 10, dmgMul: 2.2, reach: 34, desc: '全隊向前刺出一次重擊。' },
  shieldwall: { name: '盾牆',   cd: 16, dur: 8, frontRangedMul: 0.1, meleeTakenMul: 0.6, desc: '原地結陣，正面遠程幾乎無效、近戰減傷；不能移動。' },
  shieldbash: { name: '盾擊',   cd: 12, dmgMul: 1.2, knock: 18, stun: 1.0, desc: '擊退並暈眩正前方的敵人。' },
  volley:     { name: '齊射',   cd: 14, waves: 3, interval: 0.5, radius: 50, desc: '對目標區域連射三輪。' },
  firearrow:  { name: '火箭',   cd: 20, radius: 45, dur: 5, dps: 6, desc: '落點起火，持續燒傷區域內的敵人。' },
  charge:     { name: '衝鋒',   cd: 12, dur: 3, speedMul: 1.35, chargeMul: 1.3, desc: '全速衝向最近敵群，衝鋒傷害提高。' },
  flank:      { name: '迂迴',   cd: 16, dist: 140, desc: '繞到目標側後方再進攻。' },
};

G.HERO_SKILLS = {
  spin:     { name: '迴旋斬',   cd: 6,  radius: 46, dmgMul: 1.6, anim: 'Spin',   desc: '周圍一圈傷害。' },
  dash:     { name: '突進斬',   cd: 8,  dist: 110, width: 22, dmgMul: 1.8, anim: 'Attack', desc: '向前衝刺，砍中路徑上的敵人。' },
  warcry:   { name: '戰吼',     cd: 25, dur: 8, atkMul: 1.25, speedMul: 1.15, anim: 'Shout', desc: '我方兵團攻擊 +25%、移速 +15%。' },
  sweep:    { name: '橫掃千軍', cd: 7,  radius: 52, arc: 3.8, dmgMul: 1.7, knock: 22, anim: 'Attack', desc: '前方 220° 大範圍擊退。' },
  launch:   { name: '挑飛',     cd: 9,  dist: 80, width: 26, dmgMul: 1.5, stun: 1.4, anim: 'Attack', desc: '前方直線擊飛並暈眩。' },
  whirl:    { name: '旋風',     cd: 18, dur: 3, radius: 44, tick: 0.3, dmgMul: 0.6, anim: 'Whirl', desc: '持續旋轉 3 秒，可移動。' },
};
