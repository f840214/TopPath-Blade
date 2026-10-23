/* ============ veteran.js — 老兵技能樹（docs/design.md 11 節）============
 * 每個兵種兩條分支、每條 5 節，同一條要依序點；兵團每升一級得 1 點（Lv10 共 9 點，點不滿兩條）。
 * mod 欄位（由 G.Army.modsOf 合併，名稱以 Mul 結尾的相乘，其他相加）：
 *   hpMul、atkMul、speedMul、rangeMul、armor
 *   vsMul：{ 兵種 type: 對該兵種的傷害倍率 }
 *   cdMul／durAdd／dmgMul／stunAdd／wavesAdd／radiusMul：{ 兵團技能 key: 值 }
 *   chargeMul（衝鋒傷害）、reflectMul（長槍陣反傷）、braceTakenMul（騎兵撞上長槍陣受到的反傷）、
 *   frontRangedMul（盾兵正面受遠程）
 */
G.VETERAN = {
  pikeman: [
    { name: '拒馬', nodes: [
      { name: '破騎',     desc: '對騎兵傷害 +15%',   mod: { vsMul: { cav: 1.15 } } },
      { name: '久守',     desc: '長槍陣持續 +2 秒',  mod: { durAdd: { brace: 2 } } },
      { name: '倒刺',     desc: '長槍陣反傷 +50%',   mod: { reflectMul: 1.5 } },
      { name: '獵騎',     desc: '對騎兵傷害 +15%',   mod: { vsMul: { cav: 1.15 } } },
      { name: '速成陣',   desc: '長槍陣冷卻 -30%',   mod: { cdMul: { brace: 0.7 } } },
    ] },
    { name: '推進', nodes: [
      { name: '銳鋒',     desc: '攻擊 +6%',          mod: { atkMul: 1.06 } },
      { name: '急行',     desc: '移速 +8%',          mod: { speedMul: 1.08 } },
      { name: '重刺',     desc: '突刺傷害 +30%',     mod: { dmgMul: { thrust: 1.3 } } },
      { name: '堅韌',     desc: '生命 +10%',         mod: { hpMul: 1.1 } },
      { name: '連刺',     desc: '突刺冷卻 -30%',     mod: { cdMul: { thrust: 0.7 } } },
    ] },
  ],
  shieldman: [
    { name: '鐵壁', nodes: [
      { name: '厚盾',     desc: '護甲 +3',              mod: { armor: 3 } },
      { name: '長牆',     desc: '盾牆持續 +3 秒',       mod: { durAdd: { shieldwall: 3 } } },
      { name: '擋箭',     desc: '正面受遠程傷害再 -30%', mod: { frontRangedMul: 0.7 } },
      { name: '壯骨',     desc: '生命 +12%',            mod: { hpMul: 1.12 } },
      { name: '速結陣',   desc: '盾牆冷卻 -30%',        mod: { cdMul: { shieldwall: 0.7 } } },
    ] },
    { name: '衝陣', nodes: [
      { name: '盾鋒',     desc: '攻擊 +8%',          mod: { atkMul: 1.08 } },
      { name: '震盪',     desc: '盾擊暈眩 +0.5 秒',  mod: { stunAdd: { shieldbash: 0.5 } } },
      { name: '疾步',     desc: '移速 +10%',         mod: { speedMul: 1.1 } },
      { name: '猛擊',     desc: '盾擊傷害 +40%',     mod: { dmgMul: { shieldbash: 1.4 } } },
      { name: '連擊',     desc: '盾擊冷卻 -30%',     mod: { cdMul: { shieldbash: 0.7 } } },
    ] },
  ],
  archer: [
    { name: '射術', nodes: [
      { name: '強弓',     desc: '攻擊 +8%',          mod: { atkMul: 1.08 } },
      { name: '遠射',     desc: '射程 +15%',         mod: { rangeMul: 1.15 } },
      { name: '連珠',     desc: '齊射多一輪',        mod: { wavesAdd: { volley: 1 } } },
      { name: '穿甲',     desc: '攻擊 +8%',          mod: { atkMul: 1.08 } },
      { name: '快手',     desc: '齊射冷卻 -30%',     mod: { cdMul: { volley: 0.7 } } },
    ] },
    { name: '火攻', nodes: [
      { name: '廣焰',     desc: '火箭範圍 +20%',     mod: { radiusMul: { firearrow: 1.2 } } },
      { name: '久燃',     desc: '火箭持續 +2 秒',    mod: { durAdd: { firearrow: 2 } } },
      { name: '烈火',     desc: '火箭燒傷 +40%',     mod: { dmgMul: { firearrow: 1.4 } } },
      { name: '皮甲',     desc: '生命 +10%',         mod: { hpMul: 1.1 } },
      { name: '火雨',     desc: '火箭冷卻 -30%',     mod: { cdMul: { firearrow: 0.7 } } },
    ] },
  ],
  cavalry: [
    { name: '衝擊', nodes: [
      { name: '重騎',     desc: '衝鋒傷害 +15%',     mod: { chargeMul: 1.15 } },
      { name: '長驅',     desc: '衝鋒持續 +1 秒',    mod: { durAdd: { charge: 1 } } },
      { name: '踐踏',     desc: '衝鋒傷害 +15%',     mod: { chargeMul: 1.15 } },
      { name: '馬鎧',     desc: '撞上長槍陣的反傷 -40%', mod: { braceTakenMul: 0.6 } },
      { name: '再衝',     desc: '衝鋒冷卻 -30%',     mod: { cdMul: { charge: 0.7 } } },
    ] },
    { name: '游擊', nodes: [
      { name: '輕騎',     desc: '移速 +8%',          mod: { speedMul: 1.08 } },
      { name: '獵弓手',   desc: '對弓兵傷害 +20%',   mod: { vsMul: { archer: 1.2 } } },
      { name: '神出',     desc: '迂迴冷卻 -30%',     mod: { cdMul: { flank: 0.7 } } },
      { name: '耐戰',     desc: '生命 +10%',         mod: { hpMul: 1.1 } },
      { name: '鎖甲',     desc: '護甲 +3',           mod: { armor: 3 } },
    ] },
  ],
};
G.VETERAN_RESET_COST = 50;

/* 新兵種（v0.6）的老兵樹：「攻勢」強化第一個技能和攻擊，「堅守」強化第二個技能和生存；
 * 遠程把攻擊換成射程、騎兵換成移速。之後要做專屬分支再一個一個寫。 */
(() => {
  const skillNode = (k, tag) => {
    const S = G.UNIT_SKILLS[k], n = S.name;
    return S.dur ? { name: `${tag}${n}`, desc: `${n}持續 +2 秒`, mod: { durAdd: { [k]: 2 } } }
      : S.dmgMul ? { name: `重${n}`, desc: `${n}傷害 +30%`, mod: { dmgMul: { [k]: 1.3 } } }
      : { name: `快${n}`, desc: `${n}冷卻 -20%`, mod: { cdMul: { [k]: 0.8 } } };
  };
  for (const [key, u] of Object.entries(G.UNITS)) {
    if (G.VETERAN[key]) continue;
    const [s1, s2] = u.skills, ranged = !!u.ranged, mounted = !!u.mounted;
    G.VETERAN[key] = [
      { name: '攻勢', nodes: [
        { name: '銳鋒', desc: '攻擊 +6%', mod: { atkMul: 1.06 } },
        skillNode(s1, '久'),
        ranged ? { name: '遠射', desc: '射程 +12%', mod: { rangeMul: 1.12 } } : mounted ? { name: '疾馳', desc: '移速 +8%', mod: { speedMul: 1.08 } } : { name: '猛攻', desc: '攻擊 +6%', mod: { atkMul: 1.06 } },
        { name: '老練', desc: '攻擊 +6%', mod: { atkMul: 1.06 } },
        { name: `快${G.UNIT_SKILLS[s1].name}`, desc: `${G.UNIT_SKILLS[s1].name}冷卻 -30%`, mod: { cdMul: { [s1]: 0.7 } } },
      ] },
      { name: '堅守', nodes: [
        { name: '厚甲', desc: '護甲 +2', mod: { armor: 2 } },
        { name: '堅韌', desc: '生命 +10%', mod: { hpMul: 1.1 } },
        skillNode(s2, '長'),
        { name: '鐵骨', desc: '生命 +10%', mod: { hpMul: 1.1 } },
        { name: `快${G.UNIT_SKILLS[s2].name}`, desc: `${G.UNIT_SKILLS[s2].name}冷卻 -30%`, mod: { cdMul: { [s2]: 0.7 } } },
      ] },
    ];
  }
})();

/* ---------- 戰術書（兵團詞綴，docs/design.md 24）----------
 * 掉落取得，插在兵團的欄位上（Lv1 兩格、Lv6 三格），效果跟老兵技能一樣是 mod（G.Army.modsOf 一起合併）。
 * allCdMul：所有兵團技能的冷卻。rarity 跟裝備同一套（G.RARITY）。
 */
G.DOCTRINES = {
  d_atk:    { name: '銳兵書', rarity: 0, desc: '攻擊 +5%',             mod: { atkMul: 1.05 } },
  d_hp:     { name: '堅守書', rarity: 0, desc: '生命 +6%',             mod: { hpMul: 1.06 } },
  d_spd:    { name: '疾行書', rarity: 0, desc: '移速 +6%',             mod: { speedMul: 1.06 } },
  d_armor:  { name: '鐵甲書', rarity: 0, desc: '護甲 +1',              mod: { armor: 1 } },
  d_vcav:   { name: '破騎書', rarity: 1, desc: '對騎兵傷害 +12%',      mod: { vsMul: { cav: 1.12 } } },
  d_vinf:   { name: '破陣書', rarity: 1, desc: '對長槍、盾兵傷害 +10%', mod: { vsMul: { pike: 1.1, shield: 1.1 } } },
  d_varch:  { name: '衝陣書', rarity: 1, desc: '對遠程傷害 +12%',      mod: { vsMul: { archer: 1.12 } } },
  d_range:  { name: '遠射書', rarity: 1, desc: '射程 +8%（遠程兵）',   mod: { rangeMul: 1.08 } },
  d_charge: { name: '鐵騎書', rarity: 1, desc: '衝鋒傷害 +15%（騎兵）', mod: { chargeMul: 1.15 } },
  d_cd:     { name: '精練書', rarity: 2, desc: '兵團技能冷卻 -15%',    mod: { allCdMul: 0.85 } },
  d_elite:  { name: '精銳書', rarity: 2, desc: '攻擊 +8%、生命 +8%',   mod: { atkMul: 1.08, hpMul: 1.08 } },
  d_iron:   { name: '不動書', rarity: 2, desc: '護甲 +2、生命 +5%',    mod: { armor: 2, hpMul: 1.05 } },
};
G.DOCTRINE_SLOTS = lv => lv >= 6 ? 3 : 2;
G.DOCTRINE_MAX = 30;   // 書庫最多幾本
