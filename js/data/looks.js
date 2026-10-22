/* 武將外觀（可選造型）。key 對應 G.SPRITE_META 裡的精靈圖（assets/units/<key>/），portrait 是 128×128 頭像（3/4 側面、臉朝右、透明背景）。順序就是選單顯示順序。 */
G.LOOKS = [
  { key: 'look_samurai',         name: '戰國武士',   region: '日本戰國', portrait: 'assets/portraits/samurai.png', weapon: 'nodachi' },
  { key: 'look_ashigaru_taisho', name: '足輕大將',   region: '日本戰國', portrait: 'assets/portraits/ashigaru_taisho.png', weapon: 'pike' },
  { key: 'look_knight',          name: '歐洲騎士',   region: '歐洲中世紀', portrait: 'assets/portraits/knight.png', weapon: 'shield' },
  { key: 'look_templar',         name: '十字軍騎士', region: '歐洲中世紀', portrait: 'assets/portraits/templar.png', weapon: 'sword' },
  { key: 'look_landsknecht',     name: '德意志傭兵', region: '歐洲中世紀', portrait: 'assets/portraits/landsknecht.png', weapon: 'sword' },
  { key: 'look_han_general',     name: '唐軍將軍',   region: '中國',     portrait: 'assets/portraits/han_general.png', weapon: 'glaive' },
  { key: 'look_ming_officer',    name: '明朝武官',   region: '中國',     portrait: 'assets/portraits/ming_officer.png', weapon: 'musket' },
  { key: 'look_viking',          name: '維京戰士',   region: '維京',     portrait: 'assets/portraits/viking.png', weapon: 'shield' },
  { key: 'look_jarl',            name: '維京首領',   region: '維京',     portrait: 'assets/portraits/jarl.png', weapon: 'maul' },
  { key: 'look_mongol',          name: '草原勇士',   region: '蒙古草原', portrait: 'assets/portraits/mongol.png', weapon: 'longbow' },
];
