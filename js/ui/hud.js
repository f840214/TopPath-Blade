/* ============ hud.js — 戰鬥介面（DOM） ============ */
G.HUD = (() => {
  const $ = id => document.getElementById(id);
  const CMD = { follow: '跟隨', hold: '駐守', attack: '進攻' };
  let toastT = null;

  function show(on) { $('hud').style.display = on ? 'block' : 'none'; $('result').style.display = 'none'; if (!on) $('hurt').style.opacity = 0; }

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.style.opacity = 1;
    clearTimeout(toastT); toastT = setTimeout(() => t.style.opacity = 0, 1600);
  }

  /** 開戰的標題卡：場景名稱＋副標，2.4 秒後淡出 */
  let introT = null;
  function intro(title, sub) {
    const el = $('intro'); $('introTitle').textContent = title; $('introSub').textContent = sub || '';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(introT); introT = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function update(s) {
    const p = s.player;
    // 血少時畫面四周泛紅（30% 以下越來越紅）
    $('hurt').style.opacity = p.dead ? 0 : Math.max(0, Math.min(1, (0.3 - p.hp / p.maxHp) / 0.3));
    $('hpFill').style.width = (Math.max(0, p.hp) / p.maxHp * 100) + '%';
    $('hpText').textContent = `${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`;
    // 技能列
    $('skills').innerHTML = ['Q', 'E', 'R'].map(k => {
      const sk = G.HERO_SKILLS[p.skillKey(k)], cd = p.skillCd[k];
      return `<div class="skill ${cd > 0 ? 'cd' : ''}"><b>${k}</b><span>${sk.name}</span>${cd > 0 ? `<i>${Math.ceil(cd)}</i>` : ''}</div>`;
    }).join('') + `<div class="skill basic"><b>自動</b><span>${p.weapon.name}</span></div>`;
    // 兵團
    $('squads').innerHTML = s.squads.map((sq, i) => {
      const sel = s.select === 'all' || s.select === i, a = sq.alive.length;
      const sk = sq.def.skills.map((k, j) => {
        const cd = sq.skillCd[k] || 0, on = sq.fx[k] > 0;
        return `<span class="usk ${cd > 0 ? 'cd' : ''} ${on ? 'on' : ''}">${'ZX'[j]} ${G.UNIT_SKILLS[k].name}${cd > 0 ? ' ' + Math.ceil(cd) : ''}</span>`;
      }).join('');
      return `<div class="sq pframe ${sel ? 'sel' : ''} ${a ? '' : 'dead'}">
        <div class="sqTop"><b>${sq.label}</b><span>${a}/${sq.def.count}</span></div>
        <div class="mor ${sq.rout > 0 ? 'rout' : ''}"><i style="width:${Math.round(sq.morale ?? 100)}%"></i><span>${sq.rout > 0 ? '潰散中' : '士氣 ' + Math.round(sq.morale ?? 100)}</span></div>
        <div class="sqMid">${sq.crew ? (sq.crew.kind === 'ram' ? '推衝車' : '扛雲梯') + '（B 放下）' : `${CMD[sq.cmd]}・${sq.fm.name}${sq.waypoint ? '・迂迴中' : ''}`}</div>
        <div class="sqSk">${sk}</div></div>`;
    }).join('') + `<div class="selHint">${s.squads.length ? '' : '隨身兵團全滅，到補給點（T）換下一支・'}後備 ${s.reserve.filter(r => r.men > 0).length} 支</div>`
      + (s.field.length ? `<div class="selHint">配置兵團 ${s.field.filter(f => f.alive.length).length} 支：<b>${s.field[0].order === 'attack' ? '進攻' : '防守'}</b></div>` : '');
    // 指揮列：選指揮隨身或配置兵團；按鈕下命令；在地面上左鍵移動、右鍵進攻
    const fieldN = s.field.filter(f => f.alive.length).length, escN = s.squads.filter(q => q.alive.length).length, grp = s.group;
    const cb = $('cmdBar'), html = `<div class="cbTabs"><button data-o="group" data-g="escort" class="${grp === 'escort' ? 'on' : ''}">隨身 <small>${escN}</small></button><button data-o="group" data-g="field" class="${grp === 'field' ? 'on' : ''}" ${fieldN ? '' : 'disabled'}>配置 <small>${fieldN}</small></button></div>`
      + `<div class="cbBtns">${grp === 'escort' ? '<button data-o="follow">跟隨</button>' : ''}<button data-o="attack">進攻</button><button data-o="hold">駐守</button></div>`
      + `<small class="cbHint">左鍵點地面：移動到那裡　右鍵：往那裡進攻</small>`;
    if (cb.dataset.h !== html) { cb.innerHTML = html; cb.dataset.h = html; }
    if (!cb.dataset.bound) { cb.dataset.bound = 1; cb.addEventListener('mousedown', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; e.preventDefault(); G.Input.order(b.dataset.o === 'group' ? { a: 'group', g: b.dataset.g } : { a: b.dataset.o }); }); }
    // 補給點換兵選單
    const sp = $('supply');
    sp.style.display = s.supplyOpen ? 'block' : 'none';
    if (s.supplyOpen) sp.innerHTML = `<b>補給點・換隨身兵團</b>${s.supplyCd > 0 ? `<small>冷卻 ${Math.ceil(s.supplyCd)} 秒</small>` : ''}`
      + s.reserve.filter(r => r.men > 0).map((r, i) => `<div><kbd>${i + 1}</kbd> ${G.UNITS[r.type].name}${r.level > 1 ? ` Lv${r.level}` : ''}　${r.men}/${G.UNITS[r.type].count}</div>`).join('')
      + '<small>數字鍵換上・T 關閉</small>';
    // 目標
    let obj = `${s.scenario.name}`;
    if (s.castle) {
      const g = s.castle.gate, cp = s.castle.capture, mine = s.castle.defender !== 0;
      obj += `<div class="bar"><span>城門 ${g.hp > 0 ? (g.open ? '開啟' : Math.ceil(g.hp) + '/' + g.maxHp) : '已破'}</span><i style="width:${g.hp / g.maxHp * 100}%"></i></div>`;
      // 據點階段：外城 → 內城 → 主堡，已佔下的打勾、目前這個亮起來
      obj += `<div class="stages">${s.castle.points.map(p => `<span class="${p.taken ? 'done' : p === cp ? 'act' : ''}">${p.taken ? '✔' : ''}${p.name}</span>`).join('<i>→</i>')}</div>`;
      if (cp) obj += `<div class="bar cap ${mine ? 'ours' : ''}"><span>${cp.name}${mine ? '奪取' : '失守'} ${Math.floor(cp.progress * 100)}%</span><i style="width:${cp.progress * 100}%"></i></div>`;
    }
    if (p.dead && p.respawnT !== undefined) obj += `<div class="respawn">${Math.ceil(p.respawnT)} 秒後重生</div>`;
    if (s.scenario.timeLimit) { const left = Math.max(0, s.scenario.timeLimit - s.time); obj += `<div>剩餘 ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</div>`; }
    obj += `<div>敵軍剩餘 ${s.foes}</div>`;
    $('objective').innerHTML = obj;
    $('kills').innerHTML = `擊破 <b>${s.stats.kills[0]}</b>` + (s.stats.combo > 1 ? `<div class="combo">${s.stats.combo}<small> 連擊</small></div>` : '');
    $('perf').textContent = s.perf ? `FPS ${s.perf.fps.toFixed(0)}・${s.perf.frameMs.toFixed(2)} ms・單位 ${s.perf.units}・縮放 ${s.zoom}` : '';
  }

  /** rep：伺服器結算報告的 Promise（G.Army.finishBattle；大軍測試是 null） */
  function result(win, msg, stats, rep) {
    const r = $('result'), box = r.querySelector('.report');
    r.querySelector('h2').textContent = win ? '勝利' : '戰敗';
    r.querySelector('p').textContent = `${msg}　擊破 ${stats.kills[0]}`;
    box.innerHTML = rep ? '<div>結算中…</div>' : '';
    Promise.resolve(rep).then(rep => {
      if (!rep) { box.innerHTML = ''; return; }
      if (rep.drill) { box.innerHTML = '<div>演習：不計傷亡、不給獎勵</div>'; return; }
      box.innerHTML = `
        ${rep.tooFast ? '<div class="bad">戰鬥時間太短，伺服器不認這場勝利</div>' : ''}
        <div>金幣 +${rep.gold}・武將經驗 +${rep.heroXp}${rep.heroUp ? `・<b>武將升到 Lv${rep.heroLevel}，統率上限 ${G.Army.cap()}</b>` : ''}</div>
        ${rep.squads.map(s => `<div>${s.name}：${s.before} → ${s.after} 人${s.before > s.after ? `（陣亡 ${s.before - s.after}）` : ''}・擊殺 ${s.kills}${s.up ? `・<b>升到 Lv${s.level}</b>` : ''}</div>`).join('')}`;
    });
    r.className = win ? 'win' : 'lose';
    r.style.display = 'flex';
  }

  /** 結算畫面下方的按鈕：[[按鍵 code, 文字]]；點按鈕等於按那個鍵 */
  function resultButtons(list) {
    const box = document.querySelector('#result .resBtns'), label = { Escape: 'Esc', KeyR: 'R' };
    box.innerHTML = list.map(([code, text]) => `<button type="button" class="resBtn" data-code="${code}"><kbd>${label[code] || code}</kbd>${text}</button>`).join('');
    box.onclick = e => {
      const b = e.target.closest('[data-code]'); if (!b) return;
      const code = b.dataset.code;
      dispatchEvent(new KeyboardEvent('keydown', { code, key: code })); setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code, key: code })), 50);
    };
  }
  return { show, toast, update, result, resultButtons, intro };
})();
