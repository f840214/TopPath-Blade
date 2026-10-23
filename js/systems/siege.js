/* ============ siege.js — 攻城器械（衝車、雲梯）、城上落石、城內投石 ============
 * 器械是可以被攻擊的物件（engine: true，有 hp、armor、radius、team），跟士兵一樣能當攻擊目標；
 *   G.Combat.damage 打到器械時會轉給這裡的 damage()。數值在 js/data/siege.js（G.SIEGE）。
 * 器械要有兵團操作（crew）才會動：玩家按 B 指派選中的兵團，電腦方由 G.AI.think 自動指派步兵。
 *   衝車：推到目標入口（城門或可破壞城牆段）前面，每 hitCd 秒撞一次；推的人越多越快、撞得越重。
 *   雲梯：扛到城牆邊搭起來（G.Map.addLadder），操作的兵團接著爬上去；搭好之後就固定在牆上，不會被推倒也打不壞
 *         （守方只能去梯頂堵人）。
 * 守方的城上落石、城內投石機自動攻擊，落點先畫預警圈。
 */
G.Siege = (() => {
  const S = () => G.SIEGE;
  let engines = [], hazards = [], rockT = 0, boulderT = 0;

  /** 要兵團推的器械（衝車、雲梯、攻城塔）；其他（拒馬、床弩、投石車）放下就固定、自己運作 */
  const MOBILE = { ram: 1, ladder: 1, tower: 1 };
  function make(kind, team, x, y) {
    const d = S()[kind];
    return { engine: true, kind, team, x, y, face: team ? Math.PI / 2 : -Math.PI / 2, hp: d.hp, maxHp: d.hp, armor: d.armor, radius: d.radius,
      dead: 0, flash: 0, crew: null, crewNear: 0, state: 'idle', target: null, tx: x, hitT: 0, swing: 0, ladder: null, buildT: 0, fireT: 1 };
  }
  /** list：場景的器械 [{ kind: 'ram' | 'ladder', team, x, y }] */
  function reset(list = []) {
    engines = list.map(e => make(e.kind, e.team, e.x, e.y));
    hazards = []; rockT = 2; boulderT = 6;
  }
  /** 玩家放置器械（js/battle/sim.js 檢查數量、位置）；build：要蓋幾秒（部署階段是 0） */
  function place(kind, team, x, y, build) {
    const e = make(kind, team, x, y); e.buildT = build; e.owner = true;
    engines.push(e); G.FX.dust(x, y, 6);
    return e;
  }
  /** 拒馬擋路：把單位推出拒馬的圓（物理之後呼叫，跟牆一樣） */
  function collide(u) {
    for (const e of engines) if (e.kind === 'stakes' && !e.dead && !e.buildT) {
      const dx = u.x - e.x, dy = u.y - e.y, d = Math.hypot(dx, dy) || 0.01, min = e.radius + (u.radius || 6);
      if (d < min) { u.x = e.x + dx / d * min; u.y = e.y + dy / d * min; }
    }
  }

  /* ---------- 指派與解除 ---------- */
  /** 衝車要撞的入口：還沒打開的城門或城牆段中，離 x 最近的 */
  function ramTarget(x) {
    let best = null, bd = Infinity;
    for (const o of G.Map.castle.openings) if (o.kind !== 'ladder' && !G.Map.passable(o) && Math.abs(o.x - x) < bd) { bd = Math.abs(o.x - x); best = o; }
    return best;
  }
  /** 雲梯搭在哪裡：離 x 最近、避開城門、可破壞城牆段、塔樓和其他雲梯的位置 */
  function ladderSpot(e, x) {
    const c = G.Map.castle, W = G.CONFIG.world.w, ban = [];
    for (const o of c.openings) if (o.kind !== 'ladder') ban.push([o.x, o.w / 2 + (o.kind === 'gate' ? 40 : 16)]);
    for (const t of c.towers) ban.push([t, 36]);
    for (const o of engines) if (o !== e && o.kind === 'ladder' && !o.dead) ban.push([o.tx, 40]);
    x = G.U.clamp(x, 60, W - 60);
    for (let k = 0; k < 4; k++) for (const [bx, r] of ban) if (Math.abs(x - bx) < r) x = x < bx ? bx - r : bx + r;
    return G.U.clamp(x, 60, W - 60);
  }
  /** 兵團 sq 操作器械 e；x 是想要的位置（玩家指派時用武將所在的 x） */
  function assign(sq, e, x = e.x) {
    if (sq.crew) release(sq.crew);
    if (e.crew) release(e);
    if (e.kind === 'ram') { e.target = ramTarget(x); if (!e.target) return false; }
    else e.tx = ladderSpot(e, x);
    e.crew = sq; sq.crew = e; e.state = 'move';
    sq.prevCmd = null; sq.waypoint = null;
    return true;
  }
  /** 解除操作；next 有給就讓兵團接著往那裡進攻 */
  function release(e, next) {
    if (!e || !e.crew) return;
    const sq = e.crew; sq.crew = null; e.crew = null;
    if (next) { sq.cmd = 'attack'; sq.cmdPoint = next; }
    if (e.state === 'move' || e.state === 'work') e.state = 'idle';
  }

  /* ---------- 每幀 ---------- */
  function update(dt, deploying) {
    const c = G.Map.castle;
    for (const e of engines) {
      if (e.dead) { e.dead += dt; continue; }
      if (e.flash > 0) e.flash -= dt;
      if (e.swing > 0) e.swing -= dt;
      if (e.buildT > 0) { e.buildT = Math.max(0, e.buildT - dt); continue; }   // 蓋好之前不能用
      if (!MOBILE[e.kind]) { if (!deploying) staticUpdate(e, dt); continue; }
      if (!c) continue;
      if (e.state === 'up') continue;   // 搭好的雲梯固定在牆上
      // 撞開之後自己往後退，把缺口讓出來（以前停在城門口擋住進城的路）
      if (e.state === 'back') { if (moveTo(e, e.tx, e.backY, S().ram.speed, dt)) e.state = 'idle'; continue; }
      const sq = e.crew;
      if (sq && !sq.alive.length) release(e);
      if (!e.crew) { e.crewNear = 0; continue; }
      const d = S()[e.kind];
      let n = 0; for (const u of sq.units) if (!u.dead && Math.hypot(u.x - e.x, u.y - e.y) < e.radius + 40) n += u.def.engineer ? 2 : 1;   // 工兵一人算兩人
      e.crewNear = n;
      const k = Math.min(1, n / d.crewFull);
      if (e.kind === 'ram') {
        // 目標打穿了：操作的兵團放手，從缺口衝進去（要撞別的地方就再按 B）
        if (!e.target || G.Map.passable(e.target)) {
          const o = e.target || e; e.target = null; release(e, { x: o.x, y: c.wallY - 90 });
          // 往後退到缺口外面、偏到旁邊（缺口寬度一半再多一點），進城的路讓開
          const side = e.x <= o.x ? -1 : 1;
          e.state = 'back'; e.tx = o.x + side * ((o.w || 60) / 2 + e.radius + 10); e.backY = c.wallY + c.thick / 2 + e.radius + 70;
          continue;
        }
        if (moveTo(e, e.target.x, c.wallY + c.thick / 2 + e.radius + 4, d.speed * k, dt)) {
          e.state = 'work';
          if ((e.hitT -= dt) <= 0 && n) { e.hitT = d.hitCd; e.swing = 0.25; G.Battle.hitOpening(e, e.target, d.hitDmg * k); }
        } else e.state = 'move';
      } else if (moveTo(e, e.tx, c.wallY + c.thick / 2 + 8 + (e.kind === 'tower' ? 10 : 0), d.speed * k, dt)) {
        // 雲梯、攻城塔靠上城牆：牆上多一個入口（攻城塔比較寬、爬得快），操作的兵團接著爬上去
        e.ladder = G.Map.addLadder(e.tx, d.width, d.climbMul); e.state = 'up';
        G.FX.dust(e.x, e.y, 6);
        G.Battle.notifyTeam(e.team, `${d.name}已靠上城牆`);
        release(e, { x: e.tx, y: c.wallY - 90 });
      }
    }
    engines = engines.filter(e => !e.dead || e.dead < 3);
    updateHazards(c, dt, deploying);
  }

  /** 固定的器械：拒馬撞騎兵、床弩射擊、投石車丟石頭 */
  function staticUpdate(e, dt) {
    const d = S()[e.kind];
    if (e.kind === 'stakes') {
      // 敵方騎兵撞上來（騎得快的）：受傷、暈眩、彈開；每個人 1 秒內只算一次
      G.Battle.forEachFoe(e.team, e.x, e.y, e.radius + 6, u => {
        if (!u.def || !u.def.mounted || (u.stakeT || 0) > G.Battle.time) return;
        if (Math.hypot(u.vx, u.vy) < u.def.speed * 0.5) return;
        u.stakeT = G.Battle.time + 1;
        G.Combat.damage({ team: e.team, x: e.x, y: e.y }, u, d.cavDmg, { noCounter: true, stun: d.cavStun, knock: 14, dtype: 'pierce', big: true });
      });
    } else if (e.kind === 'ballista') {
      if ((e.fireT -= dt) > 0) return;
      const t = G.Battle.nearestFoe(e.team, e.x, e.y, d.range) || nearestFoeEngine(e.team, e.x, e.y, d.range);
      if (!t) { e.fireT = 0.5; return; }
      e.fireT = d.cd; e.swing = 0.3;
      const a = Math.atan2(t.y - e.y, t.x - e.x), cx = Math.cos(a), cy = Math.sin(a), by = { team: e.team, x: e.x, y: e.y };
      e.face = a;
      G.Battle.forEachFoe(e.team, e.x + cx * d.range / 2, e.y + cy * d.range / 2, d.range / 2 + d.width, o => {
        const along = (o.x - e.x) * cx + (o.y - e.y) * cy, across = Math.abs(-(o.x - e.x) * cy + (o.y - e.y) * cx);
        if (along > 0 && along < d.range && across < d.width) G.Combat.damage(by, o, d.dmg, { ranged: true, noCounter: true, knock: 12, dtype: 'pierce', big: true });
      });
      if (t.engine) damage(by, t, d.dmg, { ranged: true, big: true });
      G.Combat.arrow(by, null, { area: { x: e.x + cx * d.range, y: e.y + cy * d.range }, ranged: { speed: 1100, flat: true }, base: 0 });
    } else if (e.kind === 'cannon') {
      if ((e.fireT -= dt) > 0) return;
      const c = G.Map.castle, by = { team: e.team, x: e.x, y: e.y };
      // 攻城的攻方：射程內還沒打開的城門、城牆段
      const wall = c && c.defender !== e.team && c.openings.filter(o => o.kind !== 'ladder' && !G.Map.passable(o) && Math.hypot(o.x - e.x, c.wallY - e.y) < d.range).sort((a, b) => Math.abs(a.x - e.x) - Math.abs(b.x - e.x))[0];
      const eng = !wall && nearestFoeEngine(e.team, e.x, e.y, d.range), sq = !wall && !eng && G.Battle.nearestFoe(e.team, e.x, e.y, d.range);
      const tgt = wall ? { x: wall.x, y: c.wallY } : eng || sq;
      if (!tgt) { e.fireT = 0.6; return; }
      e.fireT = d.cd; e.swing = 0.35; e.face = Math.atan2(tgt.y - e.y, tgt.x - e.x);
      G.FX.muzzle(e.x + Math.cos(e.face) * 16, e.y - 10 + Math.sin(e.face) * 16, e.face); G.FX.dust(e.x, e.y, 4); G.FX.addShake(2);   // 砲口火光
      if (wall) { G.Battle.hitOpening(by, wall, d.gateDmg); G.Combat.arrow(by, null, { area: { x: tgt.x, y: tgt.y }, ranged: { speed: 900, flat: true }, base: 0 }); }
      else if (eng) { damage(by, eng, d.gateDmg, { big: true }); G.Combat.arrow(by, null, { area: { x: tgt.x, y: tgt.y }, ranged: { speed: 900, flat: true }, base: 0 }); }
      else G.Combat.arrow(by, null, { area: { x: tgt.x, y: tgt.y }, ranged: { speed: 700, splash: d.blast }, base: d.dmg });   // 會爆炸的砲彈（鈍擊）
    } else if (e.kind === 'trebuchet') {
      if ((e.fireT -= dt) > 0) return;
      e.fireT = d.interval * G.U.rand(0.9, 1.1);
      let best = null;
      for (const sq of G.Battle.squadsOf(1 - e.team)) {
        const n = sq.alive.length; if (!n) continue;
        const p = sq.center, dist = Math.hypot(p.x - e.x, p.y - e.y);
        if (dist > d.minDist && dist < d.maxDist && (!best || n > best.n)) best = { n, p };
      }
      if (!best) { e.fireT = 1; return; }
      e.swing = 0.5;
      hazards.push({ kind: 'boulder', x: best.p.x, y: best.p.y, sx: e.x, sy: e.y - 30, r: d.blast, t: 0, warn: d.warn, dmg: d.dmg, team: e.team });
    }
  }

  /** 往 (x, y) 走，到了回傳 true */
  function moveTo(e, x, y, sp, dt) {
    const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
    if (d < 3) return true;
    if (sp > 0) { const s = Math.min(d, sp * dt); e.x += dx / d * s; e.y += dy / d * s; e.face = Math.atan2(dy, dx); }
    return false;
  }

  /* ---------- 受擊 ---------- */
  function damage(att, e, base, o = {}) {
    if (e.dead) return 0;
    const d = S()[e.kind];
    let dmg = base * (att.squad ? att.squad.atkMul(G.Battle.time) : 1);
    if (o.ranged) dmg *= d.rangedTakenMul || 1;
    dmg *= G.CONFIG.armorK / (G.CONFIG.armorK + e.armor);
    e.hp -= dmg; e.flash = 0.12;
    G.FX.hit(e.x, e.y - 14, '#c8a070', att.isHero ? 4 : 2);
    if (att.isHero || o.big) G.FX.number(e.x, e.y, dmg, att.team === 0 ? '#ffe28a' : '#ff8a7a');
    if (e.hp <= 0) {
      e.hp = 0; e.dead = 0.001;
      release(e);
      for (let i = 0; i < 8; i++) G.FX.dust(e.x + G.U.rand(-14, 14), e.y + G.U.rand(-10, 10), 5);
      G.FX.addShake(3);
      G.Battle.notifyTeam(e.team, `我方${d.name}被摧毀`); G.Battle.notifyTeam(1 - e.team, `敵方${d.name}被摧毀`);
    }
    return dmg;
  }

  /* ---------- 查詢 ---------- */
  const targetable = e => !e.dead && e.state !== 'up';   // 搭好的雲梯打不壞
  function nearestFoeEngine(team, x, y, r) {
    let best = null, bd = Infinity;
    for (const e of engines) if (e.team !== team && targetable(e)) {
      const d = Math.hypot(e.x - x, e.y - y) - e.radius;
      if (d <= r && d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function forEachFoeEngine(team, x, y, r, fn) {
    for (const e of engines) if (e.team !== team && targetable(e) && Math.hypot(e.x - x, e.y - y) <= r + e.radius) fn(e);
  }
  /** 附近沒人操作、還用得上的我方器械（電腦指派步兵、玩家按 B 時用） */
  function freeEngine(team, x, y, r) {
    let best = null, bd = r;
    for (const e of engines) if (e.team === team && MOBILE[e.kind] && !e.dead && !e.buildT && !e.crew && e.state !== 'up' && (e.kind !== 'ram' || ramTarget(x))) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  /** 守方要去堵的敵方雲梯：離 p 最近、在 r 內的 */
  function ladderThreat(team, p, r) {
    let best = null, bd = r;
    for (const e of engines) if (e.team !== team && e.state === 'up') { const d = G.U.dist(e, p); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  /* ---------- 落石、投石 ---------- */
  function updateHazards(c, dt, deploying) {
    if (c && !deploying) castleHazards(c, dt);   // 部署階段城上不丟石頭
    flyHazards(dt);
  }
  function castleHazards(c, dt) {
    const R = S().rock, B = S().boulder, def = c.defender, front = c.wallY + c.thick / 2;
    if ((rockT -= dt) <= 0) {
      rockT = R.interval * G.U.rand(0.8, 1.2);
      for (let i = 0; i < R.perDrop; i++) {
        const t = G.Battle.nearestFoe(def, G.U.rand(120, G.CONFIG.world.w - 120), front + R.reach / 2, R.reach);
        if (t && t.y > front && t.y < front + R.reach)
          hazards.push({ kind: 'rock', x: t.x + G.U.rand(-8, 8), y: t.y + G.U.rand(-6, 6), r: R.radius, t: 0, warn: R.warn, dmg: R.dmg, team: def });
      }
    }
    // 投石機在最後一個據點（主堡）後面，往攻方人最多的兵團丟
    const keep = c.points[c.points.length - 1], cx = keep.x, cy = keep.y - 40;
    if ((boulderT -= dt) <= 0) {
      boulderT = B.interval * G.U.rand(0.85, 1.15);
      let best = null;
      for (const sq of G.Battle.squadsOf(1 - def)) {
        const n = sq.alive.length; if (!n) continue;
        const p = sq.center, d = Math.hypot(p.x - cx, p.y - cy);
        if (p.y > front + 40 && d > B.minDist && d < B.maxDist && (!best || n > best.n)) best = { n, p };
      }
      if (best) hazards.push({ kind: 'boulder', x: best.p.x, y: best.p.y, sx: cx, sy: cy - 20, r: B.radius, t: 0, warn: B.warn, dmg: B.dmg, team: def });
    }
  }
  /** 落石、投石落地 */
  function flyHazards(dt) {
    for (const h of hazards) {
      if ((h.t += dt) < h.warn) continue;
      h.done = true;
      const by = { team: h.team, x: h.x, y: h.y - 1 }, big = h.kind === 'boulder';
      G.Battle.forEachFoe(h.team, h.x, h.y, h.r, u => G.Combat.damage(by, u, h.dmg, { noCounter: true, knock: big ? 16 : 10, big: true, color: '#d8d2c4' }));
      if (big) forEachFoeEngine(h.team, h.x, h.y, h.r, e => damage(by, e, h.dmg * 2, { big: true }));
      G.FX.impact(h.x, h.y, big ? 'boulder' : 'rock');   // 落石、投石落地（PixelLab 的圖，沒有就是一片塵土）
      G.FX.ring(h.x, h.y, h.r, 'rgba(220,210,190,0.8)', 0.3);
      G.FX.addShake(big ? 3 : 1);
    }
    hazards = hazards.filter(h => !h.done);
  }

  /* ---------- 繪製 ---------- */
  /** 落點預警圈（地面上、單位底下）：紅色外圈閃爍，裡面隨時間填滿 */
  function drawGround(time) {
    const g = G.Render.under;
    for (const h of hazards) {
      const k = h.t / h.warn, ry = h.r * 0.6;
      g.ellipse(h.x, h.y, h.r * k, ry * k).fill({ color: 0xff3b30, alpha: 0.22 });
      g.ellipse(h.x, h.y, h.r, ry).stroke({ width: 2, color: 0xff3b30, alpha: 0.55 + 0.35 * Math.sin(time * 18) });
    }
  }
  /** 空中的石頭：落石從城頭掉下來（最後 0.45 秒）、投石沿拋物線飛過來 */
  function drawAir(ctx) {
    for (const h of hazards) {
      if (h.kind === 'rock') {
        const k = (h.t - (h.warn - 0.45)) / 0.45; if (k < 0) continue;
        if (!G.FX.drawFrame('rock', 0, h.x, h.y - 90 * (1 - k) - 3)) { ctx.fillStyle = '#8a8378'; ctx.fillRect(Math.round(h.x - 3), Math.round(h.y - 90 * (1 - k) - 6), 6, 6); }   // PixelLab 的石頭，沒有就是方塊
      } else {
        const k = h.t / h.warn, x = h.sx + (h.x - h.sx) * k, y = h.sy + (h.y - h.sy) * k - Math.sin(k * Math.PI) * 220;
        if (!G.FX.drawFrame('boulder', h.t, x, y - 6, { scale: 1 + k * 0.4 })) { ctx.fillStyle = '#5f594f'; ctx.beginPath(); ctx.arc(x, y - 6, 5 + k * 2, 0, Math.PI * 2); ctx.fill(); }   // 越飛越近畫大一點
      }
    }
  }

  const tex = (key, w, h, paint) => G.Render.canvasTex(key, w, h, paint);
  // 器械的圖（PixelLab，assets/battle/）；還沒載好時用下面程式畫的簡單版本
  const art = n => { const im = G.Assets.img(`assets/battle/${n}.png`); return im.complete && im.naturalWidth ? im : null; };
  function ramBody(team) {
    const mine = team === (G.viewTeam || 0);   // 隊旗顏色看的是「我方／敵方」，不是 team 編號
    return tex('ram:' + (mine ? 'mine' : 'foe'), 32, 34, g => {
      g.fillStyle = '#2a1d12'; for (const [x, y] of [[0, 6], [28, 6], [0, 22], [28, 22]]) g.fillRect(x, y, 4, 8);   // 輪子
      g.fillStyle = '#6b4a2c'; g.fillRect(3, 2, 26, 32);
      for (let y = 2; y < 30; y += 4) { g.fillStyle = (y / 4) % 2 ? '#7d5634' : '#5b3a22'; g.fillRect(4, y, 24, 3); }   // 屋頂木板
      g.fillStyle = '#3e2716'; g.fillRect(15, 2, 2, 30);
      g.strokeStyle = '#2a1d12'; g.lineWidth = 1; g.strokeRect(3.5, 2.5, 25, 31);
      g.fillStyle = mine ? '#2f5fb0' : '#a8322a'; g.fillRect(24, 26, 5, 7);   // 隊旗
    });
  }
  const ramLog = () => tex('ram:log', 8, 16, g => { g.fillStyle = '#8a6a44'; g.fillRect(1, 3, 6, 13); g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, 8, 5); });
  function ladderTex(h) {
    return tex('ladder:' + h, 14, h, g => {
      g.fillStyle = '#7a5530'; g.fillRect(1, 0, 3, h); g.fillRect(10, 0, 3, h);
      g.fillStyle = '#a07444'; for (let y = 3; y < h - 2; y += 6) g.fillRect(3, y, 8, 2);
    });
  }

  // 放置型器械的圖（程式畫的，之後可以換 PixelLab 的圖）：顏色看「我方／敵方」
  const flagOf = team => team === (G.viewTeam || 0) ? '#2f5fb0' : '#a8322a';
  const wood = (g, x, y, w, h, c = '#6b4a2c') => { g.fillStyle = c; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + h - 1, w, 1); };
  const PLACED = {
    stakes: (team) => tex('stakes:' + flagOf(team), 44, 26, g => {   // 拒馬：兩組交叉的尖木樁
      for (const ox of [4, 24]) {
        g.save(); g.translate(ox + 8, 14);
        for (const a of [-0.7, 0.7]) { g.save(); g.rotate(a); wood(g, -2, -12, 4, 22, '#7a5530'); g.fillStyle = '#c8b089'; g.fillRect(-1, -14, 2, 3); g.restore(); }
        g.restore();
      }
      wood(g, 2, 15, 40, 4, '#5b3a22'); g.fillStyle = flagOf(team); g.fillRect(20, 10, 4, 4);
    }),
    ballista: (team) => tex('ballista:' + flagOf(team), 34, 26, g => {   // 床弩：木架＋橫弓
      wood(g, 6, 12, 22, 8); wood(g, 15, 2, 4, 20, '#7d5634');
      g.strokeStyle = '#3e2716'; g.lineWidth = 2; g.beginPath(); g.arc(17, 14, 15, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      g.strokeStyle = '#d8d0b8'; g.lineWidth = 1; g.beginPath(); g.moveTo(4, 9); g.lineTo(17, 16); g.lineTo(30, 9); g.stroke();
      g.fillStyle = '#2a1d12'; for (const x of [5, 25]) g.fillRect(x, 20, 4, 5);
      g.fillStyle = flagOf(team); g.fillRect(26, 13, 5, 5);
    }),
    trebuchet: (team) => tex('trebuchet:' + flagOf(team), 40, 52, g => {   // 投石車：A 字架（擺臂另外畫）
      g.strokeStyle = '#5b3a22'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(6, 50); g.lineTo(20, 14); g.lineTo(34, 50); g.stroke();
      wood(g, 2, 46, 36, 5, '#4a3020'); wood(g, 15, 34, 10, 10, '#3e2716');
      g.fillStyle = '#2a1d12'; for (const x of [3, 33]) g.fillRect(x, 48, 5, 4);
      g.fillStyle = flagOf(team); g.fillRect(30, 38, 6, 6);
    }),
    tower: (team) => tex('tower:' + flagOf(team), 46, 84, g => {   // 攻城塔：高木塔、屋頂、正面的吊橋
      wood(g, 4, 14, 38, 66, '#6b4a2c');
      for (let y = 18; y < 78; y += 6) { g.fillStyle = (y / 6) % 2 ? '#7d5634' : '#5b3a22'; g.fillRect(5, y, 36, 4); }
      g.fillStyle = '#3e2716'; g.fillRect(4, 14, 3, 66); g.fillRect(39, 14, 3, 66); g.fillRect(4, 44, 38, 2);
      g.fillStyle = '#4a3020'; g.beginPath(); g.moveTo(0, 16); g.lineTo(23, 2); g.lineTo(46, 16); g.fill();
      wood(g, 14, 22, 18, 16, '#8a6a44');   // 吊橋
      g.fillStyle = '#2a1d12'; for (const x of [4, 36]) g.fillRect(x, 78, 6, 6);
      g.fillStyle = flagOf(team); g.fillRect(21, -2, 3, 8); g.fillRect(24, -2, 8, 5);
    }),
  };

  PLACED.cannon = team => tex('cannon:' + flagOf(team), 40, 26, g => {   // 火砲：木砲車＋砲管（砲口朝右）
    wood(g, 4, 14, 26, 7, '#5b3a22'); g.fillStyle = '#2a1d12'; for (const x of [6, 22]) { g.beginPath(); g.arc(x + 3, 21, 4, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#6a6458'; g.fillRect(10, 8, 26, 7); g.fillStyle = '#8a8476'; g.fillRect(10, 8, 26, 2); g.fillStyle = '#222'; g.fillRect(35, 9, 2, 5);
    g.fillStyle = flagOf(team); g.fillRect(4, 10, 5, 4);
  });
  /** 器械上的隊旗：旗桿＋一面 10×7 的旗（我方藍、敵方紅），畫在上層 canvas */
  function c2flag(ctx, x, y, team) {
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = '#3a2c1e'; ctx.fillRect(x, y, 1, 16);
    ctx.fillStyle = flagOf(team); ctx.fillRect(x + 1, y, 10, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 1, y + 6, 10, 1);
  }
  /** 放置型器械的圖：有 PixelLab 的圖（assets/battle/<種類>.png）就用，沒有就用上面程式畫的 */
  function placedArt(e) { const im = art(e.kind); return im ? { im, k: 1, art: true } : { im: PLACED[e.kind](e.team), k: 1 }; }   // PixelLab 的圖跟衝車一樣原尺寸畫

  /** 器械跟單位一起依 y 排序；搭好的雲梯畫在城牆前面（排序用牆腳的 y） */
  function drawables(view, player) {
    const c = G.Map.castle, out = [];
    const bot = c ? c.wallY + c.thick / 2 : 0, R = G.Render;
    for (const e of engines) {
      if (e.x < view.x - 60 || e.x > view.x + view.w + 60 || e.y < view.y - 100 || e.y > view.y + view.h + 60) continue;
      const alpha = (e.dead ? Math.max(0, 1 - e.dead / 3) : 1) * (e.buildT > 0 ? 0.5 : 1);
      if (PLACED[e.kind] && !(e.kind === 'tower' && e.state === 'up' && c)) {   // 放置型器械（攻城塔還沒靠上城牆時也在這裡畫）
        out.push({ y: e.y, draw: ctx => {
          const P = placedArt(e), im = P.im, k = P.k, iw = (im.naturalWidth || im.width) * k, ih = (im.naturalHeight || im.height) * k;
          R.shadow(e.x, e.y + 2, e.radius + 2, 5, 0.3 * alpha);
          R.image(im, Math.round(e.x - iw / 2), Math.round(e.y - ih + 4), alpha, e.kind === 'cannon' && Math.cos(e.face) < 0, k);   // 火砲砲口朝右的圖，往左打就翻過來
          if (P.art) { ctx.fillStyle = '#3a2c1e'; ctx.fillRect(Math.round(e.x + iw / 2 - 7), Math.round(e.y - ih + 2), 1, 10); ctx.fillStyle = flagOf(e.team); ctx.fillRect(Math.round(e.x + iw / 2 - 6), Math.round(e.y - ih + 2), 6, 4); }   // PixelLab 的圖沒有隊色：插一面小旗
          if (e.kind === 'trebuchet') {   // 擺臂：發射時往前甩（有 PixelLab 的擺臂圖就轉那張圖）
            const sw = e.swing > 0 ? 1 - e.swing / 0.5 : 0, a = -2.3 + sw * 2.6, arm = art('trebuchet_arm'), px = P.art ? e.x - iw / 2 + 30 : e.x, py = P.art ? e.y - ih + 10 : e.y - ih * 0.55;   // 擺臂的軸掛在 A 字架頂（圖上約 (30, 6)）
            if (arm) { ctx.save(); ctx.globalAlpha = alpha; ctx.translate(px, py); ctx.rotate(a); ctx.drawImage(arm, -16, -6); ctx.restore(); }   // 擺臂圖的軸心約在 (16, 6)
            else { ctx.strokeStyle = '#7d5634'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px - Math.cos(a) * 10, py - Math.sin(a) * 10); ctx.lineTo(px + Math.cos(a) * 24, py + Math.sin(a) * 24); ctx.stroke(); }
          }
          if (e.dead) return;
          const top = e.y - ih - 2;
          if (e.buildT > 0) {   // 建造中：進度條
            const k = 1 - e.buildT / G.SIEGE.deploy.buildTime;
            ctx.fillStyle = '#000'; ctx.fillRect(e.x - 16, top, 32, 3); ctx.fillStyle = '#8fc0ff'; ctx.fillRect(e.x - 16, top, 32 * Math.max(0, k), 3);
          } else if (e.hp < e.maxHp) { ctx.fillStyle = '#000'; ctx.fillRect(e.x - 16, top, 32, 3); ctx.fillStyle = '#c9b48a'; ctx.fillRect(e.x - 16, top, 32 * e.hp / e.maxHp, 3); }
          if (e.kind === 'tower' && e.team === (G.viewTeam || 0) && !e.crew && !e.buildT && player && !player.dead && Math.hypot(player.x - e.x, player.y - e.y) < 260) {
            ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(12,13,15,0.88)'; ctx.fillRect(e.x - 26, top - 12, 52, 10);
            ctx.fillStyle = '#e0cc98'; ctx.fillText('B 指派攻城塔', e.x, top - 6.5);
          }
        } });
        continue;
      }
      if (!c) continue;
      if (e.state === 'up' && e.kind === 'tower') {   // 靠在城牆上的攻城塔：畫在牆前
        out.push({ y: bot + 0.5, draw: () => { const P = placedArt(e), ih = (P.im.naturalHeight || P.im.height) * P.k, iw = (P.im.naturalWidth || P.im.width) * P.k; R.image(P.im, Math.round(e.x - iw / 2), Math.round(bot + 6 - ih), alpha, false, P.k); } });
        continue;
      }
      if (e.state === 'up') {
        // 搭在牆上的雲梯（PixelLab 的圖）：梯頂鐵鉤勾在牆頂，中段一節節往下接到牆腳，最下面是梯腳
        const y0 = c.wallY - c.thick / 2 - 26, y1 = bot + 6;
        out.push({ y: bot + 0.5, draw: () => {
          const top = art('ladder_top'), mid = art('ladder_mid'), foot = art('ladder_foot'), x = Math.round(e.x);
          if (!top || !mid || !foot) return R.image(ladderTex(y1 - y0), x - 7, Math.round(y0));
          for (let y = y0 + 16; y < y1 - 6; y += 24) R.frame(mid, 0, 0, 18, Math.min(24, Math.round(y1 - 6 - y)), x - 9, Math.round(y));
          R.image(foot, x - 11, Math.round(y1 - 8)); R.image(top, x - 11, Math.round(y0));
        } });
        continue;
      }
      out.push({ y: e.y, draw: ctx => {
        R.shadow(e.x, e.y + 6, e.radius + 2, 5, 0.3 * alpha);
        const mine = e.team === (G.viewTeam || 0), body = art(mine ? 'ram' : 'ram_red'), log = art('ram_log'), carry = art('ladder_carry');
        if (e.kind === 'ram') {
          const off = e.swing > 0 ? -6 * Math.sin((1 - e.swing / 0.25) * Math.PI) : 0;   // 撞木往前撞再收回
          const S = 1.3;   // 衝車放大一點（以前畫面上跟士兵差不多寬）
          if (body && log) { R.image(log, Math.round(e.x - 8 * S), Math.round(e.y - (80 - off) * S), alpha, false, S); R.image(body, Math.round(e.x - 32 * S), Math.round(e.y - 86 * S), alpha, false, S);
            c2flag(ctx, e.x + 22 * S, e.y - 70 * S, e.team); }   // 大一點的隊旗
          else { R.image(ramLog(), Math.round(e.x - 4), Math.round(e.y - 38 + off), alpha); R.image(ramBody(e.team), Math.round(e.x - 16), Math.round(e.y - 26), alpha); }
        } else if (carry) R.image(carry, Math.round(e.x - 9), Math.round(e.y - 44), alpha);
        else R.image(ladderTex(46), Math.round(e.x - 7), Math.round(e.y - 30), alpha);
        if (e.dead) return;
        const top = e.y - (e.kind === 'ram' ? 108 : 50);
        if (e.hp < e.maxHp) { ctx.fillStyle = '#000'; ctx.fillRect(e.x - 16, top, 32, 3); ctx.fillStyle = '#c9b48a'; ctx.fillRect(e.x - 16, top, 32 * e.hp / e.maxHp, 3); }
        // 我方沒人操作的器械：武將靠近時提示按 B
        if (e.team === (G.viewTeam || 0) && !e.crew && player && !player.dead && Math.hypot(player.x - e.x, player.y - e.y) < 260) {
          ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(12,13,15,0.88)'; ctx.fillRect(e.x - 22, top - 12, 44, 10);
          ctx.fillStyle = '#e0cc98'; ctx.fillText(`B 指派${S()[e.kind].name}`, e.x, top - 6.5);
        }
      } });
    }
    return out;
  }
  /** 同場戰鬥：用伺服器送來的器械、落石來畫 */
  function mirror(e, h) { engines = e; hazards = h; }
  return { reset, place, collide, assign, release, update, damage, nearestFoeEngine, forEachFoeEngine, freeEngine, ladderThreat, ramTarget, drawGround, drawAir, drawables, mirror,
    get engines() { return engines; }, get hazards() { return hazards; } };
})();
