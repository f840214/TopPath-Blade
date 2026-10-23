/* ============ heroes.js — 武將武器（決定技能組）與裝備 ============ */
G.WEAPONS = {
  sword: {
    name: '長劍', sprite: 'look_templar',
    atk: 30, range: 34, arc: 1.6, atkCd: 0.45, dtype: 'slash',
    skills: { Q: 'spin', E: 'dash', R: 'warcry' },
    desc: '出手快，技能偏機動與指揮。',
  },
  glaive: {
    name: '長柄刀', sprite: 'look_han_general',
    atk: 40, range: 44, arc: 2.4, atkCd: 0.75, dtype: 'slash',
    skills: { Q: 'sweep', E: 'launch', R: 'whirl' },
    desc: '出手慢但範圍大，擅長清兵。',
  },
  // sprite 是沒選外觀時用的圖（綁定這個職業的第一個外觀，js/data/looks.js 的 weapon）
  shield: {
    name: '劍盾', sprite: 'look_knight', armor: 6,
    atk: 28, range: 32, arc: 1.4, atkCd: 0.5, dtype: 'slash',
    skills: { Q: 'bash', E: 'guard', R: 'rally' },
    desc: '最耐打：本身護甲 +6；盾擊暈眩、舉盾減傷，大招鼓舞全軍。',
  },
  nodachi: {
    name: '野太刀', sprite: 'look_samurai',
    atk: 46, range: 40, arc: 1.8, atkCd: 0.6, dtype: 'slash',
    skills: { Q: 'iai', E: 'tsubame', R: 'kishin' },
    desc: '單體爆發高：居合一閃穿過敵陣，大招強化自己。',
  },
  pike: {
    name: '長槍', sprite: 'look_ashigaru_taisho',
    atk: 34, range: 60, arc: 0.7, atkCd: 0.6, dtype: 'pierce',
    skills: { Q: 'pierce', E: 'pikesweep', R: 'lancecharge' },
    desc: '攻擊距離最長但範圍窄；直線穿刺、衝鋒破陣。',
  },
  musket: {
    name: '火槍', sprite: 'look_ming_officer',
    atk: 84, range: 320, arc: 0.3, atkCd: 1.05, ranged: { speed: 1000, flat: true }, dtype: 'bullet', knock: 6,
    skills: { Q: 'buckshot', E: 'roll', R: 'snipe' },
    desc: '遠程：一發傷害高、無視一半護甲（打重甲最痛），中彈會被推一下；近身用散彈轟退，後撤裝填拉開距離，大招穿甲彈貫穿一整排。',
  },
  maul: {
    name: '戰錘', sprite: 'look_jarl',
    atk: 54, range: 38, arc: 2.0, atkCd: 0.95, dtype: 'blunt',
    skills: { Q: 'quake', E: 'ram', R: 'hammerwhirl' },
    desc: '又慢又重：震地暈眩一圈、衝撞撞飛，大招旋錘。',
  },
  longbow: {
    name: '長弓', sprite: 'look_mongol',
    atk: 28, range: 340, arc: 0.3, atkCd: 0.85, ranged: { speed: 420 }, dtype: 'pierce',
    skills: { Q: 'pierceshot', E: 'arrowrain', R: 'firerain' },
    desc: '遠程：射得遠、射得快；穿透箭、箭雨，大招火雨。',
  },
};

G.HERO_BASE = { hp: 320, armor: 6, speed: 100, radius: 7 };
// 跑步（戰鬥中按住 Shift）：速度 ×mul，每秒耗 drain 點耐力；停下來 delay 秒後每秒回 regen；耗光要回到 resume 才能再跑
G.SPRINT = { stamina: 100, mul: 1.6, drain: 25, regen: 18, delay: 0.8, resume: 25 };
// 格擋（按住右鍵）：正面 arc 內受到的傷害 ×takenMul、擊退 ×knockMul，每擋一下耗「原本傷害 × staminaPerDmg」的耐力（至少 minCost）；
//   耐力耗光就破防暈眩 breakStun 秒。格擋中移動 ×speedMul、不會普攻
G.BLOCK = { arc: 2.1, takenMul: 0.2, knockMul: 0.25, staminaPerDmg: 0.35, minCost: 4, breakStun: 0.9, speedMul: 0.5 };
// 翻滾（空白鍵）：dur 秒內往移動方向（沒按方向就往後）滾 dist px，前 iframes 秒無敵；耗 cost 耐力，冷卻 cd
G.DODGE = { dist: 90, dur: 0.32, iframes: 0.28, cost: 28, cd: 0.9 };

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

/* ---------- 武將成長：屬性點、武器專精、可換技能（docs/design.md 22）---------- */
// 屬性點：每升一級 perLevel 點，自由分配；重新分配要 resetCost 金
G.HERO_ATTRS = {
  perLevel: 2, resetCost: 200,
  list: {
    str: { name: '力量', desc: '攻擊 +2%' },
    agi: { name: '敏捷', desc: '普攻速度 +1.5%、移速 +0.5%' },
    tou: { name: '韌性', desc: '生命 +12、耐力 +2' },
    arm: { name: '護甲', desc: '護甲 +0.6' },
  },
};
/** 屬性點換成武將數值的加成（G.Hero 用） */
G.attrBonus = (a = {}) => ({
  atkMul: 1 + 0.02 * (a.str || 0), atkCdMul: 1 / (1 + 0.015 * (a.agi || 0)), speedMul: 1 + 0.005 * (a.agi || 0),
  hp: 12 * (a.tou || 0), stamina: 2 * (a.tou || 0), armor: 0.6 * (a.arm || 0),
});
// 武器專精：用那把武器打仗累積（武將親手擊殺每人 xpPerKill，打贏 xpWin、打輸 xpLose）；xp 是到每一級要的累積經驗。
//   每級這把武器攻擊 +atkPerLevel；到 altAt 級可以把技能換成 G.WEAPONS[k].alt 裡的
G.MASTERY = { xp: [60, 180, 400, 800, 1500], atkPerLevel: 0.03, altAt: 3, xpPerKill: 1, xpWin: 20, xpLose: 5 };
G.masteryLevel = xp => G.MASTERY.xp.filter(v => (xp || 0) >= v).length;
// 可以換的技能（沿用其他職業的技能效果）：slot → 技能 key
Object.assign(G.WEAPONS.sword, { alt: { Q: 'sweep', E: 'launch' } });
Object.assign(G.WEAPONS.glaive, { alt: { Q: 'spin', E: 'pierce' } });
Object.assign(G.WEAPONS.shield, { alt: { Q: 'spin', E: 'dash' } });
Object.assign(G.WEAPONS.nodachi, { alt: { Q: 'dash', E: 'spin' } });
Object.assign(G.WEAPONS.pike, { alt: { Q: 'launch', E: 'sweep' } });
Object.assign(G.WEAPONS.musket, { alt: { Q: 'pierceshot', E: 'bash' } });
Object.assign(G.WEAPONS.maul, { alt: { Q: 'spin', E: 'bash' } });
Object.assign(G.WEAPONS.longbow, { alt: { E: 'roll' } });
/** 這把武器實際用的技能組：choice 是玩家選的 { Q: 'alt', ... }，專精不夠的不算 */
G.skillSetOf = (weaponKey, choice = {}, masteryXp = 0) => {
  const w = G.WEAPONS[weaponKey], out = { ...w.skills };
  if (G.masteryLevel(masteryXp) >= G.MASTERY.altAt) for (const s of ['Q', 'E', 'R']) if (choice[s] === 'alt' && w.alt && w.alt[s]) out[s] = w.alt[s];
  return out;
};

/* ---------- 裝備：耐久、打造、掉落（docs/design.md 23）---------- */
G.MATERIALS = { iron: '鐵料', leather: '皮革', steel: '精鋼' };
// 打造（鐵匠鋪）依稀有度：金幣＋材料；repair 是修滿一件從 0 修到 100 的金幣；拆解退一半材料
G.CRAFT = {
  0: { gold: 60,  iron: 3,  leather: 1, steel: 0, repair: 20 },
  1: { gold: 220, iron: 8,  leather: 4, steel: 1, repair: 60 },
  2: { gold: 700, iron: 16, leather: 8, steel: 4, repair: 150 },
};
G.GEAR = {
  maxDur: 100, stashMax: 20,
  wearWin: 5, wearLose: 10,   // 每打一場穿著的裝備掉多少耐久（演習不扣）；0 就壞掉、沒有效果
};
// 打贏的掉落：材料一定有一點（擊殺越多越多），裝備（item）、戰術書（doc，veteran.js 的 G.DOCTRINES）有機率；rare／epic 是掉到精良／史詩的機率（其餘普通）
G.LOOT = {
  city:   { item: 0.6,  doc: 0.5,  rare: 0.45, epic: 0.2,  iron: [4, 8], leather: [2, 4], steel: [1, 2] },
  raid:   { item: 0.4,  doc: 0.35, rare: 0.35, epic: 0.1,  iron: [3, 6], leather: [1, 3], steel: [0, 1], food: [10, 20] },
  bandit: { item: 0.25, doc: 0.3,  rare: 0.2,  epic: 0.03, iron: [1, 3], leather: [1, 2], steel: [0, 0], food: [15, 35] },   // food：搶回來的糧草
  match:  { item: 0.2,  doc: 0.25, rare: 0.25, epic: 0.05, iron: [1, 3], leather: [1, 2], steel: [0, 1] },   // 野戰配對打贏
  caravan: { item: 0.35, doc: 0.2, rare: 0.3, epic: 0.06, iron: [4, 8], leather: [3, 6], steel: [1, 2], food: [30, 60] },   // 劫商隊：貨車上的材料多
};
