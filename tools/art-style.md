# 美術風格規格（武將外觀 look_* 用的設定）

之後重做兵種時照這份設定，角色才會跟武將同一套風格。

## 1. 角色本體（8 方向靜態圖 → Idle）

工具：PixelLab MCP `create_character`

| 參數 | 值 |
|---|---|
| mode | `v3`（每個角色 2 generations） |
| size | `56`（畫布 56×56，跟 hero_sword 一樣） |
| view | `high top-down` |
| outline | `single color black outline` |
| detail | `medium detail` |
| n_directions | 8（v3 不給參考圖時固定 8） |
| body_type | `humanoid` |
| proportions / shading | 不設（v3 會忽略） |
| 參考圖 / style_character_id | 不用（v3 不給參考圖時不支援風格參考，一致性靠固定的 prompt 模板） |

### Prompt 模板

```
<文化> warrior hero, <盔甲與服裝>, <頭盔/頭部>, holding <武器>, standing, average build, full body, muted desaturated palette, dark steel and leather tones, gritty realistic
```

- 只換 `<文化> / <盔甲> / <頭盔> / <武器>`，其他字一個都不要改
- 布料用暗色、褪色的顏色（faded dark-red、indigo、brown），不要寫 bright / vivid
- 例子（look_mongol）：
  `Mongol steppe warrior hero, dark lamellar scale armor over brown deel robe, pointed steel helmet with fur brim, holding a curved sabre, standing, average build, full body, muted desaturated palette, dark steel and leather tones, gritty realistic`
- 兵種要用紅藍隊色重新上色的話（importer 的 `red: true`），衣服要用飽和的藍色，importer 才換得掉

## 2. Walk

`animate_character`，`mode: "v3"`，`frame_count: 6`，`keep_first_frame: false`，`animation_name: "Walk"`，8 方向
- action_description：`walking forward at a steady pace, <武器> held in right hand, <武器/盾/披風> always visible`
- 每個方向 1 generation；畫布約 76～80px（importer 會對齊腳底）
- pixellab.json：`{"source": "Walk", "fps": 10, "loop": true}`
- **不要用 template（`walking-6-frames`）**：template 走路會把披風、盾、武器吃掉（hero_sword 往東北、往北走時披風幾乎不見就是這個原因）。只有沒披風、武器又小的角色勉強能用，還是建議一律用 v3

## 3. Attack（近戰揮砍）

`animate_character`，`mode: "v3"`，`frame_count: 6`，`keep_first_frame: false`，`animation_name: "Attack"`，8 方向
- action_description 例：`swinging the katana in a fast diagonal slash forward, no visual effects`（把武器名換掉；盾兵加 `, shield held up`；有披風加 `, cape always visible behind`）
- **一定要加 `no visual effects`**（劍光會亂飄就再加 `plain steel blade, no glow, no slash trails`），不然 v3 常會畫出黃色、藍色、火焰的刀光或白色煙霧
- 每個方向 1 generation；PixelLab 自動放大畫布到約 80×80（有時 76×76，importer 會補成最大尺寸）
- pixellab.json：`{"source": "Attack", "fps": 14, "loop": false, "hit": 3}`
- 遠程兵種把動作改成拉弓、射擊等，hit 設在放箭那一格

## 4. 頭像（128×128，3/4 側面）

`create_portrait_character` 永遠輸出正面，不能用。改用 `create_image_pro`：
- width/height `128`，`no_background: true`（透明背景，跟 assets/portraits/hero.png 一樣）
- `reference_images`: `[{"url": "<角色 south-east 方向圖的 URL>", "usage": "character identity, helmet and armour design and colours"}]`
- `style_image_url`: 戰國武士頭像 `https://api.pixellab.ai/mcp/images/12ef17e9-cb2f-46c7-89a5-88263f14922a/download?index=2`，`style_copy: ["outline","detail","shading"]`
- description 模板：`pixel art bust portrait of a <角色>, head and shoulders, three-quarter view, head and body turned 45 degrees to the side, <頭盔/臉部特徵>, <盔甲>, muted desaturated palette, transparent background`
- 一次出 4 張（10 generations），挑 3/4 側面那張；朝左的水平翻轉，統一臉朝畫面右邊
- 轉得不夠側面的話，把已經成功的 3/4 頭像（例如唐軍將軍 `https://api.pixellab.ai/mcp/images/503493f3-5891-4a56-a249-35da38efe35c/download?index=3`）當第二張 reference，usage 寫 `head pose, three-quarter camera angle and framing only`

## 5. 匯入

1. 把 character id 加進 `tools/pixellab.json`
2. `python3 tools/import_pixellab.py <key ...> --refresh`（只列要匯入的 key，不要全部 refresh）

## 成本（實測）

- 每個角色：建立 2 + Walk 8 + Attack 8 ≈ 18 generations
- 每張頭像：10 generations（create_image_pro，128px）
- 同時最多 10 個 job（整個帳號共用）；一個方向一個 job，一個角色的 Walk 跟 Attack 加起來要 16 個 job

## 6. 大地圖外圍高崖（assets/world/cliff_*.png）

全部 1:1 像素，可無縫重複。
- 生成：`create_image_pro`，`no_background: false`（要整張填滿、左右延伸出畫面），`style_image_url` 用 `assets/world/castle_stone.png`（style_copy: outline/detail/shading）。
  北崖 170×152（一次 4 張候選，15 gen），prompt 重點：`front-facing straight horizontal cliff wall filling the whole canvas edge to edge, continues off both left and right sides`、上 25% 高地草＋木柵欄、中 60% 圓弧直向岩柱、下 15% 暗色崖腳＋碎石。
  側崖 96×128，用北崖成品當 style 圖；第一次 128×170 的構圖亂（岩塊斜放、柵欄轉彎），加「one continuous vertical band ... same width all the way down」才變成直的一條。
- PixelLab 沒有 seamless/tileable 選項（search_help 確認）。做法：
  - 單張無縫：裁出 128，`ImageChops.offset` 捲一半，讓接縫落在中間，再 `inpaint_image` 只重畫中間那條（自訂遮罩，10 gen）。
  - 多張互相能接：三張的最左 8px／最右 8px 都貼同一段原圖（北崖候選 0 的 x68–75 / x60–67，本來就相連），每張只 inpaint 兩條過渡帶（x5–24、x103–122），邊緣像素凍結 → 任意順序都接得起來。
  - inpaint 有時把草地塗成白底（n2 就是），要把近白像素換回草色。
- 後製（scratchpad 的 proc.py / corner.py / fixgreen.py）：綠色像素依綠度往 `#4b6634` 拉（×0.76/0.87/0.83）、全體飽和度 ×0.92；崖腳的黑影改成 `(18,20,14)` 半透明往下淡出，下層草地全透明；原圖最下面一排有雜色，要清掉。
- 角落：把 cliff_n 和兩張 cliff_w 疊在 (66,88,44) 地色上，遮罩轉角區 inpaint，再沿「陰影色–地色」那條線反推 alpha（從右下角 flood fill，只處理下層地面），最後把右邊和下面的像素直接換回 cliff_n / cliff_w，保證接得上。
- 東邊 = 西邊水平翻轉（光源也跟著翻，小缺點）；NE = NW 翻轉。

## 6. 騎馬版（mount_*，大地圖用）

工具：`create_character_pro_flash`（v3 不給參考圖只能畫人形，畫不了馬）
- `template_id: "horse"`，`view: "high top-down"`，`width/height: 72`（跟 heavycav 一樣大），每隻約 6 generations
- `style_image`: `{"url": "<對應 look_* 角色的 south 旋轉圖>", "usage_description": "the rider: same <頭盔、盔甲、顏色、武器>; same pixel art style, outline and muted palette"}`
  - 旋轉圖網址：`https://backblaze.pixellab.ai/file/pixellab-characters/18545ca0-ca95-4e2b-8986-8a27d8cc2c34/<look 的 character id>/rotations/south.png`
- description：`<原本 look 的 prompt，改成 "... riding a <馬>">; horse has/wears <依文化的馬具>, muted desaturated colors, gritty realistic`
- Walk：v3、`frame_count 6`、`keep_first_frame false`，每方向 1 generation，畫布 88～104px
  - action_description：`horse trotting forward at a steady pace with legs moving, <角色> rider stays seated in the saddle, <武器> held in right hand, rider, <武器/披風> always visible, no visual effects`
- pixellab.json：`{"id": ..., "anims": {"Walk": {"source": "Walk", "fps": 10, "loop": true}}}`
- 坑：
  - 長柄武器（關刀、巨斧）在正東、正西方向常常只剩一小截。原因多半是 8 方向旋轉圖本身就把武器藏在身體後面，動畫只是照抄；重生 Walk 救不回來，要救得重生旋轉圖
  - 正西方向的彎刀偶爾畫成橫在背後、像骨頭的白色東西，重生一次時 prompt 改成 `holding one plain steel ... in right hand, blade pointing forward and down, no glow, no extra objects` 就好了
  - 帳號 10 個 job 上限被別的 agent 佔滿時會直接回錯誤，等一兩分鐘再送
  - importer 會建空的 `red/` 資料夾，沒有 `red: true` 的可以刪掉

## 6. 兵種（20 種士兵，2026-10 重做）的做法與教訓

- 角色本體：`create_character` v3、size **48**（不是 56）。士兵本來就是 48 畫布，遊戲裡統一用 artScale 畫，48 才不會整支軍隊變大；像素密度跟武將一樣。
- Prompt 模板（只換文化／盔甲／頭盔／武器）：
  `<文化> <兵種> soldier, rank-and-file infantryman, <盔甲> with deep blue cloth <罩袍/上衣>, <頭盔>, holding <武器>, standing, average build, full body, muted desaturated palette, dark steel and leather tones, gritty realistic`
  - 一定要寫 **deep blue** 的布料，生完用 importer 的紅隊規則算一下藍色像素比例（南向 ≥ 9% 才夠明顯）。5% 以下（例如只寫 blue robe）紅隊幾乎看不出來，要重生。
  - 「round steel cap helmet」會生出二戰鋼盔，改寫 `medieval steel kettle hat with wide brim`。
  - 寫 long surcoat 容易變成長披風，士兵不要。
- 騎兵（cavalry / heavycav / horsearcher）：`create_character` **pro** + `body_type: quadruped` + `template: horse` + `size: 72` + `style_character_id`（look_knight / look_mongol），10 generations。風格跟武將一致。
  - 奔跑**不要用 template running-6-frames**（騎士被吃掉、只剩一匹馬），用 v3 自訂動作：`horse galloping forward at full speed, rider stays seated upright on the horse holding the lance upright, rider and lance always visible`，每方向 1 generation（畫布 100）。
  - 馬衣藍色不夠時（騎射兵只有 1%），在匯入前把偏藍灰的像素（b>r+18 且 b>g+12）推成飽和藍，紅隊才換得掉。
- v3 攻擊的方向常常搞錯（往北、西北、西、西南時人轉回正面，或武器往右揮）。解法：
  1. prompt 裡寫明方向：`toward the lower left, the direction he faces`、`seen from behind, back to the camera the whole time`；
  2. 還是錯的話，把東／東南／東北那一格**左右鏡射**當西／西南／西北（斜角武器、騎槍、射擊都看不出左右手）。
- 同一個 animation group 補同一方向會多一個 `north-west-<hash>` 變體，importer 只認正式方向名，要在匯入前挑一個改名（不然會被當成缺方向，用相鄰方向代替）。
- v3 揮砍常帶白色刀光、黃色火花：匯入前跑一次「沒有黑邊、外圈大多是透明的淺色連通區塊 → 刪除」的清理，刀光幾乎都能去掉，箭、槍頭不會被刪。
- 盾兵攻擊要寫 `shield kept raised in front on the left arm the whole time`，不然盾會在揮劍時消失。
- 擲彈兵：`throwing a bomb` 會畫成手裡爆炸，改寫 `swings his arm far back, then swings it forward and up releasing the ball so it flies away, his hand ends empty, the ball does not explode, no sparks`。
- 弓兵：`archer shooting: raises the bow up in front with the left arm extended, pulls the bowstring back to his cheek...` 比 `drawing an arrow ...` 清楚很多。
- 同時跑的 job：多個 agent 共用 10 個名額，一個 agent ≤4。下載 zip 時角色只要還有 job 在跑就會 423，驗收要等該角色全部跑完。
