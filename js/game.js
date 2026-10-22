/* ============ game.js — 戰場的瀏覽器端：主迴圈、鏡頭、繪製、結算（模擬本身在 js/battle/sim.js） ============ */
G.Game = (() => {
  const W = () => G.CONFIG.world;
  let ctx, state = 'menu';
  let player = null, me = null, select = 'all', cam = { x: 0, y: 0 }, zoom = 1;
  let result = null, scenario = null, showPerf = false, fps = 0, frameMs = 0;
  let demo = false;   // 開場畫面背景：兩軍自動交戰，沒有玩家操作
  let remote = false;   // 同場戰鬥：模擬在伺服器跑，這裡只畫（G.Remote）
  const api = {};

  const SCENARIOS = G.Battle.SCENARIOS;   // 場景定義在 js/battle/sim.js
  const B = G.Battle;

  let exitTo = null;   // 從大地圖開的仗：打完（或撤退）時呼叫，參數是 { win } 或 null（撤退）
  function start(lo, isDemo = false) {
    if (!isDemo) G.Town.leave();
    G.useScale('battle');
    if (!isDemo) G.Net.setScene('battle');   // 單人戰鬥不廣播位置
    demo = isDemo; scenario = lo.custom || SCENARIOS[lo.scenario];
    if (demo) scenario = { ...scenario, terrain: (scenario.terrain || []).filter(z => z.kind !== 'hill') };   // 開場畫面的背景：不放小山丘
    exitTo = isDemo ? null : lo.exit || null; settled = null;
    result = null; select = 'all';
    G.FX.reset();
    // 單人戰鬥：只有自己一個指揮官，鍵盤就是 G.Input
    B.onNotify = (c, text) => { if (!c || c === me) G.HUD.toast(text); };
    B.onEnd = r => end(r.winTeam === 0, r.winTeam === 0 ? r.msg : r.loseMsg);
    B.setup({ scenario, demo, commanders: [{ id: 1, team: 0, name: lo.name, weapon: lo.weapon, equip: lo.equip, look: lo.look, heroLevel: lo.heroLevel, squads: lo.squads, field: lo.field, fieldOrder: lo.fieldOrder, input: G.Input, local: true }] });
    me = B.commanders[0]; player = me.hero;
    const dirt = scenario.castle ? [{ x: 0, y: 0, w: W().w, h: scenario.castle.wallY }, { x: scenario.castle.gateX - 60, y: scenario.castle.wallY, w: 120, h: W().h }] : [];
    // 出生點附近不放樹和石頭
    const avoid = [scenario.player, scenario.enemyHero, ...scenario.enemies, ...(scenario.siege || []), ...(scenario.castle ? scenario.castle.points : [])].filter(Boolean);
    G.Map.buildGround(scenario.seed + (demo ? Math.floor(Math.random() * 1000) : 0), dirt, avoid, G.Map.town ? G.Map.town.roads : []);
    state = demo ? 'demo' : 'battle';
    G.HUD.show(!demo);
    if (!demo) G.HUD.intro(scenario.name, scenario.castle ? (scenario.castle.defender === 0 ? '守住三個據點' : '攻破城門，依序佔領外城、內城、主堡') : '擊敗敵將與所有兵團');
  }

  /** 同場戰鬥開始（伺服器送來 b.start）：建地圖，切到遠端模式（不跑模擬，只畫 G.Remote 的狀態） */
  function startRemote(sc, team) {
    G.Town.leave(); G.World.leave(); document.getElementById('townHud').style.display = 'none';
    // 伺服器那邊已經是戰鬥中；這裡也記成 battle，打完回大地圖時 setScene('world') 才會真的送出去
    // （以前沒記，回大地圖後伺服器還以為在戰鬥：別人看不到你、也不能對決、組隊）
    G.Net.setScene('battle');
    G.useScale('battle');
    demo = false; remote = true; scenario = sc; exitTo = null; settled = null; result = null;
    G.FX.reset(); G.Combat.reset();
    B.applySize(sc);
    G.Map.setupCastle(sc.castle || null);
    G.Map.setupField(sc.seed || 1, B.fieldAvoid(sc), sc.terrain || []);   // 跟伺服器同一份石頭、地形
    G.Siege.reset([]);
    const dirt = sc.castle ? [{ x: 0, y: 0, w: W().w, h: sc.castle.wallY }, { x: sc.castle.gateX - 60, y: sc.castle.wallY, w: 120, h: W().h }] : [];
    const avoid = [sc.player, sc.enemyHero, ...sc.enemies, ...(sc.siege || []), ...(sc.castle ? sc.castle.points : [])].filter(Boolean);
    G.Map.buildGround(sc.seed, dirt, avoid, G.Map.town ? G.Map.town.roads : []);
    state = 'battle';
    G.HUD.show(true);
    if (sc.duel) G.HUD.intro(sc.name, '擊敗對手的武將與兵團');
    else G.HUD.intro(team === 1 ? `守衛${sc.name.replace(/^攻打/, '')}` : sc.name, team === 1 ? '擋住攻方，守住主堡' : '攻破城門，依序佔領外城、內城、主堡');
  }
  /** 同場戰鬥結束（伺服器已經結算好）；onExit 是開戰時給的回程 */
  function remoteEnd(m, onExit) {
    const rep = m.report;
    if (rep && rep.data) G.Army.adopt(rep.data);
    result = { win: m.win, msg: m.msg };
    exitTo = onExit;
    settled = Promise.resolve(rep || null);
    if (m.left) return leaveBattle();   // 自己撤退的：直接回去
    G.HUD.result(m.win, m.msg, { kills: G.Remote.view().stats.kills }, settled);
    G.HUD.resultButtons([['Escape', '返回']]);
  }
  /** 離開戰場：回大地圖（或城裡） */
  function leaveBattle() {
    const f = exitTo, r = result, pr = settled || Promise.resolve(null);
    exitTo = null; remote = false; state = 'wait';
    pr.then(rep => {
      if (f) f(r && { win: r.win, report: rep });
      else G.Town.enter(!r && rep && !rep.drill ? `撤退：傷亡已計入名冊，金幣 +${rep.gold}` : '');
    });
  }

  const playerSquads = () => (me ? B.squadsOfCmdr(me) : []);   // 自己能指揮的兵團（HUD、旗標的選取框）
  const allUnits = () => B.allUnits();

  /* ---------- 只跟畫面有關的按鍵（指揮官的操作在 G.Battle.handleInput） ---------- */
  function handleViewKeys() {
    const I = G.Input;
    if (I.pressed('Equal')) stepZoom(1);
    if (I.pressed('Minus')) stepZoom(-1);
    if (I.pressed('F3')) showPerf = !showPerf;
    if (I.pressed('KeyV')) { G.FX.S.shake = !G.FX.S.shake; G.HUD.toast(G.FX.S.shake ? '畫面震動：開' : '畫面震動：關'); }
  }
  function stepZoom(d) { const L = G.CONFIG.zoomLevels; zoom = L[G.U.clamp(L.indexOf(zoom) + d, 0, L.length - 1)]; }

  /* ---------- 勝負（判定在 G.Battle.checkResult） ---------- */
  function end(win, msg) {
    result = { win, msg };
    if (demo) setTimeout(() => { if (state === 'demo') startDemo(); }, 2500);   // 開場對戰打完就換一場
    else {
      settled = settle(win);
      G.HUD.result(win, msg, G.Combat.stats, settled);
      G.HUD.resultButtons(exitTo ? [['Escape', '返回大地圖']] : [['KeyR', '再打一次'], ['Escape', '回城']]);
    }
  }
  let settled = null;   // 結算中的 Promise（伺服器回傳結算報告）
  /** 把戰報送到伺服器結算（傷亡、經驗、金幣、佔城）；大軍測試不結算。回傳 Promise<結算報告 | null> */
  function settle(win) {
    if (demo || scenario.test) return Promise.resolve(null);
    // 戰場上的隨身、配置兵團，加上後備（換下場或還沒上場的）
    const rep = B.report(me);
    return G.Army.finishBattle(win, rep.squads.map(s => ({ rosterId: s.rosterId, alive: { length: s.alive }, kills: s.kills })), rep.heroKills).catch(e => { G.HUD.toast(`結算失敗：${e.message}`); return null; });
  }
  /** 開場畫面背景用的自動對戰 */
  function startDemo() {
    start({ scenario: Math.random() < 0.5 ? 'field' : 'siege', weapon: Math.random() < 0.5 ? 'sword' : 'glaive', equip: {}, squads: ['shieldman', 'pikeman', 'archer', 'cavalry'] }, true);
  }

  /* ---------- 主迴圈 ---------- */
  function update(dt) {
    if (G.FX.update(dt)) return;     // 命中停頓
    if (!demo) handleViewKeys();
    B.update(dt);
  }

  /**
   * 畫面要的資料：單人戰鬥直接從 G.Battle 拿；同場戰鬥從 G.Remote（伺服器送來的狀態）拿。
   * { units, squads, time, me: { hero, team, select, reserve, supplyOpen, supplyCd }, supply, near, castle }
   */
  function view() {
    if (remote) return G.Remote.view();
    return { units: B.allUnits(), squads: B.squads, time: B.time, me, mine: playerSquads(), supply: me ? B.supplyPoints(me.team) : [], near: me && B.nearSupply(me), stats: G.Combat.stats };
  }

  function draw() {
    const V = view(), hero = V.me.hero, vw = G.Render.width / zoom, vh = G.Render.height / zoom;
    G.viewTeam = V.me.team;   // 畫面上「我方」是哪一隊（同場戰鬥守城的玩家是 team 1）
    let fx = hero.x, fy = hero.y;
    if (demo) {   // 開場：鏡頭慢慢跟著交戰中心
      const f = B.nearestFoe(0, hero.x, hero.y, 99999); if (f) { fx = (hero.x + f.x) / 2; fy = (hero.y + f.y) / 2; }
      fx = cam.x + vw / 2 + (fx - cam.x - vw / 2) * 0.02; fy = cam.y + vh / 2 + (fy - cam.y - vh / 2) * 0.02;
    }
    cam.x = G.U.clamp(fx - vw / 2, 0, Math.max(0, W().w - vw));
    cam.y = G.U.clamp(fy - vh / 2, 0, Math.max(0, W().h - vh));
    const sh = G.FX.shakeOffset();
    // 地面、影子、單位、樹石城牆走 PixiJS；ctx 是疊在上面的 Canvas 2D（見 js/core/render.js）
    G.Render.begin(zoom, Math.round((-cam.x + sh.x) * zoom), Math.round((-cam.y + sh.y) * zoom));
    G.Map.drawGround();
    G.Combat.drawGround();
    G.Map.drawCapture(V.time);
    G.Siege.drawGround(V.time);
    drawSupply(V);
    // 依 y 排序繪製；正在爬雲梯的人排在城牆和梯子前面，才不會被牆蓋住
    const list = [], castle = G.Map.castle, ladderY = castle && castle.wallY + castle.thick / 2 + 1;
    for (const u of V.units) if (u.x > cam.x - 60 && u.x < cam.x + vw + 60 && u.y > cam.y - 60 && u.y < cam.y + vh + 80) {
      const o = castle && G.Map.openingAt(u.x, u.y);
      list.push({ y: o && o.kind === 'ladder' ? ladderY : u.y, draw: c => u.draw(c) });
      if (!u.isHero) G.Render.shadow(u.x, u.y, u.radius + 1, 3, 0.25);
    }
    const viewRect = { x: cam.x, y: cam.y, w: vw, h: vh };
    list.push(...G.Map.wallDrawables(viewRect), ...G.Siege.drawables(viewRect, demo ? null : hero));
    // 補給站（PixelLab 的帳篷木箱圖，assets/battle/supply.png）：放在補給圈後面，站在圈裡的武將畫在它前面
    if (!demo) { const im = G.Assets.img('assets/battle/supply.png'); for (const s of V.supply) list.push({ y: s.y - 30, draw: () => { if (im.complete && im.naturalWidth) G.Render.image(im, s.x - 70, s.y - 112); } }); }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw(ctx);
    G.Combat.drawAir(ctx);
    G.Siege.drawAir(ctx);
    G.FX.drawWorld(ctx);
    drawBanners(V);
    G.Render.screen();
    G.FX.drawScreen(ctx, G.Render.width, G.Render.height);
    G.Render.end();
    const m = V.me;
    if (!demo) G.HUD.update({ player: hero, squads: V.mine, group: m.group || 'escort', select: m.select, reserve: m.reserve, supplyOpen: m.supplyOpen, supplyCd: m.supplyCd, near: V.near,
      field: V.squads.filter(s => s.field && (s.owner === m || s.ownerId === m.id)), time: V.time, scenario, castle: G.Map.castle, stats: V.stats,
      foes: V.units.filter(u => u.team !== m.team && !u.dead).length, perf: showPerf && { fps, frameMs, units: V.units.length }, zoom });
  }

  /** 補給點：地上的範圍圈和名字（補給站的圖跟單位一起依 y 排序畫）；武將靠近時顯示按鍵提示 */
  function drawSupply(V) {
    if (demo) return;
    const g = G.Render.under, near = V.near;
    for (const s of V.supply) {
      g.ellipse(s.x, s.y, 46, 28).stroke({ width: 2, color: 0x7fb2ff, alpha: s === near || (near && near.x === s.x && near.y === s.y) ? 0.95 : 0.5 });
      const isNear = near && near.x === s.x && near.y === s.y;
      ctx.font = 'bold 7px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000'; ctx.fillText(isNear ? '補給點（T 換兵）' : '補給點', s.x + 0.6, s.y + 34.6);
      ctx.fillStyle = '#9cc3ff'; ctx.fillText(isNear ? '補給點（T 換兵）' : '補給點', s.x, s.y + 34);
    }
  }

  /** 兵團旗標：藍色我方、紅色敵方，顯示人數；自己選中的兵團有金框 */
  function drawBanners(V) {
    ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const sel = V.me.select === 'all' ? V.mine : [V.mine[V.me.select]];
    V.squads.forEach(s => {
      const a = s.alive.length; if (!a) return;
      const c = s.center, x = Math.round(c.x), y = Math.round(c.y - 44);
      const mine = s.team === V.me.team, selected = sel.includes(s);
      ctx.fillStyle = mine ? '#34557f' : '#7f2a22';
      ctx.fillRect(x - 13, y - 6, 26, 12);
      if (selected) { ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 1; ctx.strokeRect(x - 13.5, y - 6.5, 27, 13); }
      ctx.fillStyle = s.rout > 0 ? '#ffb347' : '#fff'; ctx.fillText(s.rout > 0 ? '潰' : a, x + 3, y + 0.5);   // 潰散中的兵團
      ctx.fillStyle = mine ? '#9cc3ff' : '#ffb3a8';
      ctx.fillText(s.def.short || s.def.name[0], x - 7, y + 0.5);
    });
  }

  let last = 0, acc = 0, frames = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    G.Input.mouseOrders = state === 'battle';   // 戰場上滑鼠點地面＝指揮兵團
    if (state === 'battle' || state === 'demo') {
      const t0 = performance.now();
      if (remote) {   // 同場戰鬥：伺服器在算，這裡只更新畫面、送按鍵
        G.FX.update(dt); handleViewKeys();
        if (!result) G.Remote.update(dt);
        if (G.Input.pressed('Escape')) { if (result) leaveBattle(); else G.Remote.leave(); }
        else if (G.Remote.view().me.hero) draw();
        G.Input.endFrame(); requestAnimationFrame(loop); return;
      }
      const gdt = dt * G.FX.timeScale(dt);   // 破門、破牆時的慢動作
      if (!result) update(gdt); else G.FX.update(gdt);
      if (!demo && result && !exitTo && G.Input.pressed('KeyR')) G.Menu.deploy();   // 演習：用結算後的名冊再打一次
      if (!demo && G.Input.pressed('Escape')) {
        const pr = result ? settled || Promise.resolve(null) : settle(false);   // 中途撤退也要計入傷亡
        const f = exitTo, r = result; exitTo = null; state = 'wait';   // 等伺服器結算時先停住（迴圈不更新也不畫）
        pr.then(rep => {
          if (f) f(r && { win: r.win, report: rep });   // 回大地圖
          else G.Town.enter(!r && rep && !rep.drill ? `撤退：傷亡已計入名冊，金幣 +${rep.gold}` : '');   // 演習：回城
        });
      } else draw();
      frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;
      frames++; acc += dt; if (acc >= 0.5) { fps = frames / acc; frames = 0; acc = 0; }
    } else if (state === 'town') { G.Town.update(dt); if (state === 'town') G.Town.draw(); }
    else if (state === 'world') { G.World.update(dt); if (state === 'world') G.World.draw(); }
    G.Input.endFrame();
    requestAnimationFrame(loop);
  }

  function init() {
    ctx = G.Render.ctx;   // 上層 Canvas 2D；畫布大小由 G.Render 跟著視窗調整
    zoom = G.CONFIG.zoom;
    requestAnimationFrame(loop);
  }

  Object.assign(api, { SCENARIOS, init, start, startDemo, startRemote, remoteEnd });
  Object.defineProperty(api, 'state', { get: () => state });
  /** 切到城內場景（G.Town 建好地圖後呼叫） */
  api.toScene = s => { state = s; demo = false; remote = false; result = null; exitTo = null; $result().style.display = 'none'; };
  api.toTown = () => api.toScene('town');
  const $result = () => document.getElementById('result');
  // 除錯用：在主控台看目前戰場
  Object.defineProperty(api, 'debug', { get: () => ({ heroes: B.heroes, squads: B.squads, player, result }) });
  return api;
})();
