/* ============ config.js — 全域設定與共用數值 ============
 * 平衡用的數值集中放在 js/data/ 底下，改這裡就好，不要散在程式裡。
 */
window.G = window.G || {};

G.CONFIG = {
  world: { w: 2560, h: 1600, tile: 32 },
  zoomLevels: [1, 1.5, 2],
  zoom: 1,

  // 情境修正（docs/design.md 2.2）
  flankMul: 1.3,          // 側面
  rearMul: 1.5,           // 背後
  chargeMul: 2.5,         // 騎兵高速撞擊
  chargeSpeedRatio: 0.75, // 速度達到最高速的多少比例才算衝鋒
  chargeKnockback: 26,
  braceReflect: 30,       // 撞上架槍長槍兵時騎兵受到的反傷
  braceStun: 1.2,
  armorK: 20,             // 減傷 = armorK / (armorK + armor)

  squadAggro: { follow: 70, hold: 110, attack: 200 },
  squadLeash: 160,
  enemyAggro: 320,

  heroBlockReduction: 0.8,
  heroBlockArc: 1.2,      // 正面左右各 1.2 rad 內的攻擊可擋
  heroBlockSpeedMul: 0.5,
};
