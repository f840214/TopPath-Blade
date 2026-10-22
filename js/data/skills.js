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
  cleave:     { name: '猛擊',   cd: 11, dmgMul: 1.6, reach: 30, arc: 2.4, knock: 10, desc: '全隊朝前方大範圍揮砍一次，打中的都擊退。' },
  frenzy:     { name: '狂戰',   cd: 20, dur: 6, atkMul: 1.3, speedMul: 1.2, desc: '6 秒內攻擊 +30%、移速 +20%。' },
};

G.HERO_SKILLS = {
  spin:     { name: '迴旋斬',   cd: 6,  radius: 46, dmgMul: 1.6, anim: 'Spin',   desc: '周圍一圈傷害。' },
  dash:     { name: '突進斬',   cd: 8,  dist: 110, width: 22, dmgMul: 1.8, anim: 'Attack', desc: '向前衝刺，砍中路徑上的敵人。' },
  warcry:   { name: '戰吼',     cd: 25, dur: 8, atkMul: 1.25, speedMul: 1.15, anim: 'Shout', desc: '我方兵團攻擊 +25%、移速 +15%。' },
  sweep:    { name: '橫掃千軍', cd: 7,  radius: 52, arc: 3.8, dmgMul: 1.7, knock: 22, anim: 'Attack', desc: '前方 220° 大範圍擊退。' },
  launch:   { name: '挑飛',     cd: 9,  dist: 80, width: 26, dmgMul: 1.5, stun: 1.4, anim: 'Attack', desc: '前方直線擊飛並暈眩。' },
  whirl:    { name: '旋風',     cd: 18, dur: 3, radius: 44, tick: 0.3, dmgMul: 0.6, anim: 'Whirl', desc: '持續旋轉 3 秒，可移動。' },
  // 劍盾
  bash:     { name: '盾擊',     cd: 7,  radius: 40, arc: 1.6, dmgMul: 1.1, stun: 1.3, knock: 16, anim: 'Attack', desc: '用盾撞前方，暈眩並擊退。' },
  guard:    { name: '舉盾',     cd: 14, dur: 4, takenMul: 0.35, speedMul: 0.6, anim: 'Shout', desc: '4 秒內受到的傷害只剩 35%，移動變慢。' },
  rally:    { name: '號令',     cd: 26, dur: 8, atkMul: 1.15, morale: 40, anim: 'Shout', desc: '我方兵團士氣 +40、攻擊 +15%，潰散中的兵團馬上重整。' },
  // 野太刀
  iai:      { name: '居合斬',   cd: 7,  dist: 140, width: 18, dmgMul: 2.4, anim: 'Attack', desc: '一閃穿過前方，路徑上的敵人受重創。' },
  tsubame:  { name: '燕返',     cd: 9,  radius: 48, dmgMul: 1.3, hits: 2, anim: 'Spin',   desc: '原地迴旋兩次。' },
  kishin:   { name: '鬼神',     cd: 28, dur: 8, atkMul: 1.4, speedMul: 1.2, anim: 'Shout', desc: '8 秒內自己攻擊 +40%、移速 +20%。' },
  // 長槍
  pierce:   { name: '貫槍',     cd: 6,  dist: 130, width: 16, dmgMul: 1.8, anim: 'Attack', desc: '向前直線穿刺，貫穿一整排。' },
  pikesweep:{ name: '掃槍',     cd: 9,  radius: 62, dmgMul: 1.2, knock: 26, anim: 'Spin',   desc: '長槍掃一圈，把周圍的人推開。' },
  lancecharge: { name: '破陣衝鋒', cd: 22, dist: 220, width: 24, dmgMul: 2.0, stun: 1.2, anim: 'Attack', desc: '長距離衝鋒，撞到的人擊飛暈眩。' },
  // 火槍
  buckshot: { name: '散彈',     cd: 5,  range: 150, arc: 1.0, pellets: 8, dmgMul: 0.85, knock: 20, stun: 0.5, close: 70, anim: 'Attack', desc: '前方扇形散彈，近距離威力大；貼身的敵人被轟退、暈眩 0.5 秒。' },
  roll:     { name: '後撤裝填', cd: 8,  dist: 110, loaded: 2, loadMul: 1.7, anim: 'Walk', desc: '往後翻滾拉開距離，接下來兩發普攻立刻開火、傷害 +70%。' },
  snipe:    { name: '穿甲彈',   cd: 16, range: 560, aim: 0.6, width: 16, dmgMul: 4, heroMul: 1.5, stun: 0.8, knock: 30, anim: 'Attack', desc: '瞄準 0.6 秒後朝最近的敵將（沒有就最近的敵人）開槍，子彈貫穿整條直線，打中的都暈眩擊退；打武將傷害再 ×1.5。' },
  // 戰錘
  quake:    { name: '震地',     cd: 9,  radius: 72, dmgMul: 1.5, stun: 1.2, anim: 'Smash', desc: '砸地震暈周圍的人。' },
  ram:      { name: '衝撞',     cd: 8,  dist: 90, width: 26, dmgMul: 1.4, anim: 'Attack', desc: '向前衝撞，撞飛路徑上的人。' },
  hammerwhirl: { name: '旋錘',  cd: 22, dur: 3.5, radius: 50, tick: 0.35, dmgMul: 0.8, anim: 'Whirl', desc: '持續掄錘 3.5 秒，可移動。' },
  // 長弓
  pierceshot: { name: '穿透箭', cd: 7,  dist: 420, width: 14, dmgMul: 2.0, anim: 'Attack', desc: '一箭貫穿前方直線上的所有敵人。' },
  arrowrain:  { name: '箭雨',   cd: 12, range: 340, radius: 70, waves: 4, interval: 0.4, dmgMul: 0.8, anim: 'Attack', desc: '對最近的敵群連射四輪箭雨。' },
  firerain:   { name: '火雨',   cd: 26, range: 340, radius: 90, dur: 6, dps: 14, anim: 'Attack', desc: '對最近的敵群射出火箭，大範圍持續燃燒。' },
};
