/* ============ index.js — TopPath Blade 後端 ============
 * 一個程式同時提供：遊戲靜態檔案（只開放 index.html、css、js、lib、assets）＋ /api（帳號、存檔）。
 * 環境變數：PORT（預設 8765）、DATABASE_URL（不設就用本機 PGlite）、PGLITE_DIR、COOKIE_SECURE=1（走 HTTPS 時）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyCompress from '@fastify/compress';
import fastifyRateLimit from '@fastify/rate-limit';
import { openDb } from './db.js';
import { hashPassword, verifyPassword, createSession, userFromToken, deleteSession, purgeExpiredSessions, checkCredentials, SESSION_COOKIE, SESSION_DAYS } from './auth.js';
import { checkProfile } from './profile.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = +(process.env.PORT || 8765);

const db = await openDb(ROOT);
const app = Fastify({ logger: { level: 'info' }, bodyLimit: 64 * 1024, trustProxy: true });

await app.register(fastifyCompress);
await app.register(fastifyCookie);
await app.register(fastifyRateLimit, { global: false });

/* ---------- 靜態檔案：只開放遊戲需要的資料夾，server/、data/、.git 都不會被讀到 ---------- */
// maxAge 0：瀏覽器每次都會向伺服器確認有沒有新版（沒變就回 304），改版後重新整理就拿到新檔
for (const [i, dir] of ['css', 'js', 'lib', 'assets'].entries())
  await app.register(fastifyStatic, { root: path.join(ROOT, dir), prefix: `/${dir}/`, decorateReply: i === 0, maxAge: 0 });
app.get('/', (req, reply) => reply.sendFile('index.html', ROOT));

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

/* ---------- 存檔 ---------- */
app.get('/api/profile', { preHandler: requireUser }, async req => {
  const { rows: [p] } = await db.query('SELECT data FROM profiles WHERE user_id = $1', [req.user.id]);
  return { data: p ? p.data : null };
});

app.put('/api/profile', { preHandler: requireUser }, async (req, reply) => {
  const data = req.body && req.body.data, bad = checkProfile(data);
  if (bad) return reply.code(400).send({ error: bad });
  await db.query(
    `INSERT INTO profiles (user_id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [req.user.id, JSON.stringify(data)]);
  return { ok: true };
});

/* ---------- 啟動 ---------- */
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await app.close(); await db.close(); process.exit(0); });
await app.listen({ port: PORT, host: '0.0.0.0' });
app.log.info(`資料庫：${db.kind}`);
