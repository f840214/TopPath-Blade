/* ============ assets.js — 開場預先載入全部圖片 ============
 * 1. 註冊 service worker（sw.js），請它跟伺服器的清單同步（只下載有變的檔案），顯示下載進度；
 *    瀏覽器不支援（例如不是 https 也不是 localhost）就跳過，直接向伺服器要。
 * 2. 把清單裡所有圖片載入並解碼好，之後換場景、第一次畫某張圖都不會卡或閃。
 * 遊戲各處要圖都用 G.Assets.img(src)，拿到的是同一個已經載好的 Image。
 */
G.Assets = (() => {
  const imgs = new Map();
  let done = false;

  /** 同一個網址只會有一個 Image */
  function img(src) {
    let im = imgs.get(src);
    if (!im) { im = new Image(); im.src = src; imgs.set(src, im); }
    return im;
  }

  /** service worker 同步；onProgress(done, total) */
  async function syncWorker(onProgress) {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      const sw = reg.active || navigator.serviceWorker.controller;
      if (!sw) return;
      await new Promise(ok => {
        const onMsg = e => {
          if (e.data.type === 'progress') onProgress(e.data.done, e.data.total);
          if (e.data.type === 'synced') { navigator.serviceWorker.removeEventListener('message', onMsg); ok(); }
        };
        navigator.serviceWorker.addEventListener('message', onMsg);
        sw.postMessage({ type: 'sync' });
        setTimeout(ok, 60000);   // 萬一沒回應，最多等一分鐘
      });
    } catch (e) { console.warn('service worker 無法使用：', e); }
  }

  /** 開場呼叫：onProgress(0～1, 文字) */
  async function boot(onProgress = () => {}) {
    let files = [];
    try { files = Object.keys((await (await fetch('/assets-manifest.json', { cache: 'no-store' })).json()).files); } catch { /* 拿不到清單就只靠用到時再載 */ }
    await syncWorker((d, t) => onProgress(t ? d / t * 0.5 : 0.5, t ? `下載更新 ${d}/${t}` : '檢查更新'));
    const list = files.filter(p => p.startsWith('assets/') && /\.(png|jpe?g|webp|gif)$/i.test(p));
    let n = 0;
    await Promise.all(list.map(p => {
      const im = img(p);
      return (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => onProgress(0.5 + ++n / list.length * 0.5, `載入圖片 ${n}/${list.length}`));
    }));
    done = true;
    onProgress(1, '完成');
  }

  return { img, boot, get done() { return done; } };
})();
