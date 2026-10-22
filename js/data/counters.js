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
