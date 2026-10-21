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
