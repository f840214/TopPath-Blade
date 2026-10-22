/* ============ auth.js — 密碼雜湊與登入工作階段 ============ */
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1 }, KEYLEN = 64;
export const SESSION_COOKIE = 'tpb_session';
export const SESSION_DAYS = 30;

/** 存成 scrypt$N$r$p$鹽$雜湊（base64），參數跟著存，之後要調高強度也能驗舊密碼 */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(key, expected);
}

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

export async function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [sha256(token), userId]);
  return token;
}

/** 從 cookie 找出登入中的玩家；過期或不存在回傳 null */
export async function userFromToken(db, token) {
  if (!token) return null;
  const { rows } = await db.query(
    `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)]);
  return rows[0] || null;
}

export async function deleteSession(db, token) {
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
}

export const purgeExpiredSessions = db => db.query('DELETE FROM sessions WHERE expires_at <= now()');

/** 帳號：2～16 個字（中英文、數字、底線）；密碼：1～128 個字 */
export function checkCredentials(username, password) {
  if (typeof username !== 'string' || !/^[\p{L}\p{N}_]{2,16}$/u.test(username)) return '帳號要 2～16 個字，只能用文字、數字、底線';
  if (typeof password !== 'string' || password.length < 1 || password.length > 128) return '密碼要 1～128 個字';
  return null;
}
