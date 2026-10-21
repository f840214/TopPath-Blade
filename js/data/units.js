/* ============ units.js — 兵種 ============
 * type 用在克制表（counters.js）；sprite 對應 assets/units/<sprite>/。
 * formations 第一個是預設陣型；skills 對應 G.UNIT_SKILLS 的 key（Z / X）。
 */
G.UNITS = {
  pikeman: {
    name: '長槍兵', type: 'pike', sprite: 'pikeman', count: 20,
    hp: 70, atk: 10, armor: 4, speed: 70, range: 24, atkCd: 1.1, radius: 6,
    formations: ['block', 'line', 'column'],
    skills: ['brace', 'thrust'],
    desc: '反騎兵。架起長槍陣時，騎兵正面衝鋒會被擋下並反傷。',
  },
  shieldman: {
    name: '盾兵', type: 'shield', sprite: 'shieldman', count: 16,
    hp: 110, atk: 8, armor: 10, speed: 60, range: 16, atkCd: 1.0, radius: 6,
    frontRangedMul: 0.4,
    formations: ['block', 'line', 'column'],
    skills: ['shieldwall', 'shieldbash'],
    desc: '前排防禦。正面擋箭，盾牆時遠程攻擊幾乎無效。',
  },
  archer: {
    name: '弓兵', type: 'archer', sprite: 'archer', count: 16,
    hp: 45, atk: 7, armor: 1, speed: 72, range: 190, atkCd: 1.9, radius: 6,
    ranged: { speed: 260, minRange: 50 },
    formations: ['loose', 'block', 'line'],
    skills: ['volley', 'firearrow'],
    desc: '遠程火力。敵人逼近時會後撤拉開距離。',
  },
  cavalry: {
    name: '騎兵', type: 'cav', sprite: 'cavalry', count: 10,   // 人馬一體的四足角色（PixelLab 馬骨架）
    hp: 100, atk: 12, armor: 5, speed: 150, range: 20, atkCd: 1.2, radius: 9,
    mounted: true,
    formations: ['wedge', 'column', 'loose'],
    skills: ['charge', 'flank'],
    desc: '機動衝鋒。高速撞上敵人時造成大量傷害並擊退，但怕長槍陣。',
  },
};
