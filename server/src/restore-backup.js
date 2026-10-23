/* ============ restore-backup.js — 從備份還原 PGlite 資料庫 ============
 * 用法（伺服器要先停掉）：node server/src/restore-backup.js data/backups/pglite-<時間>.tar.gz
 * 會把目前的 data/pglite 改名成 data/pglite-old-<時間>（不會刪），再從備份建一個新的。
 */
import { readFile, rename, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const file = process.argv[2];
if (!file) { console.error('用法：node server/src/restore-backup.js <備份檔>'); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = process.env.PGLITE_DIR || path.join(root, 'data', 'pglite');
try { await access(dir); const moved = `${dir}-old-${Date.now()}`; await rename(dir, moved); console.log(`原本的資料庫移到 ${moved}`); } catch { /* 沒有舊的 */ }
const lite = await PGlite.create(dir, { loadDataDir: new Blob([await readFile(file)]) });
const { rows: [{ n }] } = await lite.query('SELECT count(*)::int AS n FROM users');
console.log(`還原完成：${n} 個帳號`);
await lite.close();
