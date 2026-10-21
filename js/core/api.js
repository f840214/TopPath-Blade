/* ============ api.js — 呼叫後端（server/）：帳號與存檔 ============
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
    saveProfile: data => call('PUT', '/api/profile', { data }),
  };
})();
