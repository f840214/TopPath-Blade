/* ============ db.js — 資料庫連線 ============
 * 有 DATABASE_URL 就連外部 PostgreSQL（多人上線用）；沒有就用 PGlite，
 * 把資料存在本機資料夾（預設專案根目錄的 data/pglite），不需要另外裝資料庫。
 * 兩種都提供 query(sql, params) → { rows } 和 exec(多行 SQL)。
 */
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

export async function openDb(rootDir) {
  let db;
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    db = { kind: 'postgres', query: (sql, params) => pool.query(sql, params), exec: sql => pool.query(sql), close: () => pool.end() };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR || path.join(rootDir, 'data', 'pglite');
    await mkdir(dir, { recursive: true });   // 第一次跑時 data/ 還不存在，PGlite 不會建上層資料夾
    const lite = await PGlite.create(dir);
    // rowCount：跟 pg 一樣（PGlite 叫 affectedRows），UPDATE / DELETE 用來判斷有沒有改到
    db = { kind: `pglite (${dir})`, query: async (sql, params) => { const r = await lite.query(sql, params); if (r.rowCount === undefined) r.rowCount = r.affectedRows ?? r.rows.length; return r; }, exec: sql => lite.exec(sql), close: () => lite.close(),
      /** 整個資料庫打包成 .tar.gz（伺服器開著也可以，備份用，見 backup.js） */
      dump: async () => Buffer.from(await (await lite.dumpDataDir('gzip')).arrayBuffer()) };
  }
  // 建表（IF NOT EXISTS，可以重複執行）
  await db.exec(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  return db;
}
