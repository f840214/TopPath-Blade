/* ============ backup.js — 定期備份資料庫（帳號、存檔、城池、家族、市集）============
 * PGlite：伺服器開著時每 BACKUP_HOURS 小時（預設 24）把整個資料庫打包成 data/backups/pglite-<時間>.tar.gz，
 *   只留最新的 BACKUP_KEEP 份（預設 14）；開機 1 分鐘後先備份一次。
 *   還原：停掉伺服器，把 data/pglite 改名留著，執行 node server/src/restore-backup.js <備份檔>
 * 外部 PostgreSQL（DATABASE_URL）：這裡不備份，請用 pg_dump 或資料庫服務自己的備份。
 */
import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

export function startBackups(db, rootDir) {
  if (!db.dump) { console.log('備份：外部 PostgreSQL，請用 pg_dump'); return { close() {} }; }
  const dir = process.env.BACKUP_DIR || path.join(rootDir, 'data', 'backups');
  const hours = Number(process.env.BACKUP_HOURS) || 24, keep = Number(process.env.BACKUP_KEEP) || 14;
  async function run() {
    try {
      await mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
      const file = path.join(dir, `pglite-${stamp}.tar.gz`);
      await writeFile(file, await db.dump());
      const old = (await readdir(dir)).filter(f => /^pglite-.*\.tar\.gz$/.test(f)).sort().reverse().slice(keep);
      for (const f of old) await unlink(path.join(dir, f));
      console.log(`備份完成：${file}`);
    } catch (e) { console.error('備份失敗', e); }
  }
  const first = setTimeout(run, 60_000), timer = setInterval(run, hours * 3600_000);
  return { run, close() { clearTimeout(first); clearInterval(timer); } };
}
