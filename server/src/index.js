/* ============ index.js — TopPath Blade 後端 ============
 * 一個程式同時提供：遊戲靜態檔案（只開放 index.html、sw.js、css、js、lib、assets）＋ /api（帳號、存檔）。
 * 環境變數：PORT（預設 8765）、DATABASE_URL（不設就用本機 PGlite）、PGLITE_DIR、COOKIE_SECURE=1（走 HTTPS 時）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyCompress from '@fastify/compress';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import { openDb } from './db.js';
import { hashPassword, verifyPassword, createSession, userFromToken, deleteSession, purgeExpiredSessions, checkCredentials, SESSION_COOKIE, SESSION_DAYS } from './auth.js';
import { loadGame } from './gamedata.js';
import { createLive } from './live.js';
import { registerGameApi } from './game-api.js';
import { createBattles } from './battle-host.js';
import { createWorldSim } from './world-sim.js';
import { createProfiles } from './profiles.js';
import { createSocial } from './social.js';
import { startBackups } from './backup.js';
import { buildManifest } from './manifest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = +(process.env.PORT || 8765);

const db = await openDb(ROOT);
const game = await loadGame(ROOT);   // 伺服器重用遊戲的資料與名冊邏輯（gamedata.js）
const live = createLive();
const app = Fastify({ logger: { level: 'info' }, bodyLimit: 64 * 1024, trustProxy: true });

await app.register(fastifyCompress);
await app.register(fastifyCookie);
await app.register(fastifyRateLimit, { global: false });
await app.register(fastifyWebsocket, { options: { maxPayload: 16 * 1024, perMessageDeflate: true } });   // 壓縮：戰場狀態每秒 20 次，壓縮後小很多

/* ---------- 靜態檔案：只開放遊戲需要的資料夾，server/、data/、.git 都不會被讀到 ---------- */
// maxAge 0：瀏覽器每次都會向伺服器確認有沒有新版（沒變就回 304），改版後重新整理就拿到新檔
for (const [i, dir] of ['css', 'js', 'lib', 'assets'].entries())
  await app.register(fastifyStatic, { root: path.join(ROOT, dir), prefix: `/${dir}/`, decorateReply: i === 0, maxAge: 0 });
app.get('/', (req, reply) => reply.sendFile('index.html', ROOT));
// service worker 要放在網站根目錄才管得到整個網站；它自己不能被快取，不然更新不到
app.get('/sw.js', (req, reply) => reply.header('Cache-Control', 'no-cache').sendFile('sw.js', ROOT));
// 檔案清單（js/core/assets.js 和 sw.js 用）
app.get('/assets-manifest.json', async (req, reply) => reply.header('Cache-Control', 'no-store').send(await buildManifest(ROOT)));

/* ---------- 帳號 ---------- */
const cookieOpts = { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1', maxAge: SESSION_DAYS * 86400 };
const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };   // 擋暴力猜密碼

/** 需要登入的路由：找不到登入中的玩家就回 401 */
async function requireUser(req, reply) {
  req.user = await userFromToken(db, req.cookies[SESSION_COOKIE]);
  if (!req.user) return reply.code(401).send({ error: '請先登入' });
}

app.post('/api/register', authLimit, async (req, reply) => {
  const { username, password } = req.body || {};
  const bad = checkCredentials(username, password);
  if (bad) return reply.code(400).send({ error: bad });
  const hash = await hashPassword(password);
  let id;
  try {
    // 同一句 SQL 建帳號＋空存檔，不需要交易
    ({ rows: [{ user_id: id }] } = await db.query(
      `WITH u AS (INSERT INTO users (username, pass_hash) VALUES ($1, $2) RETURNING id)
       INSERT INTO profiles (user_id) SELECT id FROM u RETURNING user_id`, [username, hash]));
  } catch (e) {
    if (e.code === '23505') return reply.code(409).send({ error: '這個帳號已經有人用了' });
    throw e;
  }
  reply.setCookie(SESSION_COOKIE, await createSession(db, id), cookieOpts);
  return { username };
});

app.post('/api/login', authLimit, async (req, reply) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') return reply.code(400).send({ error: '請輸入帳號和密碼' });
  const { rows: [u] } = await db.query('SELECT id, username, pass_hash FROM users WHERE lower(username) = lower($1)', [username]);
  // 帳號不存在和密碼錯誤回一樣的訊息，避免被拿來試探哪些帳號存在
  if (!u || !(await verifyPassword(password, u.pass_hash))) return reply.code(401).send({ error: '帳號或密碼錯誤' });
  await purgeExpiredSessions(db);
  reply.setCookie(SESSION_COOKIE, await createSession(db, u.id), cookieOpts);
  return { username: u.username };
});

app.post('/api/logout', async (req, reply) => {
  await deleteSession(db, req.cookies[SESSION_COOKIE]);
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  return { ok: true };
});

app.get('/api/me', { preHandler: requireUser }, async req => ({ username: req.user.username }));

/** 改密碼：要先輸入舊密碼；改完其他裝置的登入都登出，只留這一個 */
app.post('/api/password', { preHandler: requireUser, ...authLimit }, async (req, reply) => {
  const { old, password } = req.body || {};
  const bad = checkCredentials(req.user.username, password);
  if (bad) return reply.code(400).send({ error: bad });
  const { rows: [u] } = await db.query('SELECT pass_hash FROM users WHERE id = $1', [req.user.id]);
  if (typeof old !== 'string' || !(await verifyPassword(old, u.pass_hash))) return reply.code(401).send({ error: '舊密碼不對' });
  await db.query('UPDATE users SET pass_hash = $1 WHERE id = $2', [await hashPassword(password), req.user.id]);
  await db.query('DELETE FROM sessions WHERE user_id = $1', [req.user.id]);
  reply.setCookie(SESSION_COOKIE, await createSession(db, req.user.id), cookieOpts);
  return { ok: true };
});

/* ---------- 存檔、名冊、出戰結算、城池歸屬（由伺服器決定，見 game-api.js） ---------- */
// 大地圖共用的事：城池收入、糧食、北境聯軍（world-sim.js）
const profiles = createProfiles({ db, game });
const world = createWorldSim({ db, game, live, profiles });
// 好友、私訊、家族、市集、採集、攻城時段（social.js）
const social = createSocial({ db, game, live, profiles });
await social.refreshGuilds();
social.register(app, requireUser);
registerGameApi(app, { db, game, live, world, profiles, social, requireUser });
// 同場戰鬥：伺服器跑戰鬥模擬（battle-host.js），訊息走同一條 WebSocket
live.attach(await createBattles({ root: ROOT, game, live, db, profiles, social, world }), null, social);

/* ---------- 即時連線（live.js）：登入的 cookie 驗證 ---------- */
app.get('/ws', { websocket: true }, async (socket, req) => {
  const user = await userFromToken(db, req.cookies[SESSION_COOKIE]);
  if (!user) return socket.close(4001, 'login');
  const { rows: [p] } = await db.query('SELECT data FROM profiles WHERE user_id = $1', [user.id]);
  live.join(socket, user, p && p.data);
});

/* ---------- 啟動 ---------- */
// 定期備份資料庫（backup.js）
const backups = startBackups(db, ROOT);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { backups.close(); live.close(); world.close(); await app.close(); await db.close(); process.exit(0); });
await app.listen({ port: PORT, host: '0.0.0.0' });
app.log.info(`資料庫：${db.kind}`);
