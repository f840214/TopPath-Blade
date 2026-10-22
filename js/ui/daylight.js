/* ============ daylight.js — 依本地時間的光影：清晨暖、白天亮、黃昏橘紅、夜晚暗藍 ============
 * 一層全畫面的 #light 疊在遊戲畫面上（mix-blend-mode: multiply，只會讓畫面變暗或染色，不擋操作）。
 * 顏色與濃度照下面的關鍵時刻內插，每 30 秒更新一次。night（0～1）給場景用，例如城裡的路燈晚上才亮。
 */
G.Daylight = (() => {
  // [小時, r, g, b, 濃度]
  const KEYS = [
    [0, 45, 55, 120, 0.42], [4.5, 45, 55, 120, 0.4], [6, 255, 160, 110, 0.2], [7.5, 255, 235, 210, 0.06],
    [12, 255, 255, 255, 0], [16, 255, 238, 205, 0.06], [18, 255, 140, 80, 0.24], [19.5, 100, 75, 150, 0.32], [21, 45, 55, 120, 0.42], [24, 45, 55, 120, 0.42],
  ];
  let night = 0;
  function update() {
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    let i = 0; while (h >= KEYS[i + 1][0]) i++;
    const a = KEYS[i], b = KEYS[i + 1], k = (h - a[0]) / (b[0] - a[0]), mix = j => a[j] + (b[j] - a[j]) * k;
    const el = document.getElementById('light');
    if (el) el.style.background = `rgba(${Math.round(mix(1))},${Math.round(mix(2))},${Math.round(mix(3))},${mix(4).toFixed(3)})`;
    night = h < 5 || h > 20.5 ? 1 : h < 7 ? (7 - h) / 2 : h > 18 ? (h - 18) / 2.5 : 0;
  }
  update();
  setInterval(update, 30000);
  return { update, get night() { return night; } };
})();
