/* ============ army.js — 統率、招募、成長的數值（docs/design.md 10 節）============
 * 原型假設，實測後再調。兵種本身的戰鬥數值在 units.js。
 */
G.ARMY = {
  // 兵團統率成本：出戰兵團的總和不能超過武將的統率上限
  leadership: {
    pikeman: 100, shieldman: 120, archer: 110, cavalry: 160,
    swordshield: 120, halberdier: 130, greatsword: 150, axeman: 150, maceman: 160, modao: 170, militia: 60, engineer: 100,
    longbowman: 120, crossbowman: 120, pavise: 150, arquebusier: 150, javelineer: 110, grenadier: 150,
    horsearcher: 160, heavycav: 200,
  },
  // 每名士兵的招募／補員金幣
  recruitCost: {
    pikeman: 6, shieldman: 8, archer: 7, cavalry: 15,
    swordshield: 8, halberdier: 9, greatsword: 12, axeman: 12, maceman: 13, modao: 14, militia: 3, engineer: 7,
    longbowman: 9, crossbowman: 9, pavise: 12, arquebusier: 11, javelineer: 8, grenadier: 14,
    horsearcher: 17, heavycav: 24,
  },

  // 武將：等級決定統率上限與生命
  heroMaxLevel: 30,
  heroXpToNext: lv => 100 * lv,
  leadershipCap: lv => 250 + 30 * (lv - 1),   // 隨身兵團（補給點輪流換上場，一次只出一支）
  fieldCap: lv => 200 + 25 * (lv - 1),        // 配置兵團（開戰時擺在戰場上，由電腦指揮）
  heroHpPerLevel: 10,

  // 兵團：靠擊殺累積經驗，每級生命與攻擊 +4%
  squadMaxLevel: 10,
  squadXpToNext: lv => 100 * lv,
  squadXpPerKill: 10,
  squadLevelBonus: 0.04,

  // 戰後獎勵
  goldPerKill: 2, goldWin: 150, goldLose: 30,
  heroXpPerKill: 1, heroXpWin: 100, heroXpLose: 30,

  maxRoster: 8,
  // 新存檔：金幣與初始名冊（men 是目前人數，滿編人數看 G.UNITS[type].count）
  start: { gold: 300, roster: ['pikeman', 'archer', 'shieldman'] },
};
