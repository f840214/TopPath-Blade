/* ============ siege.js — 攻城數值：城門、可破壞城牆、衝車、雲梯、落石、投石、據點 ============
 * 效果實作在 js/systems/siege.js 和 js/world/map.js，這裡只放數值。
 */
G.SIEGE = {
  meleeGateMul: 0.25,   // 步兵徒手打城門只有原本的 1/4（衝車才是破門的主力）
  heroGateMul: 0.6,     // 武將打城門、城牆
  wallHp: 2600,         // 可破壞城牆段（地圖上顏色較深、有裂縫的那幾段）；只有衝車和武將打得動

  // 衝車：兵團推動（B 鍵指派），推的人越多越快、撞得越重；守方遠程會優先集火
  ram: { name: '衝車', hp: 900, armor: 30, radius: 20, speed: 40, crewFull: 8, hitDmg: 260, hitCd: 1.6, rangedTakenMul: 0.35 },
  // 雲梯：扛到城牆邊搭起來，變成一條窄的入城路線（爬的時候變慢）；扛著走的時候打得壞，搭上之後就固定、打不壞
  ladder: { name: '雲梯', hp: 260, armor: 6, radius: 10, speed: 52, crewFull: 6, width: 22, climbMul: 0.45 },

  // 城上落石：守方自動往牆外 reach 內的攻方丟，落點先有預警圈
  rock: { interval: 3.2, perDrop: 2, warn: 1.2, radius: 26, dmg: 32, reach: 150 },
  // 城內投石機：往攻方人最多的兵團丟，預警較久、範圍大
  boulder: { interval: 9, warn: 2.0, radius: 46, dmg: 70, minDist: 220, maxDist: 760 },

  // 可放置的器械（docs/design.md 26）：每個玩家每場 perPlayer 個，Y 放在武將前面、U 換種類；部署階段放下馬上蓋好，開戰後要 buildTime 秒
  //   kits：守方（守城、野戰）拒馬＋床弩；攻城的攻方 攻城塔＋投石車
  deploy: { time: 30, fieldTime: 20, perPlayer: 2, buildTime: 4, minFoeDist: 140,
    kits: { defend: ['stakes', 'ballista', 'cannon'], attack: ['tower', 'trebuchet', 'cannon'] } },
  // 拒馬：擋路（雙方都過不去），敵方騎兵撞上去受傷暈眩
  stakes: { name: '拒馬', hp: 420, armor: 25, radius: 20, cavDmg: 45, cavStun: 1.0, rangedTakenMul: 0.3 },
  // 床弩：自動射程內最近的敵人，弩箭貫穿一條直線
  ballista: { name: '床弩', hp: 450, armor: 15, radius: 14, range: 400, cd: 3.2, dmg: 60, width: 12, rangedTakenMul: 0.5 },
  // 攻城塔：像雲梯一樣要兵團推到城牆（B 指派），靠上之後是一個寬的入口、爬得比雲梯快；很硬但很慢
  tower: { name: '攻城塔', hp: 2000, armor: 30, radius: 22, speed: 24, crewFull: 10, width: 46, climbMul: 0.8, rangedTakenMul: 0.35 },
  // 火砲：每 cd 秒開一砲。攻城的攻方先轟還沒打開的城門、城牆段（gateDmg）；其他時候轟敵方器械，或往射程內最近的敵方兵團打一發會爆炸的砲彈
  cannon: { name: '火砲', hp: 520, armor: 20, radius: 16, range: 620, cd: 5, gateDmg: 170, dmg: 65, blast: 30, rangedTakenMul: 0.5 },
  // 投石車：自動往敵方人最多的兵團丟石頭（攻城時打城牆後面），落點先有預警
  trebuchet: { name: '投石車', hp: 650, armor: 15, radius: 18, interval: 8, warn: 1.8, blast: 46, dmg: 70, minDist: 200, maxDist: 950, rangedTakenMul: 0.5 },

  captureTime: 10,      // 每個據點要佔幾秒（據點內只有攻方）
  respawn: 10,          // 玩家武將倒下後幾秒重生（攻城一直可以；野戰要還有隨身兵團）。攻方在最後佔領的據點、守方在城內、野戰在補給點
  respawnHereExtra: 10, // 倒下時按 E 改成原地重生，要多等幾秒
  slowmo: { dur: 0.9, scale: 0.3 },   // 破門、破牆瞬間的慢動作
};
