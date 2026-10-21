/* ============ heroes.js — 武將武器（決定技能組）與裝備 ============ */
G.WEAPONS = {
  sword: {
    name: '長劍', sprite: 'hero_sword',
    atk: 30, range: 34, arc: 1.6, atkCd: 0.45,
    skills: { Q: 'spin', E: 'dash', R: 'warcry' },
    desc: '出手快，技能偏機動與指揮。',
  },
  glaive: {
    name: '長柄刀', sprite: 'hero_glaive',
    atk: 40, range: 44, arc: 2.4, atkCd: 0.75,
    skills: { Q: 'sweep', E: 'launch', R: 'whirl' },
    desc: '出手慢但範圍大，擅長清兵。',
  },
};

G.HERO_BASE = { hp: 320, armor: 6, speed: 100, radius: 7 };

// 稀有度：0 普通、1 精良、2 史詩
G.RARITY = [
  { name: '普通', color: '#d8d8d8' },
  { name: '精良', color: '#5aa9ff' },
  { name: '史詩', color: '#c27bff' },
];

G.EQUIP_SLOTS = [
  { key: 'helm',   name: '頭盔' },
  { key: 'armor',  name: '胸甲' },
  { key: 'gloves', name: '護手' },
  { key: 'cape',   name: '披風' },
];

/* stats 可用欄位：hp、armor、atk（武將攻擊 %）、cdr（技能冷卻縮短 %）、
 * squadAtk（兵團攻擊 %）、squadSpeed（兵團移速 %）、squadArmor（兵團護甲） */
G.EQUIPMENT = {
  helm: [
    { id: 'helm_iron',    name: '鐵盔',       rarity: 0, stats: { hp: 20, armor: 2 } },
    { id: 'helm_plume',   name: '紅羽大盔',   rarity: 1, stats: { hp: 40, armor: 3 } },
    { id: 'helm_lion',    name: '獅鬃戰盔',   rarity: 2, stats: { hp: 50, armor: 4, squadAtk: 5 } },
  ],
  armor: [
    { id: 'armor_mail',   name: '鎖子甲',     rarity: 0, stats: { hp: 40, armor: 4 } },
    { id: 'armor_plate',  name: '板甲',       rarity: 1, stats: { hp: 70, armor: 7 } },
    { id: 'armor_gothic', name: '哥德式全身甲', rarity: 2, stats: { hp: 90, armor: 9 } },
  ],
  gloves: [
    { id: 'gloves_leather', name: '皮護手',   rarity: 0, stats: { atk: 5 } },
    { id: 'gloves_steel',   name: '鋼護手',   rarity: 1, stats: { atk: 10, armor: 1 } },
    { id: 'gloves_swift',   name: '迅捷護手', rarity: 2, stats: { atk: 8, cdr: 15 } },
  ],
  cape: [
    { id: 'cape_wool',    name: '羊毛披風',   rarity: 0, stats: { hp: 10 } },
    { id: 'cape_banner',  name: '軍旗披風',   rarity: 1, stats: { squadAtk: 10 } },
    { id: 'cape_marshal', name: '元帥披風',   rarity: 2, stats: { squadAtk: 10, squadSpeed: 10, squadArmor: 2 } },
  ],
};
