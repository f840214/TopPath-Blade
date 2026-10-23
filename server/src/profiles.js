/* ============ profiles.js — 讀寫玩家存檔（game-api、social、battle-host 共用）============
 * edit(uid, fn)：同一個玩家的存檔改動排隊做（市集有人買走你的東西、你自己在招兵，同時來時不會互相蓋掉）。
 *   fn(data) 回傳 { data: 新的存檔（有給才存）, ...其他 }，edit 會原樣回傳。
 */
export function createProfiles({ db, game }) {
  /** 讀存檔；沒有或是舊格式就建一份新的存起來 */
  async function load(uid) {
    const { rows: [p] } = await db.query('SELECT data FROM profiles WHERE user_id = $1', [uid]);
    let data = p && p.data;
    if (!data || !Array.isArray(data.roster)) { data = game.withProfile(null, () => {}).data; await store(uid, data); }
    return data;
  }
  async function store(uid, data) {
    await db.query(`INSERT INTO profiles (user_id, data, updated_at) VALUES ($1, $2, now())
      ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [uid, JSON.stringify(data)]);
  }
  const locks = new Map();
  function edit(uid, fn) {
    const prev = locks.get(uid) || Promise.resolve();
    const next = prev.catch(() => {}).then(async () => {
      const r = (await fn(await load(uid))) || {};
      if (r.data) await store(uid, r.data);
      return r;
    });
    locks.set(uid, next);
    next.catch(() => {}).finally(() => { if (locks.get(uid) === next) locks.delete(uid); });
    return next;
  }
  return { load, store, edit };
}
