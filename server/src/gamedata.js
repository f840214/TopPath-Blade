/* ============ gamedata.js — 伺服器重用遊戲本身的資料和名冊邏輯 ============
 * 把瀏覽器用的 js/data/*.js、js/core/util.js、js/systems/army.js 放進一個 Node vm 執行，
 * 拿到同一份 G.UNITS、G.ARMY、G.WORLD、G.Army…，伺服器結算時就跟遊戲裡的規則完全一樣（不用抄兩份）。
 * 每次要算某個玩家的存檔就呼叫 withProfile(data, fn)：載入存檔 → 執行 fn(G) → 拿回改過的存檔。
 * 這些檔案只在伺服器啟動時讀一次；改了遊戲數值要重啟伺服器。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const FILES = ['js/data/config.js', 'js/core/util.js', 'js/data/units.js', 'js/data/counters.js', 'js/data/skills.js', 'js/data/heroes.js',
  'js/data/army.js', 'js/data/veteran.js', 'js/data/town.js', 'js/data/town-main.js', 'js/data/town-small.js', 'js/data/world.js', 'js/systems/army.js'];

export async function loadGame(root) {
  const ctx = { console, Math, JSON };
  ctx.window = ctx;   // config.js 用 window.G
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(await readFile(path.join(root, f), 'utf8'), ctx, { filename: f });
  const G = ctx.G;
  G.Army.server = true;   // 伺服器上的 G.Army 不自己存檔、不呼叫 API，由呼叫的人寫回資料庫

  /** 在這個玩家的存檔上執行 fn；回傳 { data: 改過的存檔, result: fn 的回傳值 } */
  function withProfile(data, fn) {
    G.Army.useProfile(data ? JSON.parse(JSON.stringify(data)) : null);
    const result = fn(G);
    return { data: JSON.parse(JSON.stringify(G.Army.profile())), result };
  }
  return { G, withProfile };
}
