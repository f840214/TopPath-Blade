---
name: toppath-pitfalls
description: TopPath Blade 開發時踩過的坑與對應做法：瀏覽器測試（不能碰真實帳號）、PixelLab 生美術（披風消失、斜角地台、正面頭像、風格不統一）、碰撞與尋路（卡牆、高速穿牆、接縫）、繪圖（Retina 糊字、精靈池 tint）、預先載入與 service worker、伺服器防作弊與多人連線。改這個專案的任何程式、美術、伺服器之前先讀。
---

# TopPath Blade 的坑

每一條都是實際發生過的問題。格式：**症狀** → 原因 → 做法。

## 1. 測試

- **測試時登進了使用者的真實帳號**：在開場畫面送出合成按鍵，就會走真的登入流程，載入真的存檔。
  - 做法一（只測前端）：頁面一載入就先把 `G.Api.me`、`G.Api.loadProfile`、`G.Api.saveProfile` 換成假的，再呼叫 `G.Menu.open()` 或 `G.World.enter()`。
  - 做法二（測伺服器、多人）：另外開一台測試伺服器，資料庫放在暫存資料夾：
    `PORT=8790 PGLITE_DIR=<scratchpad>/pglite-test node server/src/index.js`。
    在測試伺服器上用 `/api/register` 建測試帳號，密碼存在暫存檔，不要寫進對話。
- **同一個瀏覽器開兩個分頁，兩邊都是同一個帳號**：cookie 依網域分開。要模擬兩個玩家，就一個開 `http://localhost:8790`、一個開 `http://127.0.0.1:8790`。
- **背景分頁不動**：瀏覽器會暫停背景分頁的 requestAnimationFrame，遊戲迴圈不跑。測試時直接改 `hero.x/y`、直接呼叫 `G.Net.pos()`。
- **非同步登入蓋掉測試資料**：`G.Menu.open()` 之後登入是非同步完成的，會再呼叫一次 `G.Army.useProfile()` 和 `G.Town.enter()`。要等 2 秒以上再設定測試狀態。
- **使用者看不到修改**：`index.html` 的 `?v=` 版本號沒改，瀏覽器會用舊檔。請使用者按 Cmd+Shift+R。改了 `server/src/*` 或 `js/data/*`，伺服器要重啟（伺服器啟動時就把 `js/data` 讀進來了）。

## 2. PixelLab 美術

風格設定都記在 `tools/art-style.md`（角色）和 `tools/town_buildings.json`（建築）。生新圖一律照這兩份檔案的 prompt 範本和參數。

- **走路時披風、盾牌、武器不見**：template 走路動畫（`walking-6-frames`）會把這些畫掉。改用 v3 自訂動作，prompt 寫明「cape always visible」。驗收時把每一格拼成一條長圖，逐格看。
- **攻擊動畫冒出彩色刀光、煙霧**：v3 攻擊動畫的預設行為。prompt 加「no visual effects」。
- **地圖物件帶斜角的菱形草地台**：村莊、木寨、森林都發生過，重生兩次也一樣。換生成方式，或直接不用那張。
- **頭像永遠是正面**：`create_portrait_character` 不管給哪個方向都畫正面。要 45 度頭像，改用 `create_image_pro`，角色圖當參考，再用同一張頭像當風格參考。
- **風格不統一（士兵、武將、建築看起來不像同一款遊戲）**：分批生、每次的 prompt 和參數不一樣。整組要用同一個模板，只換「文化、盔甲、武器」或「建築描述」。生完用 PIL 拼一張並排對照圖，自己看過，再給使用者看。
- **同時最多 10 個工作，整個帳號共用**：兩個 agent 同時跑時，每個控制在 4 個以內。
- **主堡、大圖超過 400px 畫布**：生成上限是 400，要更寬就手動接，例如複製兩側城牆。
- 生成的圖常帶灰白底，要去背。下載後統一壓飽和度（遊戲整體是低彩度的戰意風）。
- **士兵的手工修正會被 `--refresh` 蓋掉**：20 種士兵挑選的變體、左右翻轉補的方向、刪刀光、加深藍色，都只存在 `tools/cache/<兵種>.zip`。`import_pixellab.py` 不加 `--refresh` 才會用這份；加了會重新下載原始檔，修正全部不見。要重匯某個兵種時只列那個 key、不要加 `--refresh`。
- **匯入會改到別人的 key**：多個 agent 同時生圖時，每次匯入前備份 `js/data/sprites-meta.js`，匯入後比對，只能有這次列的 key 改變。

## 3. 碰撞、尋路

- **士兵卡在城牆上**：牆的圖比碰撞帶高。單位站在碰撞帶外、但腳被牆的圖蓋住，看起來就像站在牆上。另外人擠人時會被推穿牆。
  - 做法：碰撞帶要蓋到牆圖的高度（`thick 52`）；記住單位在牆的哪一側（`u.wallSide`），推回原本那一側；陣形站位用 `sameSide()` 限制在同一側。
- **高速移動穿過障礙**：騎馬 ×4 時一幀走十幾 px，會越過一條 20px 高的阻擋帶。移動要分段，每段 ≤ 6px，每段都 `G.Map.resolve()` 一次。
- **長方形切片組成的障礙有接縫**：把湖切成一條條長方形，推出去時會被推進兩條之間的縫，然後沿著縫走過去。圓形、橢圓的障礙用 `ellipse: true`，沿半徑方向推出去。河是一串互相重疊的圓。
- **城內 NPC 卡在房子邊**：隨機挑的目的地落在房子圖片後面，或兩棟房子中間的窄縫。目的地要避開整張建築圖的範圍（`behindArt()`）；1.5 秒走不到 12px 就換目的地。
- **大地圖的石頭可以穿過去**：`buildGround` 撒的裝飾物（decos）只是畫在地上，沒有碰撞。要擋路的東西，要放進 `G.TOWNS.world.buildings`，並給 `fw/fh`。

## 4. 繪圖

- **Retina 螢幕上的字很糊**：疊在上層的 `#overlay` canvas 要用 `devicePixelRatio` 的解析度。畫在螢幕座標時呼叫 `G.Render.screen()`，不要 `setTransform(1,0,0,1,0,0)`。`G.Render.width/height` 是 CSS px。
- **精靈池重用沒有重設屬性**：`G.Render.frame` 的 sprite 是共用池。新增屬性（例如 `tint`）時，每次都要設回預設值，不然上一個物件的顏色會殘留。
- **整個遊戲畫面變黑、只剩文字**：WebGL context lost。原因是在 4096 大小的 Canvas 2D 上用 `ctx.filter = 'blur()'`，顯示記憶體爆掉（開發機的 Chrome 沒用到顯示卡，更容易發生）。大畫布不要用 filter；柔和邊緣用預先畫好的漸層圓形一個個蓋上去，用完把暫存畫布的 width/height 設成 0 釋放。
- **建築底下的橢圓影子看起來像一條橫帶**：建築圖本身已經有底部陰影，不要再加。
- **玩家輸入的文字放進 innerHTML**：城池名稱、聊天、帳號名稱一律用 `G.U.esc()` 或 `textContent`。伺服器也要擋特殊符號。

## 5. 載入與快取

- 所有圖片都經過 `G.Assets.img(src)`，同一個網址只有一個 Image 物件，開場時已經預先解碼。新增載圖的地方不要自己 `new Image()`。
- 檔案清單是伺服器動態產生的（`/assets-manifest.json`，簽章是大小加修改時間），不用手動維護。
- service worker 只在 HTTPS 或 localhost 有效，用區網 IP 開時不會啟用。圖片和 lib 先讀快取，js、css、頁面先上網（改程式不用清快取）。
- `js/data/*` 的載入順序要注意：data 檔比 `js/world/*` 早載入。data 裡要用的小工具放在 `G.U`（`js/core/util.js`）。

## 6. 伺服器、防作弊、多人

- **瀏覽器送來的存檔不能信**：以前整份存檔由瀏覽器 PUT，金幣想改多少就改多少。
  - 現在 `PUT /api/profile` 只收 `settings`、`flag`、`world`（位置、強盜）。
  - 金幣、經驗、名冊只能經過 `POST /api/army` 和出戰單（`/api/battle/start`、`/api/battle/end`）改。
- **伺服器和瀏覽器的規則不一致**：伺服器用 vm 直接執行同一份 `js/data/*.js` 和 `js/systems/army.js`（`server/src/gamedata.js`）。
  - 改這些檔案後要重啟伺服器。
  - 新增的 data 檔如果伺服器要用，要加進 `gamedata.js` 的 `FILES`。
  - data 檔不能碰 DOM（document、Image）。
- **存檔檢查只認得舊兵種**：新增兵種、新欄位時，伺服器端的檢查要一起改。
- **`G.Army.adopt()` 換掉存檔物件後，大地圖還拿著舊的 `world`**：場景手上拿的是物件參照，換存檔時要保留同一個 `world` 物件（Object.assign）。
- **單人戰鬥（強盜、演習）還在瀏覽器算**，伺服器只能擋不合理的數字：擊殺數不能超過敵軍人數、存活不能比出發多、打贏至少要打 15 秒。攻城走同場戰鬥，由伺服器算、伺服器結算，才完全防得住。
- **同場戰鬥**（`server/src/battle-host.js` ↔ `js/net/remote.js`）：
  - 戰鬥模擬是 `js/battle/sim.js`（不碰畫面），瀏覽器單人戰鬥和伺服器同場戰鬥跑的是同一份。改戰鬥規則只改 sim.js 和 systems，**不要把畫面、DOM、G.HUD 寫進去**；要通知玩家用 `G.Battle.notify(c, text)` / `notifyTeam(team, text)`。
  - 伺服器每場戰鬥一個 vm（`sandbox()`），`FILES` 列出要載入的檔案；新增戰鬥用到的檔案要加進去。`G.FX` 在伺服器上只記錄事件轉送給瀏覽器。
  - 顏色看的是「我方／敵方」：用 `G.viewTeam`（守城玩家是 team 1），不要寫死 `team === 0`。快取的貼圖（例如衝車的隊旗）key 要用我方／敵方，不能用 team 編號。
  - 兵團跟隨用 `sq.leader`（自己的武將），不是 `heroOf(team)`；一方可能有好幾個武將。
  - 倒下的武將要把速度歸零，不然屍體會帶著速度穿牆（以前單機版也有這個 bug）。
  - 測試時背景分頁不送按鍵：直接 `G.Net.send({ t: 'b.in', held: ['KeyW'], hit: [] })`。
- WebSocket（`server/src/live.js` ↔ `js/net/net.js`）：
  - 每 20 秒 ping 一次，40 秒沒回應就斷開。瀏覽器端用指數退避重連，網路恢復（online 事件）時馬上重連，30 秒沒收到任何訊息就當作斷線。
  - 重連後會自己回到原本的場景。
  - 外觀和旗幟從伺服器的存檔拿，不信任瀏覽器送來的。

## 7. 其他

- **本機 Node 伺服器（serve.command，8765）和 Docker（8899）不能同時開**：兩個都用 `data/pglite`，PGlite 同一時間只能給一個程式開，同時開會損壞存檔。換跑法前先停掉另一個。
- `compose.yaml` 的 `environment:` 底下不能只有註解（會變成 null，`docker compose` 報「must be a mapping」）。

- 城內配置是程式產生的：改 `tools/town_main.py`、`tools/town_castle.py`，再執行 `python3 tools/town_main.py .`，不要手改 `js/data/town-main.js`。小城（`town-small.js`）從主城切出來，主城座標改了要一起調整它的門檻值。
- 只在使用者要求時才 commit。不要用 `git rm --cached` 這類會動到 index 的指令「順手整理」。
