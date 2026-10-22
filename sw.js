/* ============ sw.js — service worker：把遊戲檔案存在瀏覽器裡 ============
 * 第二次之後開遊戲，圖片和函式庫直接從本機快取拿，不用再向伺服器要（也不用等 304）。
 * 更新方式：比對伺服器的 /assets-manifest.json（每個檔案的大小＋修改時間），只重新下載有變的檔案。
 *   - 每次開遊戲，頁面（js/core/assets.js）會送 'sync' 訊息並顯示進度，同步完才開始載圖，所以不會拿到舊圖。
 * 取檔策略：
 *   - assets/、lib/：先看快取，沒有才上網（拿到就存起來）
 *   - 頁面、js、css：先上網拿最新的，斷線時才用快取（改程式不用清快取）
 *   - /api、清單、sw.js 自己：一律上網，不經過快取
 */
const CACHE = 'tpb-files', MANIFEST_KEY = '/__manifest';
let syncing = null;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

/** 跟伺服器的清單比對，下載有變的、刪掉不見的；report(done, total) 回報進度 */
function sync(report) {
  if (!syncing) syncing = doSync(report).finally(() => { syncing = null; });
  return syncing;
}
async function doSync(report = () => {}) {
  const m = await (await fetch('/assets-manifest.json', { cache: 'no-store' })).json();
  const cache = await caches.open(CACHE), oldRes = await cache.match(MANIFEST_KEY), old = oldRes ? await oldRes.json() : {};
  const url = p => (p === 'index.html' ? '/' : '/' + p);
  const changed = Object.keys(m.files).filter(p => old[p] !== m.files[p]);
  let done = 0; report(done, changed.length);
  for (let i = 0; i < changed.length; i += 8) {   // 一次 8 個
    await Promise.all(changed.slice(i, i + 8).map(async p => {
      try { const r = await fetch(url(p), { cache: 'no-store' }); if (r.ok) await cache.put(url(p), r); } catch { /* 下次再試 */ }
      report(++done, changed.length);
    }));
  }
  for (const p of Object.keys(old)) if (!(p in m.files)) await cache.delete(url(p));
  await cache.put(MANIFEST_KEY, new Response(JSON.stringify(m.files)));
  return m.version;
}

self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'sync') return;
  const src = e.source;
  e.waitUntil(sync((done, total) => src && src.postMessage({ type: 'progress', done, total }))
    .then(version => src && src.postMessage({ type: 'synced', version }))
    .catch(err => src && src.postMessage({ type: 'synced', error: String(err) })));
});

self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname === '/assets-manifest.json' || u.pathname === '/sw.js') return;
  const cacheFirst = u.pathname.startsWith('/assets/') || u.pathname.startsWith('/lib/');
  e.respondWith(cacheFirst ? fromCache(req) : fromNetwork(req));
});
async function fromCache(req) {
  const cache = await caches.open(CACHE), hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) cache.put(new URL(req.url).pathname, r.clone());
  return r;
}
async function fromNetwork(req) {
  try { return await fetch(req); }
  catch (err) {
    const hit = await (await caches.open(CACHE)).match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
