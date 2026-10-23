# TopPath Blade

2D 俯視角武將帶兵戰爭遊戲原型：武將親自戰鬥＋指揮兵團、兵種克制、陣型、攻城。
前端是純 HTML + CSS + JavaScript，繪圖用 PixiJS（WebGL，放在 `lib/`，不需要建置）；後端是 Node.js（`server/`），負責帳號登入與玩家存檔；程式架構參考 `~/Desktop/TopPath-Survivor`（全域 `G.*` 模組、`js/data/` 放資料、精靈圖每列一個方向）。

## 開始玩

Windows 雙擊 `serve.cmd`、Mac 雙擊 `serve.command`（都需要 Node.js）：第一次會安裝後端套件，接著開伺服器並打開 http://localhost:8765/。
Mac 也可以在終端機執行 `cd server && npm ci --omit=dev && npm start`（第一次之後只要 `npm start`）。
進遊戲要先註冊／登入；帳號和存檔存在 `data/` 資料夾（PGlite，本機的 PostgreSQL，不用另外安裝資料庫）。

## 架設（Docker）

```
docker compose up -d --build
```

開 http://<主機>:8899/ 就能玩。改版後在主機上 `git pull` 再執行同一行重新建置即可。
- 帳號與存檔在主機的 `data/`（掛進容器），重建容器不會不見。
- **備份**：伺服器每 24 小時自動把資料庫打包到 `data/backups/pglite-<時間>.tar.gz`（只留最新 14 份，`BACKUP_HOURS`、`BACKUP_KEEP` 可以改）。建議再定期把 `data/backups` 複製到別台機器。
  還原：停掉伺服器 → `node server/src/restore-backup.js data/backups/<檔名>`（原本的資料庫會改名留著）。
- **HTTPS（公開上線前一定要做，不然密碼是明文）**：網域的 DNS 指到主機、開 80／443 port，然後
  `DOMAIN=game.example.com COOKIE_SECURE=1 docker compose --profile https up -d --build`
  （Caddy 自動申請憑證，設定在 `deploy/Caddyfile`）。玩家連 `https://game.example.com`。
- **忘記密碼**：沒有 email，由管理員重設：停掉伺服器 → `node server/src/reset-password.js <帳號> <新密碼>`（Docker：`docker compose run --rm toppath-blade node server/src/reset-password.js …`）。玩家自己可以在選單「說明」裡改密碼。
- 玩家多了要換獨立 PostgreSQL，設定 `DATABASE_URL` 即可（這時備份請用 pg_dump）。
- 映像只包含 `index.html`、`sw.js`、`css/`、`js/`、`lib/`、`assets/` 和 `server/`；伺服器也只對外開放這些遊戲路徑。
- **service worker（`sw.js`）只在 HTTPS 或 localhost 上有效**：用 `http://<區網 IP>:8899/` 開時瀏覽器不會啟用，遊戲照樣能玩，只是每次都向伺服器拿檔案。

## 後端 API（server/src/index.js）

| 路由 | 說明 |
|---|---|
| `POST /api/register`、`/api/login` | 帳號 2～16 字、密碼 1～128 字；密碼用 scrypt 加鹽雜湊；同一 IP 每分鐘最多 10 次 |
| `POST /api/logout`、`GET /api/me` | 登入狀態放在 httpOnly cookie（30 天） |
| `POST /api/password` | 改密碼 { old, password }：要輸入舊密碼，改完其他裝置都登出 |
| `GET`／`PUT /api/profile` | 讀寫存檔（名冊、金幣、等級、選單設定、大地圖、旗幟）；伺服器會擋明顯不合理的數值 |
| `GET /assets-manifest.json` | 遊戲檔案清單（每個檔案的大小＋修改時間），開場預先載入和 service worker 同步用 |

目前戰鬥在玩家的瀏覽器裡計算、結果上傳到伺服器，**還沒有防作弊**；之後做多人連線時要把戰鬥搬到伺服器計算。

## 載入

開場畫面會先載入全部圖片（有進度條），載完才能按任意鍵；之後換場景不會再等圖。
瀏覽器支援時會註冊 service worker：第二次之後圖片直接從瀏覽器快取拿，伺服器的檔案有變才重新下載那幾個檔案。

## 城內

新帳號第一次登入先創角（選外觀、頭像），之後在主城（王都）：WASD 走動，走到有名牌的建築門口按 Enter 進去（募兵處、鐵匠鋪、主堡、旅店、兵營、城門），Esc 離開。左上角武將牌下的「選單」（或 Tab）展開資源、兵團和功能按鈕。

## 大地圖

從城門出城，騎馬行軍（WASD）；右上角是本地時間和小地圖。地形有山脈、湖、河（路經過的地方有橋）、森林、農田，山、湖、河、石堆都過不去。
沒被佔領的城池叫「空城」；城門口按 Enter 攻城（攻城一律在伺服器上打：附近的玩家會收到邀請、按 J 一起攻；城主在線上會收到通知、按 J 回防，雙方同場對打；打完由伺服器結算），打下來可以取名、選城堡樣子、設定自己的旗幟（自己設計或上傳圖片，縮成 32×40），之後在城門口按 R 管理。碰到強盜會打野戰。打完按 Esc 回大地圖。

## 戰鬥操作（純鍵盤）

| 按鍵 | 功能 |
|---|---|
| WASD | 移動 |
| （自動） | 普攻：武器範圍內有敵人、敵方器械或（攻城時）城門城牆就自動面向它出手 |
| Q / E / R | 武將技能（R 是大招，有特寫） |
| Tab | 切換指揮對象：全軍 → 第 1 隊 → 第 2 隊 → …（依出戰兵團數） |
| 1 / 2 / 3 | 跟隨 / 駐守 / 進攻 |
| F | 切換陣型 |
| Z / X | 兵團技能 |
| B | 把選中的步兵兵團指派去操作附近的衝車／雲梯（再按一次放下） |
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
js/systems/           戰鬥、技能、AI、攻城器械與落石（siege.js）
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