/* ============ fx.js — 特效 ============
 * 粒子、刀光、震波、傷害數字、畫面震動、命中停頓、大招特寫。
 * 全部是程式繪製，不需要額外素材（大招特寫的立繪除外）。
 */
G.FX = (() => {
  let parts = [], arcs = [], rings = [], texts = [], cutin = null;
  let shake = 0, hitStop = 0, slow = null;   // slow：慢動作 { left, scale }
  const S = { shake: false };   // 設定：畫面震動開關（預設關，V 鍵可開）

  function reset() { parts = []; arcs = []; rings = []; texts = []; cutin = null; shake = 0; hitStop = 0; slow = null; stuckArr = []; anims = []; }

  /** 受擊火花＋塵土 */
  function hit(x, y, color = '#fff2b0', n = 6) {
    if (n >= 4 && play('hit_spark', x, y)) n = Math.ceil(n / 2);   // 重的命中加一個 PixelLab 的火花，粒子少一點
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = G.U.rand(40, 110);
      parts.push({ x, y, z: 12, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: G.U.rand(20, 80), life: G.U.rand(0.2, 0.4), t: 0, color, size: 2 });
    }
  }
  function blood(x, y, n = 4) { hit(x, y, '#8c1d1d', n); }
  function dust(x, y, n = 5) {
    if (play('dust_puff', x, y, { ground: true })) n = Math.ceil(n / 3);   // 有 PixelLab 的塵土圖就少撒一點粒子
    for (let i = 0; i < n; i++)
      parts.push({ x: x + G.U.rand(-6, 6), y, z: 2, vx: G.U.rand(-30, 30), vy: G.U.rand(-10, 10), vz: G.U.rand(10, 30), life: G.U.rand(0.4, 0.7), t: 0, color: 'rgba(160,140,110,0.7)', size: 3, grow: true });
  }
  /** 火星（火焰技能、火箭） */
  function embers(x, y, n = 10, spread = 30) {
    for (let i = 0; i < n; i++)
      parts.push({ x: x + G.U.rand(-spread, spread), y: y + G.U.rand(-spread / 2, spread / 2), z: G.U.rand(0, 20), vx: G.U.rand(-20, 20), vy: G.U.rand(-20, 20), vz: G.U.rand(30, 90), life: G.U.rand(0.3, 0.8), t: 0, color: Math.random() < 0.5 ? '#ffb347' : '#ff5a1f', size: 2 });
  }

  /** 刀光：以 (x,y) 為中心、朝 a 方向、張角 arc 的弧形，fire 為火焰色 */
  function slash(x, y, a, r, arc, o = {}) {
    if (arc >= 6.2 && play('slash_spin', x, y, { scale: r / 40 })) { if (o.fire) embers(x, y, 8, r * 0.7); return; }   // 一整圈的刀光（迴旋斬、燕返）用 PixelLab 的圖
    arcs.push({ x, y, a, r, arc, t: 0, life: o.life || 0.22, fire: !!o.fire, width: o.width || 4, spin: o.spin || 0 });
    if (o.fire) for (let i = 0; i < 8; i++) {
      const aa = a + G.U.rand(-arc / 2, arc / 2);
      embers(x + Math.cos(aa) * r, y + Math.sin(aa) * r * 0.7, 1, 4);
    }
  }
  function ring(x, y, r, color = 'rgba(255,220,150,0.9)', life = 0.35) { rings.push({ x, y, r, color, t: 0, life }); }
  function number(x, y, v, color = '#fff') {
    texts.push({ x: x + G.U.rand(-4, 4), y, v: typeof v === 'number' ? Math.round(v) : v, color, t: 0, life: 0.7 });   // v 也可以是字（「閃」「破防」）
  }
  function addShake(v) { if (S.shake) shake = Math.max(shake, v); }
  function addHitStop(v) { hitStop = Math.max(hitStop, v); }
  /** 關鍵時刻的短暫慢動作（破門、破牆） */
  function slowMo(dur, scale) { slow = { left: dur, scale }; }
  /** 每幀用真實時間呼叫：回傳這幀遊戲時間要乘的倍率 */
  function timeScale(dt) {
    if (!slow) return 1;
    if ((slow.left -= dt) <= 0) { slow = null; return 1; }
    return slow.scale;
  }

  /** 大招特寫：斜切的技能名稱帶＋立繪滑入 */
  function showCutin(name, portraitSrc) { cutin = { name, t: 0, life: 1.1, img: portraitSrc ? G.FX.portrait(portraitSrc) : null }; }
  const portraits = new Map();
  function portrait(src) {
    if (!portraits.has(src)) portraits.set(src, G.Assets.img(src));
    return portraits.get(src);
  }

  /** 回傳 true 時本幀遊戲暫停更新（命中停頓） */
  function update(dt) {
    if (hitStop > 0) { hitStop -= dt; return true; }
    shake = Math.max(0, shake - dt * 30);
    for (const p of parts) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 220 * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
    }
    parts = parts.filter(p => p.t < p.life);
    for (const a of arcs) { a.t += dt; a.a += a.spin * dt; }
    arcs = arcs.filter(a => a.t < a.life);
    for (const r of rings) r.t += dt;
    rings = rings.filter(r => r.t < r.life);
    for (const t of texts) t.t += dt;
    texts = texts.filter(t => t.t < t.life);
    if (cutin) { cutin.t += dt; if (cutin.t > cutin.life) cutin = null; }
    updateAnims(dt);
    return false;
  }

  function shakeOffset() { return shake > 0 ? { x: G.U.rand(-shake, shake), y: G.U.rand(-shake, shake) } : { x: 0, y: 0 }; }

  /* ---------- PixelLab 的特效動畫（design.md 36）----------
   * assets/fx/<名稱>.png 是橫排的影格條，設定（影格大小、格數、fps、循環、錨點）在 js/data/fx-meta.js 的 G.FX_META。
   * 圖還沒載好或沒有這個特效時，下面的 impact、muzzle、shout… 會退回原本程式畫的粒子和圈圈。
   * ground：畫在單位底下（落地的塵土、地上的火），其他畫在單位上面。大小照美術比例（artScale）。
   */
  let anims = [];
  const fxArt = n => { const m = G.FX_META && G.FX_META[n]; if (!m) return null; const im = G.Assets.img(`assets/fx/${n}.png`); return im.complete && im.naturalWidth ? { im, m } : null; };
  const has = n => !!fxArt(n);
  /** 播一次（loop 的特效播 dur 秒）；o：{ rot, scale, flip, dur, ground, alpha, t0 } */
  function play(name, x, y, o = {}) { if (!has(name)) return false; anims.push({ name, x, y, t: o.t0 || 0, ...o }); if (anims.length > 300) anims.shift(); return true; }
  /** 某個特效在時間 t 是第幾格（loop 的一直循環；不循環的停在最後一格） */
  const frameAt = (m, t) => { const f = Math.floor(t * m.fps); return m.loop ? f % m.frames : Math.min(f, m.frames - 1); };
  /** 用精靈層畫一格（跟單位一起，依呼叫順序疊）；k 是縮放 */
  function drawFrame(name, t, x, y, o = {}) {
    const A = fxArt(name); if (!A) return false;
    const { im, m } = A, f = frameAt(m, t), k = G.CONFIG.artScale * (o.scale || 1);
    G.Render.frame(im, f * m.w, 0, m.w, m.h, x - m.ax * k, y - m.ay * k, o.alpha ?? 1, !!o.flip, k, 0xffffff, o.rot || 0, m.ax, m.ay);
    return true;
  }
  function updateAnims(dt) {
    for (const a of anims) a.t += dt;
    anims = anims.filter(a => { const m = G.FX_META[a.name]; return m && (m.loop ? a.t < (a.dur || 1) : a.t < m.frames / m.fps); });
  }
  /** 地面上的特效（js/game.js 在畫單位之前呼叫） */
  function drawGroundFx() { for (const a of anims) if (a.ground) drawFrame(a.name, a.t, a.x, a.y, a); }
  function drawAirFx() { for (const a of anims) if (!a.ground) drawFrame(a.name, a.t, a.x, a.y, a); }

  /** 落地衝擊：kind 'rock' 落石、'boulder' 投石、'explosion' 炸彈／砲彈 */
  function impact(x, y, kind = 'rock') {
    const name = kind === 'explosion' ? 'explosion' : `${kind}_impact`;
    if (play(name, x, y, { ground: kind !== 'explosion' })) return;
    const big = kind !== 'rock';
    for (let i = 0; i < (big ? 8 : 4); i++) dust(x + G.U.rand(-12, 12), y + G.U.rand(-6, 6), 4);
    if (kind === 'explosion') embers(x, y, 8, 10);
  }
  /** 槍口火光：a 是開火的方向 */
  function muzzle(x, y, a) { if (!play('muzzle', x, y, { rot: a })) hit(x, y, '#ffd27a', 4); }
  /** 戰吼、號令、鬼神：腳下往外擴散的光環 */
  function shout(x, y, r = 140, color = 'rgba(255,215,120,0.9)') { if (!play('shout_ring', x, y, { ground: true, scale: r / 65, alpha: 0.85 })) ring(x, y, r, color, 0.6); }

  /** 在世界座標系中畫 */
  /** 插在地上的箭（落空的箭、齊射）：留 8 秒，最多 200 支；a 是箭飛來的方向 */
  let stuckArr = [];
  function stuck(x, y, a) { stuckArr.push({ x, y, a, t: performance.now() }); if (stuckArr.length > 200) stuckArr.shift(); }
  function drawStuck(ctx) {
    const now = performance.now(), im = G.Assets.img('assets/battle/arrow_stuck.png'), ok = im.complete && im.naturalWidth;
    stuckArr = stuckArr.filter(s => now - s.t < 8000);
    for (const s of stuckArr) {
      ctx.globalAlpha = Math.min(1, (8000 - (now - s.t)) / 1000);
      if (ok) { ctx.save(); ctx.translate(s.x, s.y); if (Math.cos(s.a) < 0) ctx.scale(-1, 1); ctx.drawImage(im, -1, -im.naturalHeight); ctx.restore(); }   // 圖的錨點在左下角（箭插進土裡的地方）
      else { ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(s.a) * 4, s.y - 6); ctx.stroke(); ctx.fillStyle = '#d8d0b8'; ctx.fillRect(Math.round(s.x - Math.cos(s.a) * 4) - 1, s.y - 7, 2, 2); }
    }
    ctx.globalAlpha = 1;
  }
  function drawWorld(ctx) {
    drawStuck(ctx);
    for (const r of rings) {
      const k = r.t / r.life;
      ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * (0.4 + k * 0.8), r.r * (0.4 + k * 0.8) * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const a of arcs) {
      const k = a.t / a.life, sweep = a.arc * Math.min(1, k * 2.5);
      const from = a.a - a.arc / 2, to = from + sweep;
      ctx.save(); ctx.translate(a.x, a.y); ctx.scale(1, 0.7);
      if (a.fire) {
        ctx.globalCompositeOperation = 'lighter';
        for (const [w, c] of [[a.width * 3, 'rgba(255,90,20,0.35)'], [a.width * 1.8, 'rgba(255,170,60,0.7)'], [a.width * 0.8, 'rgba(255,245,200,0.95)']]) {
          ctx.strokeStyle = c; ctx.lineWidth = w * (1 - k * 0.6); ctx.globalAlpha = 1 - k * 0.8;
          ctx.beginPath(); ctx.arc(0, 0, a.r, from, to); ctx.stroke();
        }
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = a.width * (1 - k); ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.arc(0, 0, a.r, from, to); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    for (const p of parts) {
      const k = p.t / p.life, s = p.grow ? p.size * (1 + k * 2) : p.size;
      ctx.globalAlpha = 1 - k; ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - p.z - s / 2), s, s);
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
    for (const t of texts) {
      const k = t.t / t.life;
      ctx.globalAlpha = 1 - k * k; ctx.fillStyle = '#000'; ctx.fillText(t.v, t.x + 1, t.y - 30 - k * 14 + 1);
      ctx.fillStyle = t.color; ctx.fillText(t.v, t.x, t.y - 30 - k * 14);
    }
    ctx.globalAlpha = 1;
  }

  /** 在螢幕座標系中畫（大招特寫） */
  /** 大招特寫：左下角一小塊（頭像面向右、技能名稱），從左邊滑進來再淡出，不蓋住戰場 */
  function drawScreen(ctx, w, h) {
    if (!cutin) return;
    const t = cutin.t, inK = Math.min(1, t / 0.15), outK = Math.max(0, (t - (cutin.life - 0.25)) / 0.25), k = inK * (1 - outK);
    // 放在左下角指揮列的上面（以前固定離底 110px，會蓋到指揮列）
    const bar = document.getElementById('cmdBar'), top = bar && bar.offsetParent ? bar.getBoundingClientRect().top : h - 110;
    const S = Math.min(150, h * 0.2), x = 16 - (1 - inK) * (S + 60), y = Math.max(90, Math.min(h - S - 110, top - S - 14));
    ctx.save(); ctx.globalAlpha = k;
    // 底：深色、淡金細框，往右淡出
    const grd = ctx.createLinearGradient(x, 0, x + S * 2.6, 0);
    grd.addColorStop(0, 'rgba(10,10,12,0.88)'); grd.addColorStop(0.7, 'rgba(10,10,12,0.75)'); grd.addColorStop(1, 'rgba(10,10,12,0)');
    ctx.fillStyle = grd; ctx.fillRect(x, y, S * 2.6, S);
    ctx.fillStyle = 'rgba(214,189,134,0.8)'; ctx.fillRect(x, y, S * 2.2, 1); ctx.fillRect(x, y + S - 1, S * 2.2, 1);
    // 頭像（圖本身就是面向右，朝著戰場）
    if (cutin.img && cutin.img.complete && cutin.img.naturalWidth) { ctx.imageSmoothingEnabled = false; ctx.drawImage(cutin.img, x, y, S, S); }
    // 技能名稱：金色，旁邊一道短的刀光
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,170,60,0.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + S + 10, y + S * 0.72); ctx.lineTo(x + S + 10 + S * 1.1 * inK, y + S * 0.72); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#e8d8ae'; ctx.font = `600 ${Math.round(S * 0.3)}px "Noto Serif TC", "Songti TC", serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
    ctx.fillText(cutin.name, x + S + 14, y + S * 0.45);
    ctx.restore();
  }


  /** 擊殺提示：右上角一行字（DOM #killfeed），6 秒後淡出；hero：武將級的擊殺（加圖示、金色）；team：被打倒的是哪一方（看我方／敵方決定顏色） */
  function feed(text, hero, team) {
    const box = document.getElementById('killfeed'); if (!box) return;
    const row = document.createElement('div'); row.className = 'kf' + (hero ? ' hero' : '') + (team === (G.viewTeam || 0) ? ' ours' : ' foe');
    row.textContent = (hero ? '⚔ ' : '') + text; box.prepend(row);
    while (box.children.length > 6) box.lastChild.remove();
    setTimeout(() => row.classList.add('out'), 5000); setTimeout(() => row.remove(), 6000);
  }
  return { S, reset, hit, blood, dust, embers, slash, ring, number, feed, stuck, impact, muzzle, shout, play, has, drawFrame, drawGroundFx, drawAirFx, addShake, addHitStop, slowMo, timeScale, showCutin, portrait, update, shakeOffset, drawWorld, drawScreen };
})();
