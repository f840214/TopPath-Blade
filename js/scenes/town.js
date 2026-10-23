/* ============ town.js — 城內場景（登入後、打完仗回到這裡）============
 * 武將在城裡走動（WASD），走到有名牌的建築門口按 Enter 打開對應的面板（G.Menu.openPanel），Esc 關掉。
 * 城的配置在 js/data/town-main.js（G.TOWNS.main）：城牆、城門、街區、建築；地面、碰撞、尋路沿用 G.Map / G.Nav。
 * 主迴圈在 G.Game（state 'town' 時呼叫這裡的 update / draw）；介面是 #townHud（DOM）。
 */
G.Town = (() => {
  const $ = id => document.getElementById(id);
  let town = null, hero = null, npcs = [], near = null, cam = { x: 0, y: 0 }, zoom = 1.5, t = 0;

  let city = 'capital';   // 目前在哪座城（大地圖的城池 id），出城時從這座城的城門出去
  /** 進城：建地圖、放武將和城裡的人；msg 是要提示的話（例如戰後結算）；o：{ key 城內配置, name 城名, city 城池 id } */
  function enter(msg, o = {}) {
    G.World.leave();
    G.useScale('battle');
    town = { ...G.TOWNS[o.key || 'main'], key: o.key || 'main', city: o.city || null }; if (o.name) town.name = o.name;   // city：大地圖上哪座城（在自己的城募兵打折）
    if (town.size) G.CONFIG.world = { ...G.CONFIG.world, ...town.size };   // 城內比戰場小
    city = o.city || 'capital';
    const lo = G.Menu.loadout(), w = town.wall;
    G.FX.reset(); G.Combat.reset(); G.Siege.reset([]);
    G.Map.setupCastle({ wallY: w.wallY, gateX: w.gateX, gateHp: 1, towers: w.towers, walls: [], points: [], town: o.key || 'main', defender: 0 });
    G.Map.buildGround(3, [{ x: 0, y: 0, w: G.CONFIG.world.w, h: w.wallY }, { x: w.gateX - 60, y: w.wallY, w: 120, h: G.CONFIG.world.h }], [], town.roads, { cacheKey: `town:${town.key}` });   // 每座城的地面固定，畫一次就留著
    // 閒下來時先把大地圖的地面畫好，第一次出城才不會卡
    (window.requestIdleCallback || (f => setTimeout(f, 1200)))(() => G.World.prebuild(), { timeout: 4000 });
    hero = new G.Hero(0, lo.weapon, lo.equip, town.spawn.x, town.spawn.y, G.Army.heroLevel());
    hero.look = G.SPRITE_META[lo.look] ? lo.look : null;
    hero.name = lo.name || '主帥'; hero.face = -Math.PI / 2;
    zoom = G.CONFIG.zoom;
    spawnNpcs();
    G.Net.setScene(`town:${city}`, hero.x, hero.y);
    G.Army.collectIncome();
    G.Game.toTown();
    G.HUD.show(false);
    $('townHud').style.display = 'block';
    renderHud();
    if (msg) G.HUD.toast(msg);
  }
  function leave() { $('townHud').style.display = 'none'; G.Menu.closePanel(); }

  /* ---------- 城裡的人：城門兩個守衛，街上幾個走來走去的士兵 ---------- */
  function spawnNpcs() {
    const g = town.gate, sprites = ['pikeman', 'shieldman', 'archer'];
    npcs = [
      { sprite: 'shieldman', x: g.x - 70, y: g.y - 20, face: Math.PI / 2, guard: true },
      { sprite: 'shieldman', x: g.x + 70, y: g.y - 20, face: Math.PI / 2, guard: true },
    ];
    for (let i = 0; i < 10; i++) {
      const p = streetPoint();
      npcs.push({ sprite: sprites[i % 3], x: p.x, y: p.y, face: 0, goal: streetPoint(), wait: Math.random() * 3 });
    }
    for (const n of npcs) Object.assign(n, { radius: 6, animT: Math.random(), moving: false });
  }
  /** 這個點會不會被房子的圖蓋住（圖比腳下的範圍高，站在屋頂後面看起來像卡在牆裡） */
  function behindArt(x, y) {
    const k = G.CONFIG.artScale;
    return town.buildings.some(b => {
      if (!b.fw) return false;
      const im = G.Map.artFor(b), w = (im.naturalWidth || b.fw / 0.85 / k) * k, h = (im.naturalHeight || 100) * k;
      return Math.abs(x - b.x) < w / 2 + 14 && y > b.y - h - 10 && y < b.y + 14;
    });
  }
  /** 隨機找一個街上沒被擋住的點 */
  function streetPoint() {
    for (let i = 0; i < 40; i++) {
      const x = G.U.rand(60, G.CONFIG.world.w - 60), y = G.U.rand(60, town.wall.wallY - 60);
      if (!G.Map.blocked(x, y) && !G.Map.blocked(x, y - 12) && !behindArt(x, y)) return { x, y };
    }
    return { ...town.spawn };
  }

  /* ---------- 每幀 ---------- */
  function update(dt) {
    t += dt;
    const I = G.Input, panel = G.Menu.panelOpen();
    if (!panel && I.pressed('Tab')) toggleMenu();
    if (!panel && I.pressed('Slash')) G.Net.focusChat();
    // 好友從清單邀請組隊：在城裡也能按 Y 接受、N 拒絕（對決要在大地圖上才能接）
    if (!panel && G.Net.request && G.Net.request.kind === 'party' && (I.pressed('KeyY') || I.pressed('KeyN'))) G.Net.answer(I.pressed('KeyY'));
    if (!panel && I.pressed('KeyJ') && !G.Net.acceptInvite(res => enter(res ? (res.win ? '勝利！' : '戰敗') : '撤退', { key: town.key || 'main', name: town.name, city }))) G.HUD.toast('沒有可以加入的戰鬥');
    // 武將走動（面板開著時不動）
    let mx = 0, my = 0;
    if (!panel) {
      mx = (I.down('KeyD') ? 1 : 0) - (I.down('KeyA') ? 1 : 0);
      my = (I.down('KeyS') ? 1 : 0) - (I.down('KeyW') ? 1 : 0);
    }
    hero.animT += dt;
    if (mx || my) {
      const l = Math.hypot(mx, my);
      hero.x += mx / l * hero.speed * 1.2 * dt; hero.y += my / l * hero.speed * 1.2 * dt;
      hero.face = Math.atan2(my, mx); hero.moving = true;
    } else hero.moving = false;
    clampStep(hero);
    G.Net.pos(hero.x, hero.y, hero.face, hero.moving); G.Net.update(dt);
    for (const n of npcs) updateNpc(n, dt);
    // 門口：離哪個有名牌的建築（或城門）最近
    near = null; let bd = 64;
    for (const b of doors()) { const d = Math.hypot(hero.x - b.dx, hero.y - b.dy); if (d < bd) { bd = d; near = b; } }
    if (!panel) {
      if (near && I.pressed('Enter')) { if (near.role === 'gate') return exitCity(); G.Menu.openPanel(near.role, near.label); }
      if (I.pressed('Equal')) stepZoom(1);
      if (I.pressed('Minus')) stepZoom(-1);
    } else if (I.pressed('Escape')) G.Menu.closePanel();
    renderHud();
  }
  /** 出城：到大地圖上這座城的城門外 */
  function exitCity() {
    const c = G.WORLD.cities.find(c => c.id === city);
    G.Menu.closePanel(); leave();
    G.World.enter({ x: c.x, y: c.y + 80 }, `離開${c.name}`);
  }
  function stepZoom(d) { const L = G.CONFIG.zoomLevels; zoom = L[G.U.clamp(L.indexOf(zoom) + d, 0, L.length - 1)]; }
  /** 有名牌的建築與城門：門口的位置（dx, dy） */
  function doors() {
    const out = town.buildings.filter(b => b.role).map(b => ({ ...b, dx: b.x, dy: b.y + 14 }));
    out.push({ ...town.gate, dx: town.gate.x, dy: town.gate.y });
    return out;
  }
  /** 推出牆和建築、限制在地圖內 */
  function clampStep(u) {
    u.x = G.U.clamp(u.x, 8, G.CONFIG.world.w - 8); u.y = G.U.clamp(u.y, 8, town.wall.wallY);
    G.Map.resolve(u);
  }
  function updateNpc(n, dt) {
    n.animT += dt;
    if (n.guard) return;
    if (n.wait > 0) { n.wait -= dt; n.moving = false; return; }
    const r = G.Map.route(n, n.goal.x, n.goal.y), dx = r.x - n.x, dy = r.y - n.y, d = Math.hypot(dx, dy);
    if (Math.hypot(n.goal.x - n.x, n.goal.y - n.y) < 10) { n.goal = streetPoint(); n.wait = G.U.rand(1, 5); return; }
    const sp = 45;
    n.x += dx / (d || 1) * sp * dt; n.y += dy / (d || 1) * sp * dt; n.face = Math.atan2(dy, dx); n.moving = true;
    clampStep(n);
    // 卡住了（1.5 秒走不到 12px，通常是頂在房子邊）：換一個目的地
    n.stuckT = (n.stuckT || 0) + dt;
    if (n.stuckT > 1.5) {
      if (Math.hypot(n.x - (n.sx ?? n.x), n.y - (n.sy ?? n.y)) < 12) { n.goal = streetPoint(); n.wait = G.U.rand(0.5, 2); }
      n.stuckT = 0; n.sx = n.x; n.sy = n.y;
    }
  }

  /* ---------- 繪製 ---------- */
  function draw() {
    const ctx = G.Render.ctx, vw = G.Render.width / zoom, vh = G.Render.height / zoom, W = G.CONFIG.world;
    cam.x = G.U.clamp(hero.x - vw / 2, 0, Math.max(0, W.w - vw));
    cam.y = G.U.clamp(hero.y - vh / 2, 0, Math.max(0, W.h - vh));
    G.Render.begin(zoom, Math.round(-cam.x * zoom), Math.round(-cam.y * zoom));
    G.Map.drawGround();
    // 晚上城裡的路燈、建築門口亮起暖光
    const n = G.Daylight.night;
    if (n > 0.05) for (const b of town.buildings) {
      if (b.art === 'lamp') G.Render.zone(b.x, b.y - 8, 70, 44, 0xffb060, 0.5 * n);
      else if (b.label) G.Render.zone(b.x, b.y + 6, 60, 26, 0xffa050, 0.35 * n);
    }
    const view = { x: cam.x, y: cam.y, w: vw, h: vh }, list = [];
    list.push({ y: hero.y, draw: c => hero.draw(c) }, ...G.Net.drawables(false));
    for (const n of npcs) if (n.x > cam.x - 40 && n.x < cam.x + vw + 40 && n.y > cam.y - 40 && n.y < cam.y + vh + 60) {
      list.push({ y: n.y, draw: () => G.Sprites.draw(n.sprite, n.moving ? 'Walk' : 'Idle', n.face, n.moving ? n.animT : 0, n.x, n.y) });
      G.Render.shadow(n.x, n.y, 7, 3, 0.25);
    }
    list.push(...G.Map.wallDrawables(view));
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw(ctx);
    drawLabels(ctx, view);
    G.Render.screen();
    G.Render.end();
  }
  /** 建築名牌（紅底金字）；武將在門口時下面加「Enter 進入」 */
  function drawLabels(ctx, v) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of doors()) {
      if (b.dx < v.x - 100 || b.dx > v.x + v.w + 100 || b.dy < v.y - 40 || b.dy > v.y + v.h + 200) continue;
      const im = b.art && G.Map.artFor(b), h = im && im.naturalHeight ? im.naturalHeight * G.CONFIG.artScale : 60;
      const y = Math.round((b.art ? b.y - h - 6 : b.y - 98)), w = b.label.length * 9 + 18;
      // 名牌：深色底、上下淡金細線、兩側紅色小菱形
      ctx.fillStyle = 'rgba(12,13,15,0.88)'; ctx.fillRect(b.dx - w / 2, y - 7, w, 14);
      ctx.fillStyle = '#a8874f'; ctx.fillRect(b.dx - w / 2, y - 7, w, 1); ctx.fillRect(b.dx - w / 2, y + 6, w, 1);
      ctx.fillStyle = '#7a241c'; ctx.fillRect(b.dx - w / 2 - 4, y - 2, 4, 4); ctx.fillRect(b.dx + w / 2, y - 2, 4, 4);
      ctx.font = 'bold 9px "Cubic11", system-ui'; ctx.fillStyle = '#e8d8ae'; ctx.fillText(b.label, b.dx, y + 0.5);
      if (b === near || (near && near.label === b.label && near.dx === b.dx)) {
        const py = b.dy + 14 + Math.sin(t * 5) * 1.5;
        ctx.font = 'bold 8px "Cubic11", system-ui';
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(b.dx - 34, py - 7, 68, 13);
        ctx.fillStyle = '#e8d8ae'; ctx.fillText(b.role === 'gate' ? 'Enter 出城' : 'Enter 進入', b.dx, py);
      }
    }
  }

  /* ---------- 介面：上方資源列、左上頭像、右上城名、下方兵團列與功能選單 ---------- */
  function renderHud() {
    const P = G.Army.profile(), A = G.Army, lo = G.Menu.loadout();
    const men = P.roster.reduce((a, s) => a + s.men, 0);
    $('thHero').innerHTML = `<img src="${G.Menu.portrait()}" alt=""><div><b>${lo.name || '主帥'}</b><small>Lv${P.hero.level}・${G.WEAPONS[lo.weapon].name}</small>
      <div class="xp"><i style="width:${P.hero.level >= G.ARMY.heroMaxLevel ? 100 : P.hero.xp / G.ARMY.heroXpToNext(P.hero.level) * 100}%"></i></div></div>`;
    $('thRes').innerHTML = `<span>金幣 <b>${P.gold}</b></span><span>糧食 <b class="${(P.food ?? 200) < 30 ? 'bad' : ''}">${P.food ?? 200}</b></span><span>馬匹 <b>${A.horses()}</b></span><span>兵力 <b>${men}</b></span><span>隨身統率 <b>${A.used()}/${A.cap()}</b></span><span>配置統率 <b>${A.fieldUsed()}/${A.fieldCap()}</b></span><span>兵團 <b>${P.roster.length}/${G.ARMY.maxRoster}</b></span>`;
    if (town) $('thCityInfo').innerHTML = `<b>${G.U.esc(town.name)}</b><div class="clock">${clock()}</div>${near ? `<small>${near.label}門口</small>` : ''}`;
    $('thSquads').innerHTML = P.roster.map(s => `<div class="tsq ${s.deployed ? 'esc' : s.field ? 'fld' : ''} ${s.men ? '' : 'dead'}">${G.Sprites.icon(G.UNITS[s.type].sprite, 1) ? `<img class="tsqIcon" src="${G.Sprites.icon(G.UNITS[s.type].sprite, 1)}" alt="">` : ''}
      <b>${G.UNITS[s.type].name}${s.level > 1 ? ` Lv${s.level}` : ''}</b><small>${s.men}/${G.UNITS[s.type].count} 人・${s.deployed ? '隨身' : s.field ? '配置' : '待命'}</small></div>`).join('') || '<div class="tsq dead"><small>名冊是空的，到募兵處招募</small></div>';
  }

  /** 右上角的本地時間 */
  function clock() { const d = new Date(); return `${d.getMonth() + 1}月${d.getDate()}日　${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

  /** 選單（資源、兵團、功能列）展開／收起；open 不給就切換 */
  function toggleMenu(open) { $('townHud').classList.toggle('open', open); }

  /** 下方功能選單（滑鼠點）：data-tb 對應面板 */
  function bindHud() {
    $('thMenuBtn').addEventListener('click', () => toggleMenu());
    $('thBar').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const p = b.dataset.tb;
      toggleMenu(false);
      if (p === 'logout') return G.Menu.logout();
      if (p === 'gate') { if (G.Game.state === 'town') exitCity(); else G.HUD.toast('已經在大地圖上'); return; }
      G.Menu.openPanel(p, b.textContent.trim());
    });
  }

  return { enter, leave, update, draw, bindHud, renderHud, toggleMenu, clock, get active() { return !!town; }, get hero() { return hero; }, get cityId() { return town && town.city; } };
})();
