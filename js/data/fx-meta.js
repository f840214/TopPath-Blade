/* ============ fx-meta.js — PixelLab 特效動畫的設定（design.md 36）============
 * 由 assets/fx/fx.json 產生：每個特效的影格大小 w/h、格數 frames、播放速度 fps、是否循環 loop、錨點 ax/ay（影格裡的地面中心或物體中心）。
 * 圖在 assets/fx/<名稱>.png（橫排影格條）。播放在 js/entities/fx.js 的 play / drawFrame。
 */
G.FX_META = {
  rock: { w: 12, h: 12, frames: 1, fps: 1, loop: false, ax: 6, ay: 6 },
  rock_impact: { w: 57, h: 26, frames: 6, fps: 12, loop: false, ax: 28, ay: 16 },
  boulder: { w: 20, h: 20, frames: 4, fps: 8, loop: true, ax: 10, ay: 10 },
  boulder_impact: { w: 87, h: 42, frames: 8, fps: 10, loop: false, ax: 43, ay: 25 },
  fire_arrow: { w: 26, h: 11, frames: 4, fps: 12, loop: true, ax: 13, ay: 5 },
  fire_ground: { w: 35, h: 41, frames: 8, fps: 10, loop: true, ax: 17, ay: 38 },
  explosion: { w: 40, h: 48, frames: 8, fps: 12, loop: false, ax: 21, ay: 25 },
  muzzle: { w: 23, h: 22, frames: 5, fps: 16, loop: false, ax: 2, ay: 11 },
  hit_spark: { w: 28, h: 30, frames: 5, fps: 16, loop: false, ax: 14, ay: 14 },
  slash_spin: { w: 98, h: 59, frames: 5, fps: 16, loop: false, ax: 49, ay: 29 },
  shout_ring: { w: 130, h: 76, frames: 8, fps: 14, loop: false, ax: 65, ay: 38 },
  aura_rage: { w: 42, h: 51, frames: 8, fps: 10, loop: true, ax: 21, ay: 41 },
  dust_puff: { w: 30, h: 13, frames: 5, fps: 12, loop: false, ax: 15, ay: 8 },
};
