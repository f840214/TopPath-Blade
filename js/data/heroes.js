/* ============ heroes.js — 武將武器（決定技能組）與裝備 ============ */
G.WEAPONS = {
  sword: {
    name: '長劍', sprite: 'look_templar',
    atk: 30, range: 34, arc: 1.6, atkCd: 0.45,
    skills: { Q: 'spin', E: 'dash', R: 'warcry' },
    desc: '出手快，技能偏機動與指揮。',
  },
  glaive: {
    name: '長柄刀', sprite: 'look_han_general',
    atk: 40, range: 44, arc: 2.4, atkCd: 0.75,
    skills: { Q: 'sweep', E: 'launch', R: 'whirl' },
    desc: '出手慢但範圍大，擅長清兵。',
  },
  // sprite 是沒選外觀時用的圖（綁定這個職業的第一個外觀，js/data/looks.js 的 weapon）
  shield: {
    name: '劍盾', sprite: 'look_knight', armor: 6,
    atk: 28, range: 32, arc: 1.4, atkCd: 0.5,
    skills: { Q: 'bash', E: 'guard', R: 'rally' },
    desc: '最耐打：本身護甲 +6；盾擊暈眩、舉盾減傷，大招鼓舞全軍。',
  },
  nodachi: {
    name: '野太刀', sprite: 'look_samurai',
    atk: 46, range: 40, arc: 1.8, atkCd: 0.6,
    skills: { Q: 'iai', E: 'tsubame', R: 'kishin' },
    desc: '單體爆發高：居合一閃穿過敵陣，大招強化自己。',
  },
  pike: {
    name: '長槍', sprite: 'look_ashigaru_taisho',
    atk: 34, range: 60, arc: 0.7, atkCd: 0.6,
    skills: { Q: 'pierce', E: 'pikesweep', R: 'lancecharge' },
    desc: '攻擊距離最長但範圍窄；直線穿刺、衝鋒破陣。',
  },
  musket: {
    name: '火槍', sprite: 'look_ming_officer',
    atk: 66, range: 300, arc: 0.3, atkCd: 1.25, ranged: { speed: 900, flat: true },
    skills: { Q: 'buckshot', E: 'roll', R: 'snipe' },
    desc: '遠程：一發傷害高；近身用散彈轟退，後撤裝填拉開距離，大招穿甲彈貫穿一整排。',
  },
  maul: {
    name: '戰錘', sprite: 'look_jarl',
    atk: 54, range: 38, arc: 2.0, atkCd: 0.95,
    skills: { Q: 'quake', E: 'ram', R: 'hammerwhirl' },
    desc: '又慢又重：震地暈眩一圈、衝撞撞飛，大招旋錘。',
  },
  longbow: {
    name: '長弓', sprite: 'look_mongol',
    atk: 28, range: 340, arc: 0.3, atkCd: 0.85, ranged: { speed: 420 },
    skills: { Q: 'pierceshot', E: 'arrowrain', R: 'firerain' },
    desc: '遠程：射得遠、射得快；穿透箭、箭雨，大招火雨。',
  },
};

G.HERO_BASE = { hp: 320, armor: 6, speed: 100, radius: 7 };
// 跑步（戰鬥中按住 Shift）：速度 ×mul，每秒耗 drain 點耐力；停下來 delay 秒後每秒回 regen；耗光要回到 resume 才能再跑
G.SPRINT = { stamina: 100, mul: 1.6, drain: 25, regen: 18, delay: 0.8, resume: 25 };

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
