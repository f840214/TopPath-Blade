# TopPath Blade

2D 俯視角武將帶兵戰爭遊戲原型：武將親自戰鬥＋指揮兵團、兵種克制、陣型、攻城。
前端是純 HTML + CSS + JavaScript，繪圖用 PixiJS（WebGL，放在 `lib/`，不需要建置）；後端是 Node.js（`server/`），負責帳號登入與玩家存檔；程式架構參考 `~/Desktop/TopPath-Survivor`（全域 `G.*` 模組、`js/data/` 放資料、精靈圖每列一個方向）。

## 開始玩

雙擊 `serve.cmd`（需要 Node.js）：第一次會安裝後端套件，接著開伺服器並打開 http://localhost:8765/。
進遊戲要先註冊／登入；帳號和存檔存在 `data/` 資料夾（PGlite，本機的 PostgreSQL，不用另外安裝資料庫）。

## 架設（Docker）

```
docker compose up -d --build
```

開 http://<主機>:8899/ 就能玩。改版後在主機上 `git pull` 再執行同一行重新建置即可。
- 帳號與存檔在主機的 `data/`（掛進容器），重建容器不會不見；**要備份就備份這個資料夾**。
- 架在 HTTPS 後面時，在 `compose.yaml` 打開 `COOKIE_SECURE`；玩家多了要換獨立 PostgreSQL，設定 `DATABASE_URL` 即可。
- 映像只包含 `index.html`、`css/`、`js/`、`lib/`、`assets/` 和 `server/`；伺服器也只對外開放這五個遊戲路徑。

## 後端 API（server/src/index.js）

| 路由 | 說明 |
|---|---|
| `POST /api/register`、`/api/login` | 帳號 2～16 字、密碼 8～128 字；密碼用 scrypt 加鹽雜湊；同一 IP 每分鐘最多 10 次 |
| `POST /api/logout`、`GET /api/me` | 登入狀態放在 httpOnly cookie（30 天） |
| `GET`／`PUT /api/profile` | 讀寫存檔（名冊、金幣、等級、選單設定）；伺服器會擋明顯不合理的數值 |

目前戰鬥在玩家的瀏覽器裡計算、結果上傳到伺服器，**還沒有防作弊**；之後做多人連線時要把戰鬥搬到伺服器計算。

## 操作（純鍵盤）

| 按鍵 | 功能 |
|---|---|
| WASD | 移動 |
| J / K | 普攻 / 按住格擋 |
| Q / E / R | 武將技能（R 是大招，有特寫） |
| Tab | 切換指揮對象：全軍 → 第 1 隊 → 第 2 隊 → …（依出戰兵團數） |
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
js/core/              工具、鍵盤輸入、精靈圖、繪圖層（render.js：PixiJS ＋ 上層 Canvas 2D）、後端 API（api.js）
lib/                  PixiJS 8.22.0（MIT）
serve.cmd             開遊戲伺服器（server/）
server/               Node.js 後端：帳號、存檔、提供遊戲檔案
data/                 本機資料庫（不進 git）
js/data/              所有數值：兵種、克制、陣型、技能、武器裝備、設定
js/entities/          士兵與兵團、武將、特效
js/systems/           戰鬥、技能、AI
js/world/map.js       地面、城牆、城門、主堡
js/ui/                戰鬥 HUD、出戰選單
js/game.js            場景、主迴圈、每幀繪製流程
tools/                PixelLab 素材匯入工具
assets/               精靈圖、地磚、立繪
docs/design.md        兵種、克制、陣型、技能、武將、裝備、戰場與戰略層的設計說明
docs/roadmap.md       待做清單（依順序）
```

## 調整平衡

改 `js/data/` 底下的檔案就好，選單裡的兵種圖鑑會自動跟著更新。

## 更新美術

1. 在 PixelLab 生成或補動畫，把 character id、動畫名稱寫進 `tools/pixellab.json`
2. `python3 tools/import_pixellab.py`（加 `--refresh` 重新下載；可以只指定某幾個角色）
3. 地磚：`python3 tools/import_tiles.py <tileset_id>`
EOF