/* ============ config.js — 全域設定與共用數值 ============
 * 平衡用的數值集中放在 js/data/ 底下，改這裡就好，不要散在程式裡。
 */
window.G = window.G || {};

/** 場景的尺寸與美術比例：戰場、城內用 battle；大地圖用 world（美術原尺寸、地圖比較大） */
G.SCALES = {
  battle: { world: { w: 2560, h: 1600, tile: 32 }, artScale: 1 / 1.5 },
  world:  { world: { w: 6144, h: 3840, tile: 32 }, artScale: 1 },
};
G.useScale = k => { const s = G.SCALES[k]; G.CONFIG.world = { ...s.world }; G.CONFIG.artScale = s.artScale; };

G.CONFIG = {
  world: { w: 2560, h: 1600, tile: 32 },
  // 美術是遊戲座標的 1.5 倍大（v0.6 重新生成的 PixelLab 素材）：畫的時候縮成 artScale，鏡頭預設拉近 1.5 倍，
  // 所以畫面上剛好是原尺寸像素；遊戲數值（距離、速度、射程）都不用跟著改
  artScale: 1 / 1.5,
  zoomLevels: [0.75, 1.5, 3],
  zoom: 1.5,

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
};
