/* ============ units.js — 兵種 ============
 * type 用在克制表（counters.js）：pike 長槍、shield 盾、shock 衝擊步兵、archer 遠程、cav 騎兵。
 * sprite 對應 assets/units/<sprite>/；美術還沒生成好時用 base 的圖代替（G.Unit.draw）。short 是兵團旗標上的字。
 * formations 第一個是預設陣型；skills 對應 G.UNIT_SKILLS 的 key（Z / X）。
 * 遠程 ranged：{ speed 飛行速度, minRange 太近就後撤, flat 直線飛（子彈）, splash 落點爆炸半徑 }
 * engineer：操作攻城器械時一人算兩人；frontRangedMul：正面受遠程傷害倍率（盾）
 * dtype：傷害類型（沒寫照 G.dtypeOf）；pen：破甲比例（counters.js 的 G.DAMAGE_TYPES）
 * 兵種名稱是 TopPath Blade 自己取的，參考 docs/conquerors-blade-units.md 的兵種定位，不照搬原作兵團。
 */
G.UNITS = {
  pikeman: {
    name: '長槍兵', short: '槍', type: 'pike', sprite: 'pikeman', count: 20,
    hp: 70, atk: 10, armor: 4, speed: 70, range: 24, atkCd: 1.1, radius: 6,
    formations: ['block', 'line', 'column'],
    skills: ['brace', 'thrust'],
    desc: '反騎兵。架起長槍陣時，騎兵正面衝鋒會被擋下並反傷。',
  },
  shieldman: {
    name: '盾兵', short: '盾', type: 'shield', sprite: 'shieldman', count: 16,
    hp: 110, atk: 8, armor: 10, speed: 60, range: 16, atkCd: 1.0, radius: 6,
    frontRangedMul: 0.4,
    formations: ['block', 'line', 'column'],
    skills: ['shieldwall', 'shieldbash'],
    desc: '前排防禦。正面擋箭，盾牆時遠程攻擊幾乎無效。',
  },
  archer: {
    name: '弓兵', short: '弓', type: 'archer', sprite: 'archer', count: 16,
    hp: 45, atk: 7, armor: 1, speed: 72, range: 190, atkCd: 1.9, radius: 6,
    ranged: { speed: 260, minRange: 50 },
    formations: ['loose', 'block', 'line'],
    skills: ['volley', 'firearrow'],
    desc: '遠程火力。敵人逼近時會後撤拉開距離。',
  },
  cavalry: {
    name: '騎兵', short: '騎', type: 'cav', sprite: 'cavalry', count: 10,   // 人馬一體的四足角色（PixelLab 馬骨架）
    hp: 100, atk: 12, armor: 5, speed: 150, range: 20, atkCd: 1.2, radius: 9,
    mounted: true,
    formations: ['wedge', 'column', 'loose'],
    skills: ['charge', 'flank'],
    desc: '機動衝鋒。高速撞上敵人時造成大量傷害並擊退，但怕長槍陣。',
  },

  /* ---------- 步兵 ---------- */
  swordshield: {
    name: '劍盾兵', short: '劍', type: 'shield', sprite: 'swordshield', base: 'shieldman', count: 18,
    hp: 95, atk: 10, armor: 8, speed: 68, range: 18, atkCd: 1.0, radius: 6, frontRangedMul: 0.6,
    formations: ['block', 'line', 'column'], skills: ['shieldwall', 'shieldbash'],
    desc: '攻守平均的前排。比盾兵快、打得痛，但擋箭比較差。',
  },
  halberdier: {
    name: '戟兵', short: '戟', type: 'shock', sprite: 'halberdier', base: 'pikeman', count: 18,
    hp: 85, atk: 13, armor: 6, speed: 66, range: 28, atkCd: 1.2, radius: 6,
    formations: ['block', 'line', 'column'], skills: ['brace', 'cleave'],
    desc: '長柄衝擊兵。能劈開盾陣，也能架戟擋騎兵，什麼都會一點。',
  },
  greatsword: {
    name: '雙手劍士', short: '巨', type: 'shock', sprite: 'greatsword', base: 'pikeman', count: 14,
    hp: 90, atk: 16, armor: 5, speed: 70, range: 22, atkCd: 1.3, radius: 6,
    formations: ['loose', 'block', 'line'], skills: ['cleave', 'frenzy'],
    desc: '人少單兵強，大範圍揮砍專破盾兵與長槍兵；怕騎兵和弓箭。',
  },
  axeman: {
    name: '狂斧兵', short: '斧', type: 'shock', sprite: 'axeman', base: 'shieldman', count: 14,
    hp: 80, atk: 17, armor: 3, speed: 78, range: 20, atkCd: 1.1, radius: 6,
    formations: ['loose', 'block', 'column'], skills: ['frenzy', 'cleave'],
    desc: '跑得快、打得最痛、護甲最薄。狂戰時攻擊與移速大增。',
  },
  maceman: {
    name: '錘兵', short: '錘', type: 'shock', sprite: 'maceman', base: 'shieldman', count: 14,
    hp: 110, atk: 14, armor: 9, speed: 60, range: 18, atkCd: 1.3, radius: 6, dtype: 'blunt',
    formations: ['block', 'line', 'column'], skills: ['shieldbash', 'cleave'],
    desc: '重甲鈍擊兵，耐打又能暈人，適合頂在最前面撞開敵陣。',
  },
  modao: {
    name: '陌刀兵', short: '陌', type: 'shock', sprite: 'modao', base: 'pikeman', count: 14,
    hp: 100, atk: 15, armor: 8, speed: 62, range: 30, atkCd: 1.4, radius: 6,
    formations: ['line', 'block', 'column'], skills: ['brace', 'cleave'],
    desc: '長刀重步兵，橫隊時一排刀牆，騎兵和步兵都怕。',
  },
  militia: {
    name: '民兵', short: '民', type: 'pike', sprite: 'militia', base: 'pikeman', count: 30,
    hp: 50, atk: 6, armor: 1, speed: 72, range: 22, atkCd: 1.2, radius: 6,
    formations: ['loose', 'block', 'line'], skills: ['thrust', 'frenzy'],
    desc: '人多便宜、戰力低。拿來擋路、守據點、湊人數。',
  },
  engineer: {
    name: '工兵', short: '工', type: 'shield', sprite: 'engineer', base: 'shieldman', count: 16, engineer: true,
    hp: 70, atk: 7, armor: 4, speed: 66, range: 18, atkCd: 1.2, radius: 6,
    formations: ['block', 'column', 'loose'], skills: ['shieldbash', 'thrust'],
    desc: '推衝車、扛雲梯一人算兩人，攻城時最好用；打仗普通。',
  },

  /* ---------- 遠程 ---------- */
  longbowman: {
    name: '長弓兵', short: '長', type: 'archer', sprite: 'longbowman', base: 'archer', count: 16,
    hp: 45, atk: 8, armor: 1, speed: 70, range: 240, atkCd: 2.1, radius: 6,
    ranged: { speed: 280, minRange: 60 },
    formations: ['loose', 'block', 'line'], skills: ['volley', 'firearrow'],
    desc: '射程最遠的弓兵，站在後面就能壓住整條戰線。',
  },
  crossbowman: {
    name: '弩兵', short: '弩', type: 'archer', sprite: 'crossbowman', base: 'archer', count: 16,
    hp: 50, atk: 14, armor: 3, speed: 66, range: 160, atkCd: 2.6, radius: 6, pen: 0.3,
    ranged: { speed: 340, minRange: 50, flat: true },
    formations: ['line', 'block', 'loose'], skills: ['volley', 'firearrow'],
    desc: '射程短、裝填慢，但一發很痛，打重甲也有效。',
  },
  pavise: {
    name: '大盾弩手', short: '牌', type: 'archer', sprite: 'pavise', base: 'archer', count: 14,
    hp: 70, atk: 14, armor: 6, speed: 56, range: 160, atkCd: 2.8, radius: 6, frontRangedMul: 0.5, pen: 0.3,
    ranged: { speed: 340, minRange: 40, flat: true },
    formations: ['line', 'block', 'loose'], skills: ['shieldwall', 'volley'],
    desc: '背著大盾的弩手，正面擋箭，適合守陣地、守城牆。',
  },
  arquebusier: {
    name: '火槍兵', short: '銃', type: 'archer', sprite: 'arquebusier', base: 'archer', count: 16,
    hp: 50, atk: 22, armor: 2, speed: 66, range: 170, atkCd: 3.2, radius: 6, dtype: 'bullet',
    ranged: { speed: 620, minRange: 50, flat: true },
    formations: ['line', 'block', 'loose'], skills: ['volley', 'firearrow'],
    desc: '齊射爆發最高、裝填最慢，近戰很脆。',
  },
  javelineer: {
    name: '標槍兵', short: '標', type: 'archer', sprite: 'javelineer', base: 'archer', count: 16,
    hp: 60, atk: 12, armor: 3, speed: 76, range: 90, atkCd: 2.0, radius: 6,
    ranged: { speed: 220, minRange: 30 },
    formations: ['loose', 'block', 'line'], skills: ['volley', 'thrust'],
    desc: '近距離投擲，傷害高；敵人貼上來也能拿短矛刺。',
  },
  grenadier: {
    name: '擲彈兵', short: '彈', type: 'archer', sprite: 'grenadier', base: 'archer', count: 12,
    hp: 55, atk: 10, armor: 2, speed: 68, range: 110, atkCd: 3.0, radius: 6, dtype: 'blunt',
    ranged: { speed: 200, minRange: 40, splash: 28 },
    formations: ['loose', 'block', 'line'], skills: ['firearrow', 'volley'],
    desc: '丟炸彈，落點小範圍爆炸，專打擠在一起的敵人。',
  },

  /* ---------- 騎兵 ---------- */
  horsearcher: {
    name: '騎射兵', short: '射', type: 'cav', sprite: 'horsearcher', base: 'cavalry', count: 12,
    hp: 80, atk: 8, armor: 3, speed: 140, range: 170, atkCd: 1.6, radius: 9, mounted: true,
    ranged: { speed: 260, minRange: 80 },
    formations: ['loose', 'wedge', 'column'], skills: ['volley', 'flank'],
    desc: '邊跑邊射、打了就跑。追不上就別追，怕長槍兵和弓兵對射。',
  },
  heavycav: {
    name: '重甲騎兵', short: '鐵', type: 'cav', sprite: 'heavycav', base: 'cavalry', count: 10,
    hp: 150, atk: 15, armor: 12, speed: 120, range: 22, atkCd: 1.4, radius: 9, mounted: true,
    formations: ['wedge', 'column', 'loose'], skills: ['charge', 'flank'],
    desc: '人馬全甲，衝鋒最重、最耐打，但比較慢、統率貴。',
  },
};
