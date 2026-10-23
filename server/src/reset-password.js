/* ============ reset-password.js — 管理員重設玩家密碼（忘記密碼用；沒有 email，所以由管理員處理）============
 * 用法（伺服器要先停掉，PGlite 同一時間只能給一個程式開）：
 *   node server/src/reset-password.js <帳號> <新密碼>
 *   Docker：docker compose stop && docker compose run --rm toppath-blade node server/src/reset-password.js <帳號> <新密碼> && docker compose start
 * 會把那個帳號所有裝置的登入都登出。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { hashPassword, checkCredentials } from './auth.js';

const [username, password] = process.argv.slice(2);
const bad = checkCredentials(username, password);
if (bad) { console.error(bad); process.exit(1); }
const db = await openDb(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
const { rows: [u] } = await db.query('SELECT id FROM users WHERE lower(username) = lower($1)', [username]);
if (!u) { console.error('找不到這個帳號'); await db.close(); process.exit(1); }
await db.query('UPDATE users SET pass_hash = $1 WHERE id = $2', [await hashPassword(password), u.id]);
await db.query('DELETE FROM sessions WHERE user_id = $1', [u.id]);
console.log(`已重設 ${username} 的密碼`);
await db.close();
