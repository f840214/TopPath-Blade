/* ============ siege.js — 攻城數值：城門、可破壞城牆、衝車、雲梯、落石、投石、據點 ============
 * 效果實作在 js/systems/siege.js 和 js/world/map.js，這裡只放數值。
 */
G.SIEGE = {
  meleeGateMul: 0.25,   // 步兵徒手打城門只有原本的 1/4（衝車才是破門的主力）
  heroGateMul: 0.6,     // 武將打城門、城牆
  wallHp: 2600,         // 可破壞城牆段（地圖上顏色較深、有裂縫的那幾段）；只有衝車和武將打得動

  // 衝車：兵團推動（B 鍵指派），推的人越多越快、撞得越重；守方遠程會優先集火
  ram: { name: '衝車', hp: 900, armor: 30, radius: 16, speed: 40, crewFull: 8, hitDmg: 260, hitCd: 1.6, rangedTakenMul: 0.35 },
  // 雲梯：扛到城牆邊搭起來，變成一條窄的入城路線（爬的時候變慢）；扛著走的時候打得壞，搭上之後就固定、打不壞
  ladder: { name: '雲梯', hp: 260, armor: 6, radius: 10, speed: 52, crewFull: 6, width: 22, climbMul: 0.45 },

  // 城上落石：守方自動往牆外 reach 內的攻方丟，落點先有預警圈
  rock: { interval: 3.2, perDrop: 2, warn: 1.2, radius: 26, dmg: 32, reach: 150 },
  // 城內投石機：往攻方人最多的兵團丟，預警較久、範圍大
  boulder: { interval: 9, warn: 2.0, radius: 46, dmg: 70, minDist: 220, maxDist: 760 },

  captureTime: 10,      // 每個據點要佔幾秒（據點內只有攻方）
  respawn: 10,          // 攻方武將陣亡後，在最後佔領的據點重生（秒）
  slowmo: { dur: 0.9, scale: 0.3 },   // 破門、破牆瞬間的慢動作
};
