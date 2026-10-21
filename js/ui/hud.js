/* ============ hud.js — 戰鬥介面（DOM） ============ */
G.HUD = (() => {
  const $ = id => document.getElementById(id);
  const CMD = { follow: '跟隨', hold: '駐守', attack: '進攻' };
  let toastT = null;

  function show(on) { $('hud').style.display = on ? 'block' : 'none'; $('result').style.display = 'none'; }

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.style.opacity = 1;
    clearTimeout(toastT); toastT = setTimeout(() => t.style.opacity = 0, 1600);
  }

  function update(s) {
    const p = s.player;
    $('hpFill').style.width = (Math.max(0, p.hp) / p.maxHp * 100) + '%';
    $('hpText').textContent = `${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`;
    // 技能列
    $('skills').innerHTML = ['Q', 'E', 'R'].map(k => {
      const sk = G.HERO_SKILLS[p.skillKey(k)], cd = p.skillCd[k];
      return `<div class="skill ${cd > 0 ? 'cd' : ''}"><b>${k}</b><span>${sk.name}</span>${cd > 0 ? `<i>${Math.ceil(cd)}</i>` : ''}</div>`;
    }).join('') + `<div class="skill basic"><b>J</b><span>${p.weapon.name}</span></div><div class="skill basic"><b>K</b><span>格擋</span></div>`;
    // 兵團
    $('squads').innerHTML = s.squads.map((sq, i) => {
      const sel = s.select === 'all' || s.select === i, a = sq.alive.length;
      const sk = sq.def.skills.map((k, j) => {
        const cd = sq.skillCd[k] || 0, on = sq.fx[k] > 0;
        return `<span class="usk ${cd > 0 ? 'cd' : ''} ${on ? 'on' : ''}">${'ZX'[j]} ${G.UNIT_SKILLS[k].name}${cd > 0 ? ' ' + Math.ceil(cd) : ''}</span>`;
      }).join('');
      return `<div class="sq pframe ${sel ? 'sel' : ''} ${a ? '' : 'dead'}">
        <div class="sqTop"><b>${sq.label}</b><span>${a}/${sq.def.count}</span></div>
        <div class="sqMid">${CMD[sq.cmd]}・${sq.fm.name}${sq.waypoint ? '・迂迴中' : ''}</div>
        <div class="sqSk">${sk}</div></div>`;
    }).join('') + `<div class="selHint">Tab 指揮：${s.select === 'all' ? '全軍' : `第${s.select + 1}隊`}</div>`;
    // 目標
    let obj = `${s.scenario.name}`;
    if (s.castle) {
      const g = s.castle.gate, cp = s.castle.capture;
      obj += `<div class="bar"><span>城門 ${g.hp > 0 ? (g.open ? '開啟' : Math.ceil(g.hp) + '/' + g.maxHp) : '已破'}</span><i style="width:${g.hp / g.maxHp * 100}%"></i></div>`;
      obj += `<div class="bar cap"><span>主堡奪取 ${Math.floor(cp.progress * 100)}%</span><i style="width:${cp.progress * 100}%"></i></div>`;
    }
    if (s.scenario.timeLimit) { const left = Math.max(0, s.scenario.timeLimit - s.time); obj += `<div>剩餘 ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</div>`; }
    obj += `<div>敵軍剩餘 ${s.foes}</div>`;
    $('objective').innerHTML = obj;
    $('kills').innerHTML = `擊破 <b>${s.stats.kills[0]}</b>` + (s.stats.combo > 1 ? `<div class="combo">${s.stats.combo}<small> 連擊</small></div>` : '');
    $('perf').textContent = s.perf ? `FPS ${s.perf.fps.toFixed(0)}・${s.perf.frameMs.toFixed(2)} ms・單位 ${s.perf.units}・縮放 ${s.zoom}` : '';
  }

  /** rep：G.Army.settle 的結算報告（大軍測試沒有） */
  function result(win, msg, stats, rep) {
    const r = $('result');
    r.querySelector('h2').textContent = win ? '勝利' : '戰敗';
    r.querySelector('p').textContent = `${msg}　擊破 ${stats.kills[0]}`;
    r.querySelector('.report').innerHTML = rep ? `
      <div>金幣 +${rep.gold}・武將經驗 +${rep.heroXp}${rep.heroUp ? `・<b>武將升到 Lv${rep.heroLevel}，統率上限 ${G.Army.cap()}</b>` : ''}</div>
      ${rep.squads.map(s => `<div>${s.name}：${s.before} → ${s.after} 人${s.before > s.after ? `（陣亡 ${s.before - s.after}）` : ''}・擊殺 ${s.kills}${s.up ? `・<b>升到 Lv${s.level}</b>` : ''}</div>`).join('')}` : '';
    r.className = win ? 'win' : 'lose';
    r.style.display = 'flex';
  }

  return { show, toast, update, result };
})();
