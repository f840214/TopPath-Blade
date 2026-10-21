/* ============ profile.js — 玩家存檔的基本檢查 ============
 * 目前戰鬥在玩家的瀏覽器裡算、結果由瀏覽器上傳，所以這裡只擋明顯不合理的資料
 * （型別、範圍、大小）。之後戰鬥搬到伺服器計算，才能真正防作弊。
 */
const TYPES = new Set(['pikeman', 'shieldman', 'archer', 'cavalry']);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/** 回傳錯誤原因；沒問題回傳 null */
export function checkProfile(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return '存檔格式錯誤';
  if (!int(d.gold, 0, 1e9)) return '金幣數值不合理';
  if (!d.hero || !int(d.hero.level, 1, 30) || !int(d.hero.xp, 0, 1e7)) return '武將資料不合理';
  if (!Array.isArray(d.roster) || d.roster.length > 8) return '名冊資料不合理';
  const ids = new Set();
  for (const s of d.roster) {
    if (!s || !TYPES.has(s.type) || !int(s.id, 1, 1e9) || ids.has(s.id)) return '兵團資料不合理';
    if (!int(s.men, 0, 50) || !int(s.level, 1, 10) || !int(s.xp, 0, 1e7) || typeof s.deployed !== 'boolean') return '兵團資料不合理';
    if (!Array.isArray(s.vet) || s.vet.length !== 2 || !s.vet.every(v => int(v, 0, 5)) || s.vet[0] + s.vet[1] > s.level - 1) return '老兵樹資料不合理';
    ids.add(s.id);
  }
  if (d.settings !== undefined && (typeof d.settings !== 'object' || JSON.stringify(d.settings).length > 2000)) return '設定資料不合理';
  return null;
}
