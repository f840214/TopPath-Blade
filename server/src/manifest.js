/* ============ manifest.js — 遊戲檔案清單（給 service worker 預先快取、開場預先載入圖片）============
 * 列出 index.html、css、js、lib、assets 底下的每個檔案和它的簽章（大小＋修改時間）。
 * service worker 拿新舊清單比對，只重新下載有變的檔案；version 是整份清單的雜湊，有任何檔案變了就會不同。
 * 結果快取 3 秒，避免每次重新整理都掃一次硬碟。
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DIRS = ['css', 'js', 'lib', 'assets'];
let cached = null, cachedAt = 0;

async function walk(root, rel, out) {
  for (const e of await readdir(path.join(root, rel), { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.posix.join(rel, e.name);
    if (e.isDirectory()) await walk(root, p, out);
    else if (e.isFile()) { const s = await stat(path.join(root, p)); out[p] = `${s.size}-${Math.round(s.mtimeMs)}`; }
  }
}

export async function buildManifest(root) {
  if (cached && Date.now() - cachedAt < 3000) return cached;
  const files = {};
  const s = await stat(path.join(root, 'index.html'));
  files['index.html'] = `${s.size}-${Math.round(s.mtimeMs)}`;
  for (const d of DIRS) await walk(root, d, files);
  const version = crypto.createHash('sha1').update(JSON.stringify(files)).digest('hex').slice(0, 12);
  cached = { version, files }; cachedAt = Date.now();
  return cached;
}
