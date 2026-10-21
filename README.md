# TopPath Blade

2D 俯視角武將帶兵戰爭遊戲原型：武將親自戰鬥＋指揮兵團、兵種克制、陣型、攻城。
純 HTML + CSS + JavaScript（Canvas 2D），沒有任何相依套件；程式架構參考 `~/Desktop/TopPath-Survivor`（全域 `G.*` 模組、`js/data/` 放資料、精靈圖每列一個方向）。

## 開始玩

直接用瀏覽器打開 `index.html` 就可以玩（不需要伺服器）。

## 操作（純鍵盤）

| 按鍵 | 功能 |
|---|---|
| WASD | 移動 |
| J / K | 普攻 / 按住格擋 |
| Q / E / R | 武將技能（R 是大招，有特寫） |
| Tab | 切換指揮對象：全軍 → 第 1 隊 → 第 2 隊 |
| 1 / 2 / 3 | 跟隨 / 駐守 / 進攻 |
| F | 切換陣型 |
| Z / X | 兵團技能 |
| G | 開關城門（守城時） |
| - / = | 縮放 |
| V | 畫面震動開關 |
| F3 | 效能資訊 |
| Esc | 回選單 |

## 檔案

```
index.html            進入點（載入順序很重要）
css/game.css
js/core/              工具、鍵盤輸入、精靈圖
js/data/              所有數值：兵種、克制、陣型、技能、武器裝備、設定
js/entities/          士兵與兵團、武將、特效
js/systems/           戰鬥、技能、AI
js/world/map.js       地面、城牆、城門、主堡
js/ui/                戰鬥 HUD、出戰選單
js/game.js            場景、主迴圈、繪製
tools/                PixelLab 素材匯入工具
assets/               精靈圖、地磚、立繪
docs/design.md        兵種、克制、陣型、技能、武將、裝備、戰場與戰略層的設計說明
```

## 調整平衡

改 `js/data/` 底下的檔案就好，選單裡的兵種圖鑑會自動跟著更新。

## 更新美術

1. 在 PixelLab 生成或補動畫，把 character id、動畫名稱寫進 `tools/pixellab.json`
2. `python3 tools/import_pixellab.py`（加 `--refresh` 重新下載；可以只指定某幾個角色）
3. 地磚：`python3 tools/import_tiles.py <tileset_id>`
EOF