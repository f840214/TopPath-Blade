/* ============ live.js — WebSocket 即時連線：看得到其他玩家、聊天、城池歸屬廣播 ============
 * 連線：GET /ws（用登入的 cookie 驗證）。訊息都是 JSON，t 是種類。
 *   瀏覽器 → 伺服器
 *     { t: 'scene', scene, x, y }   換場景：'town:<城池 id>'、'world'、'battle'（戰鬥中不廣播位置）、'none'
 *     { t: 'pos', x, y, f, m }      目前位置、朝向、是否在走（每秒最多 20 次，多的丟掉）
 *     { t: 'chat', text }           聊天（全伺服器，每秒最多 1 句、100 字）
 *   伺服器 → 瀏覽器
 *     { t: 'welcome', id }                      自己的連線 id
 *     { t: 'peer', id, name, look, flag, x, y } 同場景有人進來（或外觀換了）
 *     { t: 'leave', id }                        同場景有人離開
 *     { t: 'snap', p: [[id, x, y, f, m], …] }   每 100ms 一次，同場景其他人的位置
 *     { t: 'chat', name, text }                 聊天
 *     { t: 'cities', cities }                   城池歸屬變了（佔領、改名、換旗）
 *     { t: 'ping' }                             每 20 秒一次，瀏覽器回 { t: 'pong' }；40 秒沒回就斷開（瀏覽器會自己重連）
 * 玩家的外觀（settings.look）和旗幟（flag）從伺服器上的存檔拿，不信任瀏覽器送來的。
 */
const TICK = 100;

export function createLive() {
  let battles = null, citiesOf = async () => ({});
  const conns = new Set();
  let nextId = 1;

  const send = (c, msg) => { if (c.ws.readyState === 1) c.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
  const inScene = scene => [...conns].filter(c => c.scene && c.scene === scene);
  const peerMsg = c => ({ t: 'peer', id: c.id, name: c.name, look: c.look, flag: c.flag, x: c.x, y: c.y });
  const live = s => s && s !== 'battle' && s !== 'none';

  function setScene(c, scene, x, y) {
    if (c.scene === scene) return;
    if (live(c.scene)) for (const o of inScene(c.scene)) if (o !== c) send(o, { t: 'leave', id: c.id });
    c.scene = scene; c.x = x; c.y = y;
    if (!live(scene)) return;
    for (const o of inScene(scene)) if (o !== c) { send(o, peerMsg(c)); send(c, peerMsg(o)); }
  }

  /** 新連線；user：{ id, username }，profile：伺服器上的存檔 */
  function join(ws, user, profile) {
    const c = { ws, id: nextId++, uid: user.id, name: user.username, scene: null, x: 0, y: 0, f: 0, m: 0, posT: [], chatT: 0, pong: Date.now() };
    applyProfile(c, profile);
    // 同一個帳號只留最新的連線：舊的（例如另一個分頁）踢掉，不然別人會看到兩個同名的人
    for (const o of conns) if (o.uid === user.id) o.ws.close(4002, 'elsewhere');
    conns.add(c);
    send(c, { t: 'welcome', id: c.id });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object') return;
      const num = v => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-100, Math.min(10000, v)) : 0);
      if (typeof m.t === 'string' && m.t.startsWith('b.')) { if (battles) battles.onMessage(c, m); return; }   // 同場戰鬥（battle-host.js）
      if (m.t === 'pong') c.pong = Date.now();
      else if (m.t === 'scene' && typeof m.scene === 'string' && m.scene.length < 40) { if (!c.room) setScene(c, m.scene, num(m.x), num(m.y)); }
      else if (m.t === 'pos') {
        const now = Date.now(); c.posT = c.posT.filter(t => now - t < 1000);
        if (c.posT.length >= 20) return;
        c.posT.push(now);
        c.x = num(m.x); c.y = num(m.y); c.f = num(m.f); c.m = m.m ? 1 : 0;
      } else if (m.t === 'chat' && typeof m.text === 'string') {
        const text = m.text.trim().slice(0, 100), now = Date.now();
        if (!text || now - c.chatT < 1000) return;
        c.chatT = now;
        broadcast({ t: 'chat', name: c.name, text });
      }
    });
    ws.on('close', () => { if (battles && c.room) battles.leave(c, '斷線離開').catch(() => {}); setScene(c, null); conns.delete(c); });
  }
  function applyProfile(c, profile) {
    const p = profile || {};
    c.look = (p.settings && typeof p.settings.look === 'string') ? p.settings.look.slice(0, 40) : null;
    c.flag = p.flag || null;
  }
  /** 存檔改了（換外觀、換旗）：更新這個玩家的所有連線，並告訴同場景的人 */
  function updateUser(uid, profile) {
    for (const c of conns) if (c.uid === uid) {
      applyProfile(c, profile);
      if (live(c.scene)) for (const o of inScene(c.scene)) if (o !== c) send(o, peerMsg(c));
    }
  }
  function broadcast(msg) { const s = JSON.stringify(msg); for (const c of conns) send(c, s); }

  // 每 100ms：每個場景送一次大家的位置
  const timer = setInterval(() => {
    const scenes = new Map();
    for (const c of conns) if (live(c.scene)) (scenes.get(c.scene) || scenes.set(c.scene, []).get(c.scene)).push(c);
    for (const list of scenes.values()) {
      if (list.length < 2) continue;
      const all = list.map(c => [c.id, Math.round(c.x), Math.round(c.y), Math.round(c.f * 100) / 100, c.m]);
      for (const c of list) send(c, { t: 'snap', p: all.filter(p => p[0] !== c.id) });
    }
  }, TICK);
  // 心跳：每 20 秒 ping，40 秒沒回應的連線關掉（網路斷掉時 TCP 不一定會發現）
  const beat = setInterval(() => {
    for (const c of conns) { if (Date.now() - c.pong > 40000) c.ws.terminate(); else send(c, { t: 'ping' }); }
  }, 20000);

  return {
    join, updateUser, broadcast,
    /** 接上同場戰鬥與城池資料（index.js 建好之後呼叫） */
    attach(b, cities) { if (b) battles = b; if (cities) citiesOf = cities; },
    async broadcastCities() { broadcast({ t: 'cities', cities: await citiesOf() }); },
    connections: () => [...conns],
    send,
    /** 送給某個玩家的所有連線 */
    sendTo(uid, msg) { for (const c of conns) if (c.uid === uid) send(c, msg); }, close: () => { clearInterval(timer); clearInterval(beat); }, get count() { return conns.size; } };
}
