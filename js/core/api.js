/* ============ api.js — 呼叫後端（server/）：帳號、存檔、名冊操作、出戰結算、城池 ============
 * 登入狀態放在 httpOnly cookie，JS 讀不到也不用管；失敗時丟出帶中文訊息的 Error（e.status 是 HTTP 狀態碼）。
 */
G.Api = (() => {
  async function call(method, url, body) {
    let r;
    try {
      r = await fetch(url, {
        method, credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) { throw Object.assign(new Error('連不上伺服器'), { status: 0 }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = r.status === 429 ? '嘗試太多次，請一分鐘後再試' : j.error || `伺服器錯誤（${r.status}）`;
      throw Object.assign(new Error(msg), { status: r.status });
    }
    return j;
  }
  return {
    me: () => call('GET', '/api/me'),
    login: (username, password) => call('POST', '/api/login', { username, password }),
    register: (username, password) => call('POST', '/api/register', { username, password }),
    logout: () => call('POST', '/api/logout'),
    loadProfile: () => call('GET', '/api/profile'),
    /** 只會存 settings、flag、world（位置、強盜）；金幣、經驗、名冊由伺服器決定 */
    saveProfile: data => call('PUT', '/api/profile', { data }),
    armyOp: (op, args) => call('POST', '/api/army', { op, args }),
    battleStart: (kind, target) => call('POST', '/api/battle/start', { kind, target }),
    battleEnd: body => call('POST', '/api/battle/end', body),
    world: () => call('GET', '/api/world'),
    saveCity: (id, name, art) => call('POST', '/api/world/city', { id, name, art }),
    collect: () => call('POST', '/api/world/collect'),
    changePassword: (old, password) => call('POST', '/api/password', { old, password }),
    // 好友、家族、市集、採集（server/src/social.js）
    social: () => call('GET', '/api/social'),
    friends: body => call('POST', '/api/friends', body),
    guild: body => call('POST', '/api/guild', body),
    market: () => call('GET', '/api/market'),
    marketOp: body => call('POST', '/api/market', body),
    gather: node => call('POST', '/api/gather', { node }),
    requisition: i => call('POST', '/api/requisition', { i }),
  };
})();
