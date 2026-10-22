/* ============ heraldry.js — 玩家旗幟（徽章）============
 * 旗幟存在存檔的 flag 欄位，兩種：
 *   { d: 'design', bg, fg, div, icon }：底色、第二色、分割方式（DIVS）、中間的圖案（ICONS，用文字畫）
 *   { d: 'image', src }：玩家上傳的圖，縮成 FLAG_W × FLAG_H 的 PNG（data URL，伺服器限制大小）
 * draw(flag, w, h) 回傳畫好的 canvas（依內容快取），大地圖名牌旁邊、城池上的旗子、介面都用它。
 * 編輯器是 #flagDlg：open(cur, onDone)。
 */
G.Heraldry = (() => {
  const $ = id => document.getElementById(id);
  const FLAG_W = 32, FLAG_H = 40, MAX_FILE = 2 * 1024 * 1024, MAX_URL = 8000;
  const COLORS = ['#7a1f1a', '#2c4a7a', '#2f5a34', '#1d1e22', '#d8cfb8', '#c7a44a', '#5a2a66', '#a65a1e'];
  const DIVS = { plain: '單色', pale: '左右', fess: '上下', quarter: '四分', bend: '斜分', cross: '十字', saltire: '斜十字', chevron: '人字' };
  const ICONS = ['', '⚔', '✠', '★', '◆', '☽', '✿', '♛', '龍', '虎', '鷹', '武', '義', '戰', '王'];
  const DEFAULT = { d: 'design', bg: '#2c4a7a', fg: '#c7a44a', div: 'plain', icon: '⚔' };

  const cache = new Map();
  const images = new Map();
  /** 旗面（不含旗桿）；下緣剪成燕尾 */
  function draw(flag, w = FLAG_W, h = FLAG_H) {
    flag = flag || DEFAULT;
    const key = JSON.stringify(flag) + w + 'x' + h;
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.save();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(w / 2, h * 0.84); g.lineTo(0, h); g.closePath(); g.clip();
    if (flag.d === 'image') {
      let im = images.get(flag.src);
      if (!im) { im = new Image(); im.onload = () => { for (const k of [...cache.keys()]) if (k.includes(flag.src.slice(-40))) cache.delete(k); }; im.src = flag.src; images.set(flag.src, im); }
      if (im.complete && im.naturalWidth) { g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0, w, h); }
      else { g.fillStyle = '#333'; g.fillRect(0, 0, w, h); }
    } else {
      g.fillStyle = flag.bg; g.fillRect(0, 0, w, h);
      g.fillStyle = flag.fg;
      const t = Math.max(2, Math.round(w / 6));
      switch (flag.div) {
        case 'pale': g.fillRect(w / 2, 0, w / 2, h); break;
        case 'fess': g.fillRect(0, h / 2, w, h / 2); break;
        case 'quarter': g.fillRect(w / 2, 0, w / 2, h / 2); g.fillRect(0, h / 2, w / 2, h / 2); break;
        case 'bend': g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h); g.closePath(); g.fill(); break;
        case 'cross': g.fillRect(w / 2 - t / 2, 0, t, h); g.fillRect(0, h * 0.42 - t / 2, w, t); break;
        case 'saltire': g.lineWidth = t; g.strokeStyle = flag.fg; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke(); break;
        case 'chevron': g.lineWidth = t; g.strokeStyle = flag.fg; g.beginPath(); g.moveTo(0, h * 0.75); g.lineTo(w / 2, h * 0.3); g.lineTo(w, h * 0.75); g.stroke(); break;
      }
      if (flag.icon) {
        // 圖案用跟底色對比的顏色，加一圈深色描邊才看得清楚
        const fs = Math.round(w * 0.62);
        g.font = `bold ${fs}px "Noto Serif TC", "Songti TC", serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = Math.max(2, w / 12); g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(flag.icon, w / 2, h * 0.42);
        g.fillStyle = flag.div === 'plain' ? flag.fg : '#efe6cf'; g.fillText(flag.icon, w / 2, h * 0.42);
      }
    }
    g.restore();
    // 外框
    g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0.5, 0.5); g.lineTo(w - 0.5, 0.5); g.lineTo(w - 0.5, h - 0.5); g.lineTo(w / 2, h * 0.84); g.lineTo(0.5, h - 0.5); g.closePath(); g.stroke();
    cache.set(key, c);
    return c;
  }

  /** 上傳的圖：檢查大小，縮成 FLAG_W × FLAG_H（裁切置中、像素化），回傳 data URL */
  function fromFile(file) {
    return new Promise((ok, fail) => {
      if (!/^image\//.test(file.type)) return fail(new Error('請選擇圖片檔'));
      if (file.size > MAX_FILE) return fail(new Error('圖片太大（上限 2MB）'));
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = FLAG_W; c.height = FLAG_H;
        const g = c.getContext('2d'), k = Math.max(FLAG_W / im.width, FLAG_H / im.height), w = im.width * k, h = im.height * k;
        g.imageSmoothingQuality = 'high'; g.drawImage(im, (FLAG_W - w) / 2, (FLAG_H - h) / 2, w, h);
        URL.revokeObjectURL(url);
        const src = c.toDataURL('image/png');
        src.length > MAX_URL ? fail(new Error('圖片細節太多，換一張簡單一點的')) : ok(src);
      };
      im.onerror = () => { URL.revokeObjectURL(url); fail(new Error('讀不到這張圖')); };
      im.src = url;
    });
  }

  /* ---------- 編輯器 ---------- */
  let cur = null, done = null;
  function swatches(id, field) {
    $(id).innerHTML = COLORS.map(c => `<button type="button" class="sw${cur[field] === c ? ' on' : ''}" style="background:${c}" data-c="${c}"></button>`).join('');
    $(id).onclick = e => { const b = e.target.closest('[data-c]'); if (b) { cur = { ...cur, d: 'design', [field]: b.dataset.c }; render(); } };
  }
  function render() {
    const big = draw(cur, 96, 120), p = $('flPreview');
    p.width = 96; p.height = 120; const g = p.getContext('2d'); g.clearRect(0, 0, 96, 120); g.drawImage(big, 0, 0);
    if (cur.d === 'image' && !(images.get(cur.src) || {}).complete) setTimeout(render, 100);
    const d = cur.d === 'design' ? cur : { ...DEFAULT, d: 'design' };
    if (cur.d !== 'design') cur = { ...cur, bg: d.bg, fg: d.fg, div: d.div, icon: d.icon };
    swatches('flBg', 'bg'); swatches('flFg', 'fg');
    $('flDiv').innerHTML = Object.entries(DIVS).map(([k, n]) => `<button type="button" class="mini${cur.div === k ? ' hot' : ''}" data-v="${k}">${n}</button>`).join('');
    $('flIcon').innerHTML = ICONS.map(i => `<button type="button" class="mini${cur.icon === i ? ' hot' : ''}" data-v="${i}">${i || '無'}</button>`).join('');
  }
  function open(flag, onDone) {
    cur = { ...DEFAULT, ...(flag || {}) }; done = onDone;
    $('flMsg').textContent = '';
    $('flagDlg').style.display = 'flex';
    render();
  }
  function bind() {
    $('flDiv').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { cur = { ...cur, d: 'design', div: b.dataset.v }; render(); } };
    $('flIcon').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { cur = { ...cur, d: 'design', icon: b.dataset.v }; render(); } };
    $('flFile').onchange = async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try { cur = { ...cur, d: 'image', src: await fromFile(f) }; $('flMsg').textContent = '已套用上傳的圖（32×40）'; render(); }
      catch (err) { $('flMsg').textContent = err.message; }
    };
    $('flOk').onclick = () => {
      const out = cur.d === 'image' ? { d: 'image', src: cur.src } : { d: 'design', bg: cur.bg, fg: cur.fg, div: cur.div, icon: cur.icon };
      $('flagDlg').style.display = 'none'; done && done(out);
    };
    $('flCancel').onclick = () => { $('flagDlg').style.display = 'none'; };
  }
  const isOpen = () => $('flagDlg').style.display === 'flex';

  return { draw, open, bind, isOpen, DEFAULT };
})();
