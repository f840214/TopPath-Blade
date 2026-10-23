/* ============ counters.js — 兵種克制（攻擊方 → 防守方的傷害倍率）============
 * 武將的 type 是 'hero'，對任何兵種都是 1。
 */
G.COUNTERS = {
  pike:   { pike: 1.0, shield: 0.9, shock: 0.8, archer: 1.0, cav: 1.8 },
  shield: { pike: 1.1, shield: 1.0, shock: 0.8, archer: 1.2, cav: 0.8 },
  shock:  { pike: 1.3, shield: 1.4, shock: 1.0, archer: 1.2, cav: 0.8 },   // 衝擊步兵：破盾、破槍，怕騎兵
  archer: { pike: 1.1, shield: 1.0, shock: 1.2, archer: 1.0, cav: 0.9 },  // 盾兵正面的 0.4 另算（units.js frontRangedMul）
  cav:    { pike: 0.6, shield: 0.8, shock: 1.3, archer: 1.6, cav: 1.0 },
};
G.TYPE_NAMES = { pike: '長槍', shield: '盾', shock: '衝擊步兵', archer: '遠程', cav: '騎兵' };

G.counterMul = (att, def) => (G.COUNTERS[att] && G.COUNTERS[att][def]) || 1;

/* ---------- 傷害類型 × 護甲等級（docs/design.md 21）----------
 * 傷害類型：pierce 穿刺（槍、箭）、slash 劈砍（刀劍斧）、blunt 鈍擊（錘、盾擊、爆炸）、bullet 子彈（火槍）。
 * 護甲等級看護甲值：兵 ≤3 輕、≤7 中、≥8 重；武將 ≤10 輕、≤16 中、其他重。
 * pen：破甲，計算減傷時無視這個比例的護甲。跟兵種克制表一起乘，所以倍率都壓在 0.75～1.3 之間，不要讓兩邊疊太重。
 */
G.DAMAGE_TYPES = {
  pierce: { name: '穿刺', light: 1.1, medium: 1.0, heavy: 0.85 },
  slash:  { name: '劈砍', light: 1.2, medium: 1.0, heavy: 0.75 },
  blunt:  { name: '鈍擊', light: 0.9, medium: 1.05, heavy: 1.3 },
  bullet: { name: '子彈', light: 1.0, medium: 1.1, heavy: 1.25, pen: 0.5 },
};
G.ARMOR_CLASS_NAMES = { light: '輕甲', medium: '中甲', heavy: '重甲' };
/** 兵種的傷害類型：有寫 dtype 就用；沒寫的長槍、遠程是穿刺，其他是劈砍 */
G.dtypeOf = def => def.dtype || (def.type === 'pike' || def.ranged ? 'pierce' : 'slash');
G.armorClass = (armor, hero) => hero ? (armor <= 10 ? 'light' : armor <= 16 ? 'medium' : 'heavy') : (armor <= 3 ? 'light' : armor <= 7 ? 'medium' : 'heavy');
