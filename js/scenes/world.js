/* ============ world.js — 城外大地圖 ============
 * 軍隊（武將）在大地圖上騎馬走動（WASD）。右上角顯示本地時間；遊戲內部另有一個時鐘（st.minutes）算強盜重生。
 *   我方城池門口按 Enter 進城（G.Town），敵方城池按 Enter 攻城，碰到強盜就打野戰；打完回到大地圖。
 * 資料在 js/data/world.js（G.WORLD、地形 G.TOWNS.world）；進度存在存檔的 world 欄位：
 *   { x, y, minutes, owners: { 城池 id: 0|1 }, names: { 城池 id: 玩家取的名字 }, arts: { 城池 id: 城堡圖 }, bandits: [{ id, camp, x, y, members, tx, ty }], respawn: { 營地 id: 遊戲分鐘 } }
 * 城池：沒被玩家佔領的叫「空城」（圖調暗、沒有旗子）；佔領後可以取名、選城堡樣子（G.WORLD.castleArts），名牌旁和城上插玩家的旗幟（G.Heraldry）。
 * 主迴圈在 G.Game（state 'world' 時呼叫 update / draw）；介面沿用城內的 #townHud，右上角換成時間。
 */
G.World = (() => {
  const $ = id => document.getElementById(id), W = () => G.WORLD;
  let st = null, hero = null, near = null, cam = { x: 0, y: 0 }, zoom = 1, t = 0, grace = 0, saveT = 0;

  /** 存檔裡的大地圖進度；第一次玩時從王都城門外出發 */
  function state() {
    const P = G.Army.profile();
    const c = W().cities.find(c => c.capital);
    // 第一次玩，或地圖改版了（舊的位置可能變成河、山）：從王都城門外重新出發，強盜重生
    if (!P.world || P.world.layout !== W().layout) P.world = { ...(P.world || {}), layout: W().layout, x: c.x, y: c.y + 70, minutes: (P.world && P.world.minutes) || 8 * 60, bandits: [], respawn: {} };
    return P.world;
  }
  /** 城池歸屬（伺服器共用，G.Net.cities）：0 是自己（王都永遠算自己的）、1 是空城、2 是別的玩家 */
  const owner = c => { if (c.capital) return 0; const o = G.Net.cities[c.id]; return !o ? 1 : o.owner === G.Net.me ? 0 : 2; };
  const cityInfo = c => G.Net.cities[c.id];
  const gateOf = c => ({ x: c.x, y: c.y + 30 });
  /** 名牌上的名字：王都固定、我方的城用玩家取的名字、其他都是空城 */
  const nameOf = c => c.capital ? c.name : cityInfo(c) ? cityInfo(c).name : '空城';
  const artOf = c => (cityInfo(c) && cityInfo(c).art) || c.art;
  const flag = () => G.Army.profile().flag || G.Heraldry.DEFAULT;
  /** 城上的旗：自己的城用自己的旗、別人的城用城主的旗 */
  const flagOf = c => owner(c) === 0 ? flag() : (cityInfo(c) && cityInfo(c).flag) || G.Heraldry.DEFAULT;
  /* ---------- 領地：每座城管轄離它最近的區域；有主的塗城主的顏色，區域之間畫邊界 ---------- */
  const TERR = 16;   // 一格 16 遊戲像素
  let terrC = null, terrV = 0;
  /** 城主的顏色：自己藍色、王都金色、別的玩家依編號分配色相 */
  function ownerColor(c) {
    if (c.capital) return [205, 175, 95];
    const o = owner(c);
    if (o === 1) return null;
    if (o === 0) return [70, 125, 215];
    const h = (cityInfo(c).owner * 137.5) % 360, f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (0.55 - 0.35 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  }
  /** (x, y) 屬於哪座城的領地（跟領地圖同一個算法） */
  function regionAt(x, y) {
    let best = null, bd = Infinity;
    for (const c of W().cities) { const d = (c.x - x) ** 2 + ((c.y - y) * 1.15) ** 2 * (c.capital ? 1.6 : 1); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  function buildTerritory() {
    const S = W().size, cw = Math.ceil(S.w / TERR), ch = Math.ceil(S.h / TERR);
    if (!terrC) { terrC = document.createElement('canvas'); terrC.width = cw; terrC.height = ch; }
    const g = terrC.getContext('2d'), img = g.createImageData(cw, ch), idx = new Uint8Array(cw * ch), cities = W().cities, cols = cities.map(ownerColor);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const px = x * TERR + TERR / 2, py = y * TERR + TERR / 2;
      let best = 0, bd = Infinity;
      cities.forEach((c, i) => { const d = (c.x - px) ** 2 + ((c.y - py) * 1.15) ** 2 * (c.capital ? 1.6 : 1); if (d < bd) { bd = d; best = i; } });   // 王都的範圍小一點
      idx[y * cw + x] = best;
    }
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = y * cw + x, me = idx[i], col = cols[me];
      const border = (x + 1 < cw && idx[i + 1] !== me) || (y + 1 < ch && idx[i + cw] !== me) || (x > 0 && idx[i - 1] !== me) || (y > 0 && idx[i - cw] !== me);
      let r = 0, gg = 0, b = 0, a = 0;
      if (col) { [r, gg, b] = col; a = border ? 150 : 38; }
      else if (border) { r = gg = b = 235; a = 34; }   // 空城之間也畫一條淡淡的界線
      img.data.set([r, gg, b, a], i * 4);
    }
    g.putImageData(img, 0, 0); terrV++;
  }

  /* ---------- 外圍高崖：PixelLab 的無縫圖塊沿四邊鋪（北邊三種交錯），跟單位一起依 y 排序 ---------- */
  let cliffs = null;
  function cliffTiles() {
    if (cliffs) return cliffs;
    const S = W().size, img = n => G.Assets.img(`assets/world/${n}.png`);
    let s = 4711; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    cliffs = [];
    cliffs.push({ im: img('cliff_nw'), x: 0, y: 0, sort: 140 }, { im: img('cliff_ne'), x: S.w - 128, y: 0, sort: 140 });
    for (let x = 128; x < S.w - 128; x += 128) cliffs.push({ im: img(['cliff_n', 'cliff_n2', 'cliff_n3'][Math.floor(rnd() * 3)]), x, y: 0, sort: 140 });
    for (let y = 256; y < S.h; y += 128) cliffs.push({ im: img('cliff_w'), x: 0, y, sort: -1 }, { im: img('cliff_e'), x: S.w - 64, y, sort: -1 });
    for (let x = 0; x < S.w; x += 128) cliffs.push({ im: img('cliff_s'), x, y: S.h - 40, sort: -1 });
    return cliffs;
  }

  /* ---------- 高地的岩壁：把 cliff_low 圖切成 6px 一條的直條，沿著台地南半圈一條條排（崖面永遠是直的，不用旋轉）；斜坡缺口放 ramp 圖 ---------- */
  let hcliffs = null;
  function highlandCliffs() {
    if (hcliffs) return hcliffs;
    hcliffs = [];
    const imgs = ['cliff_low', 'cliff_low2', 'cliff_low3'].map(n => G.Assets.img(`assets/world/${n}.png`)), SL = 6;   // 6px 一條，畫 8px 寬互相重疊，看不到接縫
    W().highlands.forEach((h, i) => {
      // 從東北（t = -0.7）繞過南邊到西北（t = π + 0.7）：南半圈是完整的岩壁，兩側往北越來越矮（只畫上半截），收進北邊的崖緣
      const rampAt = h.ramps.map(r => W().highlandPt(h, i, r));   // 斜坡圖兩側直接接岩壁（圖上有內容的寬度約 116～128px）
      // 斜坡兩側 60px 內的岩壁慢慢拉到跟斜坡同高，斜坡兩邊才接得平（台地邊緣是斜的）
      const levelNearRamp = (x, y) => { for (const [rx, ry] of rampAt) { const d = Math.abs(x - rx); if (d < 120 && Math.abs(y - ry) < 60) { const k = Math.min(1, Math.max(0, (120 - d) / 62)); return y + (ry - y) * k; } } return y; };
      let sx = 0, v = i;
      const T0 = -0.7, T1 = Math.PI + 0.7, P = t => W().highlandPt(h, i, t);
      for (let t = T0; t < T1;) {
        const [x0, y0] = P(t);
        let t2 = t + 0.004; while (t2 < T1) { const [x1, y1] = P(t2); if (Math.abs(x1 - x0) >= SL || Math.abs(y1 - y0) >= 3) break; t2 += 0.004; }   // 下一條：左右移 6px，或上下差 3px
        // 高度比例：看這一段邊緣朝哪邊（往外的法線）。朝正南畫完整的崖面，越偏東西越矮，朝北或往內凹的地方只剩草緣；邊緣彎來彎去也接得起來
        const [xa, ya] = P(t - 0.01), [xb, yb] = P(t + 0.01), nx = yb - ya, ny = -(xb - xa), ny1 = ny / (Math.hypot(nx, ny) || 1);
        const k = 0.16 + 0.84 * Math.pow(Math.max(0, ny1 - 0.22) / 0.78, 0.8);
        if (ny1 > 0.22 && !rampAt.some(([rx, ry]) => Math.abs(x0 - rx) < 58 && Math.abs(y0 - ry) < 50)) hcliffs.push({ im: imgs[v % 3], sx, x: Math.round(x0 - SL / 2), y: Math.round(levelNearRamp(x0, y0) - 8), h: Math.max(14, Math.round(90 * k)), sort: y0 - 24 });   // 用崖頂排序：台地上的人畫在岩壁前面，崖下的人（腳在崖腳以下）也在前面
        sx = (sx + SL) % 128; if (!sx) v++;
        t = t2;
      }
      for (const r of h.ramps) { const [x, y] = W().highlandPt(h, i, r); hcliffs.push({ ramp: G.Assets.img(`assets/world/ramp${1 + (i % 2)}.png`), x: Math.round(x), y: Math.round(y), sort: y - 30 }); }   // 走在坡上的人畫在坡道前面
    });
    return hcliffs;
  }

  /** 城池的圖：我方用選的樣子，空城調暗 */
  function syncCities() {
    buildTerritory();
    for (const b of G.TOWNS.world.buildings) {
      const c = b.city && W().cities.find(c => c.id === b.city);
      if (!c) continue;
      b.src = `assets/world/${artOf(c)}.png`;
      b.tint = owner(c) === 1 ? 0x8c8a86 : undefined;
    }
  }

  /** 進入大地圖；at 是站的位置（從城裡出來時是那座城的城門外），msg 是提示 */
  function enter(at, msg) {
    G.useScale('world');
    st = state();
    if (at) { st.x = at.x; st.y = at.y; }
    G.FX.reset(); G.Combat.reset(); G.Siege.reset([]);
    G.Map.setupTerrain('world');
    G.Map.buildGround(91, [], [...W().cities, ...W().camps, { x: st.x, y: st.y }], [], { blobs: false, decos: 0, tufts: 600, paint: G.WorldGround.paint, ok: G.WorldGround.ok, scale: 0.5 });   // 大地圖 6144×3840：地面用一半解析度畫
    const lo = G.Menu.loadout();
    hero = new G.Hero(0, lo.weapon, lo.equip, st.x, st.y, G.Army.heroLevel());
    hero.look = G.SPRITE_META[lo.look] ? lo.look : null;
    hero.name = lo.name || '主帥'; hero.face = Math.PI / 2;
    // 大地圖上騎馬行軍：換成騎兵的圖，名字和人數旗跟著抬高
    // 有這個外觀的騎馬圖（mount_<外觀>）就用它，沒有就用重騎兵
    const mount = lo.look && G.SPRITE_META[lo.look.replace(/^look_/, 'mount_')] ? lo.look.replace(/^look_/, 'mount_') : W().mount;
    Object.defineProperty(hero, 'sprite', { value: mount });
    hero.nameDy = 62;
    zoom = G.CONFIG.zoom; grace = 2;   // 縮放跟城內、戰場同一組三段，預設中間那段
    fixBandits();
    for (const c of W().camps) if (!st.bandits.some(b => b.camp === c.id) && !(st.respawn[c.id] > st.minutes)) spawnBandit(c);
    syncCities();
    G.Net.setScene('world', st.x, st.y);
    G.Army.collectIncome();
    G.Town.leave();
    G.Game.toScene('world');
    G.HUD.show(false);
    $('townHud').style.display = 'block'; $('townHud').classList.add('world');
    renderHud();
    if (msg) G.HUD.toast(msg);
    save();
  }
  function leave() { $('townHud').classList.remove('world'); }
  function save() { G.Army.saveWorld(); saveT = 0; }

  /* ---------- 強盜 ---------- */
  /** 營地附近一個走得到的點（不在河、湖、山、樹裡）；找不到就回營地門口 */
  function campPoint(camp, rMin, rMax) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin), x = camp.x + Math.cos(a) * r, y = camp.y + 80 + Math.sin(a) * r * 0.6;
      if (!G.Map.blocked(x, y) && !G.Map.blocked(x, y - 8)) return { x, y };
    }
    return { x: camp.x, y: camp.y + 60 };
  }
  function spawnBandit(camp) {
    const opts = W().bandits[camp.tier], pick = opts[Math.floor(Math.random() * opts.length)], p = campPoint(camp, 40, 100), t = campPoint(camp, 60, 200);
    st.bandits.push({ id: `${camp.id}-${Math.round(st.minutes)}`, camp: camp.id, x: p.x, y: p.y, members: pick.map(([type, men]) => [type, men]), tx: t.x, ty: t.y });
  }
  /** 存檔裡的強盜：離營地太遠或站在障礙裡（例如地圖改過），放回營地附近 */
  function fixBandits() {
    for (const b of st.bandits) {
      const camp = W().camps.find(c => c.id === b.camp);
      if (!camp) continue;
      if (Math.hypot(b.x - camp.x, b.y - camp.y) > 700 || G.Map.blocked(b.x, b.y)) { const p = campPoint(camp, 40, 100); b.x = p.x; b.y = p.y; b.tx = p.x; b.ty = p.y; }
    }
    st.bandits = st.bandits.filter(b => W().camps.some(c => c.id === b.camp));
  }
  function updateBandits(gdt) {
    for (const c of W().camps) if (!st.bandits.some(b => b.camp === c.id) && st.respawn[c.id] !== undefined && st.minutes >= st.respawn[c.id]) { delete st.respawn[c.id]; spawnBandit(c); }
    for (const b of st.bandits) {
      const camp = W().camps.find(c => c.id === b.camp), dp = Math.hypot(hero.x - b.x, hero.y - b.y);
      // 玩家靠近營地附近就追過來，否則在營地周圍閒晃
      const chase = dp < 240 && Math.hypot(hero.x - camp.x, hero.y - camp.y) < 520;
      if (chase) { b.tx = hero.x; b.ty = hero.y; }
      else if (Math.hypot(b.tx - b.x, b.ty - b.y) < 12 || b.stuck > 2) { const p = campPoint(camp, 60, 260); b.tx = p.x; b.ty = p.y; b.stuck = 0; }
      const u = { x: b.x, y: b.y, radius: 8 }, r = G.Map.route(u, b.tx, b.ty), dx = r.x - b.x, dy = r.y - b.y, d = Math.hypot(dx, dy);
      const sp = (chase ? W().banditChase : 50) * gdt;
      if (d > 1) {
        const step = Math.min(sp, d), n = Math.ceil(step / 6);
        for (let i = 0; i < n; i++) { u.x += dx / d * step / n; u.y += dy / d * step / n; G.Map.resolve(u); }
        b.face = Math.atan2(dy, dx); b.moving = true;
      } else b.moving = false;
      G.Map.resolve(u);
      // 卡住偵測：想走卻 2 秒沒走動（頂在河岸、樹林邊），就換一個目的地
      b.stuck = b.moving && Math.hypot(u.x - b.x, u.y - b.y) < 0.5 * gdt * 50 ? (b.stuck || 0) + gdt : 0;
      b.x = u.x; b.y = u.y;
      b.animT = (b.animT || 0) + gdt;
      if (grace <= 0 && dp < 38) return fightBandit(b);
    }
  }

  /* ---------- 每幀 ---------- */
  function update(dt) {
    t += dt;
    const I = G.Input, panel = G.Menu.panelOpen() || dlgOpen(), gdt = panel ? 0 : dt;
    if (!panel) {
      if (I.pressed('Tab')) G.Town.toggleMenu();
      if (I.pressed('Slash')) G.Net.focusChat();
      if (I.pressed('KeyJ')) acceptInvite();
      if (I.pressed('KeyM')) toggleMini();
      const L = G.CONFIG.zoomLevels;
      if (I.pressed('Equal')) zoom = L[Math.min(L.length - 1, L.indexOf(zoom) + 1)];
      if (I.pressed('Minus')) zoom = L[Math.max(0, L.indexOf(zoom) - 1)];
    } else if (I.pressed('Escape') && !dlgOpen()) G.Menu.closePanel();
    st.minutes += gdt * W().minutesPerSec;
    if (grace > 0) grace -= dt;
    // 軍隊移動：按方向鍵時如果是暫停，自動恢復 ×1
    let mx = 0, my = 0;
    if (!panel) { mx = (I.down('KeyD') ? 1 : 0) - (I.down('KeyA') ? 1 : 0); my = (I.down('KeyS') ? 1 : 0) - (I.down('KeyW') ? 1 : 0); }
    hero.animT += dt;
    if (mx || my) {
      const l = Math.hypot(mx, my), sp = W().armySpeed * dt * (G.Army.profile().food === 0 ? 0.6 : 1) * (W().inHighland(hero.x, hero.y) ? 0.85 : 1) * (W().inSnow(hero.x, hero.y) ? 0.8 : 1);   // 斷糧、走在高地上：行軍變慢
      // 分段走（每段最多 6px）：騎馬 ×4 一幀會走十幾 px，一次走完會穿過湖和山的阻擋
      const n = Math.ceil(sp / 6);
      for (let i = 0; i < n; i++) {
        hero.x = G.U.clamp(hero.x + mx / l * sp / n, 20, W().size.w - 20); hero.y = G.U.clamp(hero.y + my / l * sp / n, 30, W().size.h - 20);
        G.Map.resolve(hero);
      }
      hero.face = Math.atan2(my, mx); hero.moving = true;
    } else hero.moving = false;
    G.Map.resolve(hero);
    st.x = hero.x; st.y = hero.y;
    G.Net.pos(hero.x, hero.y, hero.face, hero.moving); G.Net.update(dt);
    updateBandits(gdt);
    if (G.Game.state === 'world') checkRaids();
    if (G.Game.state !== 'world') return;   // 開打了
    // 城門口：離哪座城最近
    near = null; let bd = 70;
    for (const c of W().cities) { const g = gateOf(c), d = Math.hypot(hero.x - g.x, hero.y - g.y); if (d < bd) { bd = d; near = c; } }
    if (!panel && near && I.pressed('Enter')) return visit(near);
    if (!panel && near && owner(near) === 0 && !near.capital && I.pressed('KeyR')) cityDialog(near, false);
    if ((saveT += dt) > 20) save();   // 每 20 秒存一次位置與時間
    renderHud();
  }

  /** 到城門口：我方的城進城，敵方的城攻城 */
  function visit(c) {
    if (owner(c) === 0) {
      save();
      return G.Town.enter(`進入${nameOf(c)}`, { key: c.town, name: nameOf(c), city: c.id });
    }
    fightCity(c);
  }

  /* ---------- 開戰 ---------- */
  /** 守軍擺位：攻城戰的守城位置（城牆後、據點附近），多的往城內排 */
  const FIELD_SLOTS = [[1700, 700], [1700, 900], [1900, 800], [1950, 520], [1950, 1080], [1550, 800]];
  let launching = false;
  /** 開戰：先向伺服器拿出戰單（kind 'city' / 'bandit'），拿到才開打 */
  async function launch(custom, kind, target, onExit) {
    const lo = G.Menu.loadout(), { escort, field } = G.Army.loadout();
    if (!escort.length) { grace = 2; return G.HUD.toast('沒有隨身兵團：先到城裡的募兵處勾選'); }
    if (launching) return;
    launching = true;
    try { await G.Army.beginBattle(kind, target); }
    catch (e) { grace = 3; G.HUD.toast(e.message); return; }
    finally { launching = false; }
    if (G.Game.state !== 'world') return;
    save();
    leave();
    $('townHud').style.display = 'none';
    G.Game.start({ ...lo, scenario: custom.base, custom, squads: escort, field, heroLevel: G.Army.heroLevel(), exit: onExit });
  }
  /** 攻城：在伺服器上開房間打（同場戰鬥，附近的玩家可以加入、城主可以回防），打完由伺服器結算 */
  function fightCity(c) {
    if (!G.Army.loadout().escort.length) { grace = 2; return G.HUD.toast('沒有隨身兵團：先到城裡的募兵處勾選'); }
    save();
    if (!G.Net.attackCity(c.id, cityExit(c))) G.HUD.toast('沒有連上伺服器，不能攻城');
    else grace = 3;
  }
  /** 攻城（自己開的或加入別人的）打完回大地圖：佔下了就開「佔領城池」視窗 */
  const cityExit = c => res => {
    const g = gateOf(c);
    if (res && res.report && res.report.captured) {
      enter({ x: g.x, y: g.y + 50 }, `佔領城池！獲得 ${c.gold} 金`);
      G.Net.refreshCities().then(() => cityDialog(c, true));
    } else if (res && res.win) enter({ x: g.x, y: g.y + 80 }, '守住了！');
    else if (res) enter({ x: g.x, y: g.y + 140 }, '戰敗，退到城外');
    else enter({ x: g.x, y: g.y + 140 }, '撤退');
  };
  /** J：接受別人的邀請（一起攻城或回防自己的城），打完回到現在的位置 */
  function acceptInvite() {
    const at = { x: hero.x, y: hero.y };
    if (!G.Net.acceptInvite(res => enter(at, res ? (res.win ? '勝利！' : '戰敗') : '撤退'))) G.HUD.toast('沒有可以加入的戰鬥');
  }

  /* ---------- 北境聯軍（伺服器上的共用軍隊，G.Net.raids） ---------- */
  function checkRaids() {
    if (grace > 0) return;
    for (const r of G.Net.raids) if (Math.hypot(hero.x - r.x, hero.y - r.y) < 40) return fightRaid(r);
  }
  function fightRaid(r) {
    const base = G.Game.SCENARIOS.field;
    const custom = { ...base, base: 'field', name: '攔截北境聯軍', enemyHero: { weapon: 'glaive', x: 2050, y: 800, name: '聯軍先鋒' },
      enemies: r.members.map(([type, men], i) => ({ type, men, x: FIELD_SLOTS[i % FIELD_SLOTS.length][0], y: FIELD_SLOTS[i % FIELD_SLOTS.length][1] })) };
    launch(custom, 'raid', r.id, res => {
      if (res && res.win) enter(null, res.report && res.report.raid ? `擊潰北境聯軍！獲得 ${W().raidGold} 金` : '伺服器不認這場勝利');
      else if (res) back('攔截失敗，退回王都');
      else { const a = Math.atan2(hero.y - r.y, hero.x - r.x); enter({ x: hero.x + Math.cos(a) * 160, y: hero.y + Math.sin(a) * 160 }, '撤退'); }
    });
  }

  function fightBandit(b) {
    const base = G.Game.SCENARIOS.field, camp = W().camps.find(c => c.id === b.camp);
    const custom = { ...base, base: 'field', name: `${camp.name}強盜`, enemyHero: null,
      enemies: b.members.map(([type, men], i) => ({ type, men, x: FIELD_SLOTS[i % FIELD_SLOTS.length][0], y: FIELD_SLOTS[i % FIELD_SLOTS.length][1] })) };
    launch(custom, 'bandit', camp.id, res => {
      if (res && res.win) {
        st.bandits = st.bandits.filter(x => x !== b);
        st.respawn[camp.id] = st.minutes + W().respawnH * 60;
        const ok = res.report && !res.report.tooFast;
        enter(null, ok ? `擊退${camp.name}的強盜！獲得 ${W().banditGold[camp.tier]} 金` : '伺服器不認這場勝利（戰鬥時間太短）');
      } else if (res) back('被強盜打敗，退回王都');
      else { const a = Math.atan2(hero.y - b.y, hero.x - b.x); enter({ x: hero.x + Math.cos(a) * 160, y: hero.y + Math.sin(a) * 160 }, '從強盜手中撤退'); }
    });
  }
  /** 戰敗：回到王都城門外 */
  function back(msg) { const c = W().cities.find(c => c.capital), g = gateOf(c); enter({ x: g.x, y: g.y + 50 }, msg); }

  /* ---------- 佔領／管理城池：取名、選城堡樣子、旗幟 ---------- */
  let dlg = null;   // { c, name, art, flag }
  const dlgOpen = () => !!dlg || G.Heraldry.isOpen();
  function cityDialog(c, fresh) {
    dlg = { c, art: artOf(c), flag: flag() };
    $('cdTitle').textContent = fresh ? '佔領城池' : '管理城池';
    $('cdName').value = cityInfo(c) ? cityInfo(c).name : c.name;
    $('cdMsg').textContent = '';
    $('cityDlg').style.display = 'flex';
    renderDialog();
    setTimeout(() => $('cdName').focus(), 0);
  }
  function renderDialog() {
    $('cdArts').innerHTML = W().castleArts.map(a => `<button type="button" class="cdArt${a.key === dlg.art ? ' on' : ''}" data-a="${a.key}"><img src="assets/world/${a.key}.png" alt="">${a.name}</button>`).join('');
    const cv = $('cdFlag'), g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(G.Heraldry.draw(dlg.flag, 48, 60), 0, 0);
  }
  function bindDialog() {
    $('cdArts').onclick = e => { const b = e.target.closest('[data-a]'); if (b) { dlg.art = b.dataset.a; renderDialog(); } };
    $('cdEditFlag').onclick = () => G.Heraldry.open(dlg.flag, f => { dlg.flag = f; renderDialog(); });
    $('cdName').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') $('cdOk').click(); };
    $('cdOk').onclick = async () => {
      const name = $('cdName').value.trim();
      if (!name) { $('cdMsg').textContent = '請輸入城池名稱'; return; }
      try {
        // 旗幟存在自己的存檔；城名、城堡樣子存在伺服器共用的城池表，所有人都看得到
        G.Army.profile().flag = dlg.flag; G.Army.saveWorld();
        await G.Net.saveCity(dlg.c.id, name, dlg.art);
      } catch (e) { $('cdMsg').textContent = e.message; return; }
      $('cityDlg').style.display = 'none'; dlg = null;
      syncCities(); renderHud();
      G.HUD.toast(`${name}・旗幟已插上`);
    };
  }

  /* ---------- 繪製 ---------- */
  function draw() {
    const ctx = G.Render.ctx, vw = G.Render.width / zoom, vh = G.Render.height / zoom, S = W().size;
    cam.x = G.U.clamp(hero.x - vw / 2, 0, Math.max(0, S.w - vw));
    cam.y = G.U.clamp(hero.y - vh / 2, 0, Math.max(0, S.h - vh));
    G.Render.begin(zoom, Math.round(-cam.x * zoom), Math.round(-cam.y * zoom));
    G.Map.drawGround();
    const view = { x: cam.x, y: cam.y, w: vw, h: vh }, list = [...G.Map.wallDrawables(view)];
    for (const c of highlandCliffs()) if (c.x > cam.x - 160 && c.x < cam.x + vw + 160 && c.y > cam.y - 120 && c.y < cam.y + vh + 40)
      list.push({ y: c.sort, draw: () => {
        if (c.ramp) { if (c.ramp.complete && c.ramp.naturalWidth) G.Render.image(c.ramp, c.x - c.ramp.naturalWidth / 2, c.y - 18); }
        else if (c.im.complete && c.im.naturalWidth) G.Render.frame(c.im, Math.min(c.sx, 120), 0, 8, c.h, c.x, c.y);
      } });
    for (const c of cliffTiles()) if (c.x < cam.x + vw && c.x + 128 > cam.x && c.y < cam.y + vh && c.y + 260 > cam.y)
      list.push({ y: c.sort < 0 ? -1 : c.sort, draw: () => { if (c.im.complete && c.im.naturalWidth) G.Render.image(c.im, c.x, c.y); } });
    list.push({ y: hero.y, draw: c => { hero.draw(c); armyBanner(c, hero.x, hero.y - 32, 0, menOf()); } }, ...G.Net.drawables(true));
    for (const r of G.Net.raids) list.push({ y: r.y, draw: c => {   // 北境聯軍：重騎兵領頭，紅旗寫人數
      G.Render.shadow(r.x, r.y, 12, 4, 0.35);
      G.Sprites.draw('heavycav', 'Walk', Math.PI / 2, t, r.x, r.y, { red: true });
      armyBanner(c, r.x, r.y - 24, 1, r.men, '北境聯軍');
    } });
    for (const b of st.bandits) list.push({ y: b.y, draw: c => {
      G.Render.shadow(b.x, b.y, 9, 3.5, 0.3);
      G.Sprites.draw(b.members[0][0], b.moving ? 'Walk' : 'Idle', b.face || Math.PI / 2, b.moving ? b.animT : 0, b.x, b.y, { red: true });
      armyBanner(c, b.x, b.y, 1, b.members.reduce((a, m) => a + m[1], 0), '強盜');
    } });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw(ctx);
    drawCityLabels(ctx);
    G.Render.screen();
    G.Render.end();
    drawMini();
  }
  const menOf = () => G.Army.profile().roster.filter(s => s.deployed || s.field).reduce((a, s) => a + s.men, 0);
  /** 軍隊頭上的人數旗：藍色我方、紅色強盜 */
  function armyBanner(ctx, x, y, team, men, tag) {
    const by = Math.round(y - 50);
    ctx.font = 'bold 8px "Cubic11", system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const txt = `${tag ? tag + ' ' : ''}${men}`, w = ctx.measureText(txt).width + 8;
    ctx.fillStyle = team ? '#7f2a22' : '#34557f'; ctx.fillRect(Math.round(x - w / 2), by - 5, Math.round(w), 10);
    ctx.fillStyle = '#fff'; ctx.fillText(txt, x, by + 0.5);
  }
  /** 城池名牌：藍邊自己的、紅邊別的玩家的、灰字空城；有主的城名牌旁和城上插城主的旗；站在城門口時提示 Enter */
  function drawCityLabels(ctx) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const sub = (text, x, y, color) => { ctx.font = '8px "Cubic11", system-ui'; ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillText(text, x + 0.6, y + 0.6); ctx.fillStyle = color; ctx.fillText(text, x, y); };
    for (const c of W().cities) {
      const o = owner(c), owned = o !== 1, im = G.Map.artFor({ src: `assets/world/${artOf(c)}.png` }), h = im.naturalHeight || 110;
      const y = Math.round(c.y - h - 8), label = nameOf(c), w = label.length * 10 + 20 + (owned ? 14 : 0), lx = c.x + (owned ? 7 : 0);
      // 名牌：深色底、淡金細線，兩側一塊陣營色
      ctx.fillStyle = 'rgba(12,13,15,0.88)'; ctx.fillRect(c.x - w / 2, y - 8, w, 16);
      ctx.fillStyle = '#a8874f'; ctx.fillRect(c.x - w / 2, y - 8, w, 1); ctx.fillRect(c.x - w / 2, y + 7, w, 1);
      ctx.fillStyle = o === 0 ? '#3d5f92' : o === 2 ? '#8a2a22' : '#55534e'; ctx.fillRect(c.x - w / 2, y - 7, 4, 14); ctx.fillRect(c.x + w / 2 - 4, y - 7, 4, 14);
      ctx.font = 'bold 10px "Cubic11", system-ui'; ctx.fillStyle = owned ? '#e8d8ae' : '#a9a397'; ctx.fillText(label, lx, y + 0.5);
      if (owned) {
        const f = flagOf(c);
        ctx.drawImage(G.Heraldry.draw(f, 12, 15), Math.round(c.x - w / 2 + 5), y - 7);
        const fx = Math.round(c.x + (im.naturalWidth || 120) * 0.34), fy = Math.round(c.y - h * 0.82);
        ctx.fillStyle = '#3a3128'; ctx.fillRect(fx - 1, fy, 2, 34);
        ctx.drawImage(G.Heraldry.draw(f, 16, 20), fx + 1, fy + 1);
      }
      const garrison = c.garrison ? `守軍 ${c.garrison.reduce((a, g) => a + g[1], 0)}` : '';
      if (o === 1) sub(garrison, c.x, y + 15, '#d9a39a');
      if (o === 2) sub(`城主 ${cityInfo(c).user}・${garrison}`, c.x, y + 15, '#d9a39a');
      if (c === near) {
        const g = gateOf(c), py = g.y + 22 + Math.sin(t * 5) * 1.5;
        ctx.font = 'bold 9px "Cubic11", system-ui';
        const tip = o === 0 ? `Enter 進入${label}${c.capital ? '' : '・R 管理'}` : `Enter 攻打${label}`, tw = ctx.measureText(tip).width + 12;
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(g.x - tw / 2, py - 8, tw, 15);
        ctx.fillStyle = o === 0 ? '#e8d8ae' : '#d9a39a'; ctx.fillText(tip, g.x, py);
      }
    }
    for (const c of W().camps) {
      ctx.font = '8px "Cubic11", system-ui'; ctx.fillStyle = '#000'; ctx.fillText(c.name, c.x + 0.6, c.y + 12.6);
      ctx.fillStyle = '#ffb3a8'; ctx.fillText(c.name, c.x, c.y + 12);
    }
  }
  /** 右下角小地圖：城池（藍我方、紅敵方）、強盜、目前的視野 */
  function drawMini() {
    if (miniOff) return;
    const cv = $('thMini'), g = cv.getContext('2d'), S = W().size, k = cv.width / S.w;
    g.fillStyle = '#3a4a32'; g.fillRect(0, 0, cv.width, cv.height);
    const sn = W().snow; g.fillStyle = '#c9d2d4'; g.beginPath(); for (let a = 0; a <= 60; a++) { const t = a / 60 * Math.PI * 2, r = W().snowR(t); const x = (sn.x + Math.cos(t) * sn.rx * r) * k, y = (sn.y + Math.sin(t) * sn.ry * r) * k; a ? g.lineTo(x, y) : g.moveTo(x, y); } g.fill();   // 雪原
    g.fillStyle = '#56653f'; for (const h of W().highlands) { g.beginPath(); g.ellipse(h.x * k, h.y * k, h.rx * k, h.ry * k, 0, 0, Math.PI * 2); g.fill(); }   // 高地
    g.fillStyle = '#2e4650'; for (const l of W().lakes) { g.beginPath(); g.ellipse(l.x * k, l.y * k, l.rx * k, l.ry * k, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#2b3a26'; for (const b of G.TOWNS.world.buildings) if (b.art === 'forest2') g.fillRect(b.x * k - 4, b.y * k - 4, 8, 5);
    g.strokeStyle = '#2e4650'; g.lineWidth = 2;
    for (const r of W().rivers) { g.beginPath(); G.U.smooth(r, 40).forEach(([x, y], i) => i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)); g.stroke(); }
    if (terrC) { g.imageSmoothingEnabled = true; g.drawImage(terrC, 0, 0, cv.width, cv.height); }   // 領地
    g.strokeStyle = '#7a6448'; g.lineWidth = 2;
    for (const path of W().roads) { g.beginPath(); G.WorldGround.smooth(path, 40).forEach(([x, y], i) => i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)); g.stroke(); }
    for (const b of G.TOWNS.world.buildings) if (b.art.startsWith('mountain')) { g.fillStyle = '#6a655c'; g.fillRect(b.x * k - 4, b.y * k - 4, 8, 5); }
    for (const c of W().cities) { g.fillStyle = ['#4a8ae6', '#8c8a86', '#e6463c'][owner(c)]; g.fillRect(c.x * k - 3, c.y * k - 3, 6, 6); }
    g.fillStyle = '#ff9a8a'; for (const b of st.bandits) g.fillRect(b.x * k - 1, b.y * k - 1, 3, 3);
    g.fillStyle = '#ff3b30'; for (const r of G.Net.raids) g.fillRect(r.x * k - 2, r.y * k - 2, 5, 5);
    g.fillStyle = '#ffe28a'; g.fillRect(hero.x * k - 2, hero.y * k - 2, 4, 4);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1;
    g.strokeRect(cam.x * k, cam.y * k, G.Render.width / zoom * k, G.Render.height / zoom * k);
  }

  /* ---------- 介面：右上角時間與速度 ---------- */
  function renderHud() {
    G.Town.renderHud();
    // 現在站在誰的領地：王都直轄、自己的、別的玩家的、空城
    const r = regionAt(hero.x, hero.y), o = owner(r);
    const region = r.capital ? '王都直轄' : o === 0 ? `${G.U.esc(nameOf(r))}・你的領地` : o === 2 ? `${G.U.esc(nameOf(r))}・${G.U.esc(cityInfo(r).user)} 的領地` : `空城領地（無主）`;
    $('thCityInfo').innerHTML = `<b>大地圖</b><div class="clock">${G.Town.clock()}</div><div class="region ${o === 0 ? 'mine' : o === 2 ? 'other' : ''}">${region}</div>${near ? `<small>${G.U.esc(nameOf(near))}城門口</small>` : ''}`;
  }
  /** 小地圖收起／展開（按鈕或 M），記在這台電腦上 */
  let miniOff = false;
  try { miniOff = localStorage.getItem('tpb.miniOff') === '1'; } catch (e) { /* 私密模式等拿不到就用預設 */ }
  function toggleMini(v = !miniOff) {
    miniOff = v; $('townHud').classList.toggle('miniOff', miniOff); $('miniToggle').textContent = miniOff ? '▸' : '▾';
    try { localStorage.setItem('tpb.miniOff', miniOff ? '1' : '0'); } catch (e) { /* 存不了就算了 */ }
  }
  function bindHud() {
    bindDialog();
    $('miniToggle').onclick = () => toggleMini();
    toggleMini(miniOff);
  }

  G.Net.onCities(() => { if (st) { syncCities(); if (G.Game.state === 'world') renderHud(); } });
  return { enter, leave, update, draw, bindHud, acceptInvite, nameOf: c => (st ? nameOf(c) : c.name), get active() { return !!st; }, get hero() { return hero; } };
})();
