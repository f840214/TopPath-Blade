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

  /** list：場景的器械 [{ kind: 'ram' | 'ladder', team, x, y }] */
  function reset(list = []) {
    engines = list.map(e => {
      const d = S()[e.kind];
      return { engine: true, kind: e.kind, team: e.team, x: e.x, y: e.y, face: -Math.PI / 2, hp: d.hp, maxHp: d.hp, armor: d.armor, radius: d.radius,
        dead: 0, flash: 0, crew: null, crewNear: 0, state: 'idle', target: null, tx: e.x, hitT: 0, swing: 0, ladder: null };
    });
    hazards = []; rockT = 2; boulderT = 6;
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
  function update(dt) {
    const c = G.Map.castle;
    if (!c) return;
    for (const e of engines) {
      if (e.dead) { e.dead += dt; continue; }
      if (e.flash > 0) e.flash -= dt;
      if (e.swing > 0) e.swing -= dt;
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
      } else if (moveTo(e, e.tx, c.wallY + c.thick / 2 + 8, d.speed * k, dt)) {
        // 雲梯搭上城牆：牆上多一個窄入口，扛梯的兵團接著爬上去
        e.ladder = G.Map.addLadder(e.tx); e.state = 'up';
        G.FX.dust(e.x, e.y, 6);
        G.Battle.notifyTeam(e.team, '雲梯已搭上城牆');
        release(e, { x: e.tx, y: c.wallY - 90 });
      }
    }
    engines = engines.filter(e => !e.dead || e.dead < 3);
    updateHazards(c, dt);
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
    for (const e of engines) if (e.team === team && !e.dead && !e.crew && e.state !== 'up' && (e.kind !== 'ram' || ramTarget(x))) {
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
  function updateHazards(c, dt) {
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
    for (const h of hazards) {
      if ((h.t += dt) < h.warn) continue;
      h.done = true;
      const by = { team: h.team, x: h.x, y: h.y - 1 }, big = h.kind === 'boulder';
      G.Battle.forEachFoe(h.team, h.x, h.y, h.r, u => G.Combat.damage(by, u, h.dmg, { noCounter: true, knock: big ? 16 : 10, big: true, color: '#d8d2c4' }));
      if (big) forEachFoeEngine(h.team, h.x, h.y, h.r, e => damage(by, e, h.dmg * 2, { big: true }));
      for (let i = 0; i < (big ? 8 : 4); i++) G.FX.dust(h.x + G.U.rand(-h.r / 2, h.r / 2), h.y + G.U.rand(-h.r / 4, h.r / 4), 4);
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
        ctx.fillStyle = '#8a8378'; ctx.fillRect(Math.round(h.x - 3), Math.round(h.y - 90 * (1 - k) - 6), 6, 6);
      } else {
        const k = h.t / h.warn, x = h.sx + (h.x - h.sx) * k, y = h.sy + (h.y - h.sy) * k - Math.sin(k * Math.PI) * 220;
        ctx.fillStyle = '#5f594f'; ctx.beginPath(); ctx.arc(x, y - 6, 5 + k * 2, 0, Math.PI * 2); ctx.fill();
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

  /** 器械跟單位一起依 y 排序；搭好的雲梯畫在城牆前面（排序用牆腳的 y） */
  function drawables(view, player) {
    const c = G.Map.castle, out = [];
    if (!c) return out;
    const bot = c.wallY + c.thick / 2, R = G.Render;
    for (const e of engines) {
      if (e.x < view.x - 60 || e.x > view.x + view.w + 60 || e.y < view.y - 80 || e.y > view.y + view.h + 60) continue;
      const alpha = e.dead ? Math.max(0, 1 - e.dead / 3) : 1;
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
          if (body && log) { R.image(log, Math.round(e.x - 8), Math.round(e.y - 80 + off), alpha); R.image(body, Math.round(e.x - 32), Math.round(e.y - 86), alpha); }
          else { R.image(ramLog(), Math.round(e.x - 4), Math.round(e.y - 38 + off), alpha); R.image(ramBody(e.team), Math.round(e.x - 16), Math.round(e.y - 26), alpha); }
        } else if (carry) R.image(carry, Math.round(e.x - 9), Math.round(e.y - 44), alpha);
        else R.image(ladderTex(46), Math.round(e.x - 7), Math.round(e.y - 30), alpha);
        if (e.dead) return;
        const top = e.y - (e.kind === 'ram' ? 82 : 50);
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
  return { reset, assign, release, update, damage, nearestFoeEngine, forEachFoeEngine, freeEngine, ladderThreat, ramTarget, drawGround, drawAir, drawables, mirror,
    get engines() { return engines; }, get hazards() { return hazards; } };
})();
