# 武將外觀動畫進度（暫停時的狀態）

使用者要求暫停。**全部都還沒匯入**：`tools/pixellab.json`、`js/data/sprites-meta.js`、`assets/units/look_*/` 都沒動過，遊戲裡現在還是舊圖。
新的動畫都放在 PixelLab 伺服器上（下面的 character id / group id），可以隨時下載。

## 接著做的方法

1. 把剩下的 job 生完（清單在最後）。
2. 執行 `python3 tools/hero-anims/setcfg_wpn.py`：重新讀 `tools/pixellab.json`，只改 `look_*` 的 id 和 anims（其他 key 不動，格式 indent=2 原樣寫回）。
   - 四個重生的外觀換新 id；其他外觀只加上 Spin/Shout/Whirl。
   - 寫好的 hit：samurai Attack 4、mongol/ming/jarl Attack 3；Spin hit 4、Shout hit 3、Smash hit 4；Whirl 不設 hit、loop true。
3. 有刀光、白色爆光的動畫，先執行 `python3 tools/hero-anims/mkzip.py <key> <character id> '{"Attack":[方向...]}'`：會下載新的 zip、用 fxclean 去掉沒有黑框的浮空亮色色塊，寫到 `tools/cache/<key>.zip`。
   需要清理的：look_samurai Attack（south-east、north-east、south-west）、look_jarl Attack（全部方向）、look_ming_officer Attack（north、north-east）、look_templar Shout。
4. 匯入時**不要加 `--refresh`**（不然會蓋掉清理過的 zip），只列 look_* key：
   `python3 tools/import_pixellab.py look_samurai look_mongol look_ming_officer look_jarl look_knight look_templar look_landsknecht look_han_general look_viking look_ashigaru_taisho`
   沒清理的 key 要先執行 mkzip.py（不給 clean 參數），讓快取變成最新版。
5. 匯入前先備份 `js/data/sprites-meta.js`，匯入後用 `git diff` 確認 mount_*、士兵的 key 都還在。

腳本：`tools/hero-anims/`（從原本的暫存資料夾搬進專案；暫存資料夾在對話結束後會清掉）
（state.txt 是逐步紀錄；view.py 會拼出每個方向的長條圖；zfeet.py 量腳部動作；oldzips/ 是舊版 zip 的備份）

## 各外觀

腳步量法（zfeet.py）：取腳底往上 10px、左右各 12px 的範圍，算相鄰兩格的平均像素差（綠底）。過關標準：南、北要有同一個外觀東、西平均值的 70%。舊值在 `tools/hero-anims/feet_before.txt`。

| 外觀 | 武器 | character id | 狀態 |
|---|---|---|---|
| look_samurai | 野太刀 | **新** `2cdea3b7-c6f2-4f3a-bdbe-20ea0e8054e9` | 新造型完成。Walk 8/8（group `32d6ec92-0cdb-4a17-b4e2-657c0d4da78f`，S 39 / N 21）。Attack 8/8（`a97858db-40f4-4680-b964-433d0dc1185c`，W 的刀身畫成白色彎鉤，已重試 2 次）。Spin（`11136ef9-071d-4a1b-b139-00853e29f7cf`）完成。Shout（`a362cc6d-2de5-4870-afde-275011f7d73c`）完成 |
| look_mongol | 長弓 | **新** `69d08ed4-8b84-4dde-a6bf-8bb5b333e67b` | 全部完成。Walk 8/8（`2bf75890-3f8c-4a73-8c91-74a42c6a6fc4`）、Attack 8/8（`9058f711-e2d8-48ec-8b57-ae520659fd6f`，NW 動作偏小）|
| look_ming_officer | 火槍 | **新** `f1e35739-c903-46fb-a68c-7a5f9d4468b4` | Walk 8/8（`721d3de0-2a52-4fbe-8c9a-1092444704e9`，NE 17 偏弱）。Attack（`efcd2909-7c01-41e4-8d79-971b4b53d418`）：S、SE、E、NE、N 完成；NW、W 生成中；**SW 還沒做** |
| look_jarl | 戰錘 | **新** `a5757b55-0a9e-4e80-9936-3c61d6f9ebeb` | Walk 8/8（`d111e3a0-9c84-4b2a-941c-e7cfabbce826`）。Attack（`40e12b89-4aaa-46fd-911d-4580b5fa56ea`）：S、SE、E、NE、N、NW、W 完成，**SW 還沒做**，每個方向都要清理特效。Whirl（`50e1f226-2cce-43bc-9afd-6d52f3b4a97f`）**不合格**（沒有轉圈），要刪掉重生。**Smash 還沒做** |
| look_knight | 劍盾 | `454e7905-6cb3-4570-892a-296202362417` | Walk 重做 S、N、NE、NW、W、SW（group `a57c2cac-537b-4394-96f3-55ad40554d7c`，S 17→28、N 18→22）完成。Shout（`24b51a27-803f-4ca0-b4d3-144f6c93b9e2`）完成 |
| look_templar | 長劍 | `14f503e1-cfc1-4d40-a1bb-9ace4cdd8dc2` | Walk（source `WalkV3`，`868238bd-4cd4-4320-a667-d5259eb998cd`）重做 S（14→38）、SW（7→37）完成。Spin（`aff1bb6e-6160-4c80-9dae-1d9ffd69850a`）、Shout（`1a6eff6f-7cd1-423a-8fa0-deb2be71fe8b`）完成 |
| look_landsknecht | 長劍（保留雙手劍）| `64c68f0b-6430-4cc2-a400-1dc10ec54c50` | Walk（`d128aa61-6414-402b-89c0-1e3cc19eface`）重做 S（10→33）、N（15→15，看圖腳有交替，已重試 2 次）完成。Spin（`41045602-0a51-4407-bb6f-2575318aa14e`）、Shout（`b965404a-ce5e-4924-b5d4-ec1a8f7070cb`）完成 |
| look_han_general | 長柄刀 | `a4a9a44b-3e35-4f08-bf20-f12f9377e6e4` | Walk（`d66d7b75-53bc-4666-aa51-54182eae3731`）重做 7 個方向（只保留 E），S 15→18、N 17→16（看圖腳有交替，刀都在同一隻手）。Whirl（`8696ff05-74f6-4d49-8a0c-d0554e11cd53`）完成 |
| look_viking | 劍盾 | `f9dd4b64-1181-4c14-8e67-96e19c9ec2e8` | Walk（`d35306eb-e78d-4437-acc2-0a2149eeaca4`）重做 S（13→27）、N（22→25）、NE（25→30）完成。Shout（`9d850eed-cd49-4670-8b1a-a6503af07133`）完成 |
| look_ashigaru_taisho | 長槍 | `53580c38-8a65-41aa-b8c3-19ab0909b3ae` | Walk（`2d483492-ade7-4fca-b907-bc93336dfcb2`）重做 S（3→23）、SW（9→32）完成。Spin（`54269396-1716-4009-a0b1-d1fc2180bea6`）完成（槍有掃，身體轉得不多）|

注意：舊外觀 Walk 裡重做的方向，PixelLab 上的舊版已經刪掉了。舊版留在 `tools/cache/look_*.zip` 和 `tools/hero-anims/oldzips/`，`assets/units/look_*/Walk.png` 也還是舊版。

## 還沒做的 job

- look_ming_officer Attack SW（NW、W 已送出，等它跑完）
- look_jarl Attack SW
- look_jarl Whirl：刪掉 `50e1f226…` 重生
- look_jarl Smash（單方向，8 格，hit = 落地那一格）
- 匯入之後：拼一張所有新動畫的對照圖，逐格檢查，再在 `tools/art-style.md` 補上筆記

## 其他

- `js/data/looks.js` 的 weapon 欄位由 coordinator 改好了，沒有動。
- 頭像都沒有畫到武器，全部保留原圖。
- PixelLab 上已刪除的廢稿：landsknecht 長槍版 `f13e670b`、ming v1 `cd5d2069`、jarl v1 `7f30fa44`。
