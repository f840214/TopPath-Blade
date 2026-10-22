/* ============ fx.js — 特效 ============
 * 粒子、刀光、震波、傷害數字、畫面震動、命中停頓、大招特寫。
 * 全部是程式繪製，不需要額外素材（大招特寫的立繪除外）。
 */
G.FX = (() => {
  let parts = [], arcs = [], rings = [], texts = [], cutin = null;
  let shake = 0, hitStop = 0, slow = null;   // slow：慢動作 { left, scale }
  const S = { shake: false };   // 設定：畫面震動開關（預設關，V 鍵可開）

  function reset() { parts = []; arcs = []; rings = []; texts = []; cutin = null; shake = 0; hitStop = 0; slow = null; }

  /** 受擊火花＋塵土 */
  function hit(x, y, color = '#fff2b0', n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = G.U.rand(40, 110);
      parts.push({ x, y, z: 12, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: G.U.rand(20, 80), life: G.U.rand(0.2, 0.4), t: 0, color, size: 2 });
    }
  }
  function blood(x, y, n = 4) { hit(x, y, '#8c1d1d', n); }
  function dust(x, y, n = 5) {
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
    arcs.push({ x, y, a, r, arc, t: 0, life: o.life || 0.22, fire: !!o.fire, width: o.width || 4, spin: o.spin || 0 });
    if (o.fire) for (let i = 0; i < 8; i++) {
      const aa = a + G.U.rand(-arc / 2, arc / 2);
      embers(x + Math.cos(aa) * r, y + Math.sin(aa) * r * 0.7, 1, 4);
    }
  }
  function ring(x, y, r, color = 'rgba(255,220,150,0.9)', life = 0.35) { rings.push({ x, y, r, color, t: 0, life }); }
  function number(x, y, v, color = '#fff') {
    texts.push({ x: x + G.U.rand(-4, 4), y, v: Math.round(v), color, t: 0, life: 0.7 });
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
    return false;
  }

  function shakeOffset() { return shake > 0 ? { x: G.U.rand(-shake, shake), y: G.U.rand(-shake, shake) } : { x: 0, y: 0 }; }

  /** 在世界座標系中畫 */
  function drawWorld(ctx) {
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


  return { S, reset, hit, blood, dust, embers, slash, ring, number, addShake, addHitStop, slowMo, timeScale, showCutin, portrait, update, shakeOffset, drawWorld, drawScreen };
})();
