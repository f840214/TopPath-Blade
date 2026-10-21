# 《戰意》（Conqueror's Blade）遊戲系統研究報告

> 研究日期：2026-10-21。用途：替 TopPath Blade（2D 俯視角、致敬《戰意》玩法的原創網頁遊戲）找可以參考的系統。
> **只參考玩法與系統概念**。原作的兵團名、武器技能名、數值、美術都不要照搬。文中引用的原作數字只用來說明「這個系統的規模大概多大」。
>
> 標記說明：**【待查證】**＝來源互相矛盾、太舊，或只有單一社群來源；**【未找到】**＝搜尋後沒有可靠資料。
> 這個遊戲每季都在改版（2026 年已經進行到第 26 季以後），社群攻略的數字常常過時。Fandom wiki 對爬蟲回 402，所以 wiki 內容只能從搜尋摘要間接取得。

---

## 0. 摘要

《戰意》是 Booming Games（杭州）用自家 CHAOS 引擎開發的免費 MMO 即時戰術遊戲，2019-06-24 在 PC 上市，歐美由 MY.GAMES（My.com）代理。玩家用第三人稱操作一名「武將」親自砍殺，同時指揮幾支 AI 兵團。核心循環分三層：

1. **戰鬥層**：武將的動作戰鬥（武器決定技能組）＋兵團指令與陣型＋攻城器械／火砲，打攻城、野戰、PvE。
2. **成長層**：武將等級與屬性、裝備打造與重鑄、兵團樹解鎖、兵團等級與老兵技能點、戰術書（Doctrine）、精通（Mastery）。這些都受「統率值（Leadership）」上限限制：統率值決定一場戰鬥能帶多少兵團。
3. **戰略層**：開放世界大地圖上的行軍、糧食、採集、運輸，以及家族／聯盟每週兩次的領地戰，爭奪村莊、城鎮、要塞、首都。

此外還有一層把所有東西串起來的線上服務設計：賽季、通行證、多種貨幣、玩家市場。對單機原型來說，最值得借的是「統率值編成」「兵團戰損延續與補員」「兵團等級／老兵技能」「攻城器械與多段據點」「PvE 佈防模式」；家族領地戰、玩家市場、賽季通行證這類需要大量線上玩家的系統不適合照搬。

主要來源：[Wikipedia](https://en.wikipedia.org/wiki/Conqueror%27s_Blade)、[Conqueror's Blade Players Guide（conquerorsbladehub.com）](https://www.conquerorsbladehub.com/)、[CBGG](https://cbgg.net/)、[denetax.fr](https://denetax.fr/en/)、[官方網站新聞](https://www.conquerorsblade.com/)、Fandom wiki（以搜尋摘要為主）。

---

## 1. 武將（Hero / Warlord）

### 1.1 武器類別

每種武器就是一個「職業」，自帶一組武器技能。武器能用哪一種，受身上最重的護甲等級限制：穿重甲的武將才能拿重甲武器。

| 護甲等級 | 武器（英文原名，括號內為大致定位） |
|---|---|
| 重甲 | Longsword & Shield（長劍盾，坦克／輔助）、Shortsword & Shield（短劍盾）、Poleaxe（長柄斧，爆發）、Glaive（長柄刀，大範圍橫掃）、Maul（戰錘，純鈍擊）、Bastard Sword（手半劍）* |
| 中甲 | Spear（長矛）、Pike（長槍）*、Spear & Shield（矛盾）*、Nodachi（野太刀）、Musket（火槍） |
| 輕甲 | Dual Blades（雙刀，刺客型）、Bow / Longbow（長弓）、Short Bow（短弓）、Chain Dart & Scimitar（繩鏢彎刀）* |

\* 賽季武器：通常要完成賽季挑戰才能解鎖。
- 共 15 種，各來源一致。Wikipedia 寫「14 種」，應該是較舊的數字。社群攻略說每年大約新增一種武器，通常在年度最後一季推出。
- **起始武器【待查證】**：Fandom 摘要寫免費起始武器是 Glaive，其他基礎武器在 15 級以後花 5 技能點解鎖；conquerorsbladehub 則寫從 Longsword & Shield 開始。可能是不同版本的差異。
- 武器之間有明確的強弱關係。攻略站把武器分成強、中、弱三檔（例如長矛和長弓偏弱），CBGG 也有每月更新的武器強度排行，可見平衡一直在變動。
- **原作沒有「雙手斧」**：任務清單提到的雙手斧，在原作裡最接近的是 Poleaxe（長柄斧）。

| 玩家為什麼在意 | 跟其他系統的關係 |
|---|---|
| 武器決定玩法：坦克、輔助、刺客、遠程、反騎都有 | 武器的護甲等級決定能穿哪種甲；武器種類決定裝備要做哪一套；有些兵團的加成跟武器類型連動 |

來源：[conquerorsbladehub – Choosing Your Weapon](https://www.conquerorsbladehub.com/guides/choosing_a_weapon.html)、[CBGG 武器強度表](https://cbgg.net/tier-list/heroes/)、[Fandom – Weapons / Armour](https://conquerors-blade.fandom.com/wiki/Weapons)（搜尋摘要）、[Wikipedia](https://en.wikipedia.org/wiki/Conqueror%27s_Blade)

### 1.2 武器技能、專精、被動

| 項目 | 運作方式 |
|---|---|
| 技能欄 | 每種武器有一池技能，戰前從中挑 **最多 4 個** 帶上場，其中**最多 1 個大招**（ultimate） |
| 技能升級 | 戰鬥獲得 **Skill Points（技能點）**，可以投入技能樹強化技能（Maul、Pike 例外）。技能點也能用其他貨幣購買 |
| 武器被動 | 部分武器自帶不可設定的被動機制，例如 Nodachi 的連殺增益型被動 |
| 騎乘 | 武將可以騎馬；馬鞍是可以打造的裝備，下馬動作本身也可以是技能（例如下馬時範圍擊倒） |
| 等級門檻 | 武器技能約 15 級開放，兵團精通約 30 級，武將裝備與屬性約 35 級（Fandom 摘要；新手攻略的等級表略有出入）【待查證】 |

「天賦」：原作沒有獨立的天賦樹。功能相近的是 **屬性點**（見 1.3）和 **符文（Runes）**。符文是第 7 季〈Wolves of Ragnarok〉加入的系統，替武器與護甲加上被動效果，配合技能流派；依賽季等級解鎖，賽季結束重置，使用後不會消耗，可以隨意切換。符文欄位數與完整清單【未找到】。

來源：[denetax – Beginner Guide 2026](https://denetax.fr/en/commencer-conquerors-blade-2026)、[Fandom – Heroes / Nodachi](https://conquerors-blade.fandom.com/wiki/Heroes)（搜尋摘要）、[Wolves of Ragnarok 新聞稿](https://conquerors-blade.prezly.com/conquerors-blade-new-viking-themed-season-available-now)

### 1.3 屬性、傷害類型、護甲

| 系統 | 內容 |
|---|---|
| 三種物理傷害 | **穿刺**（Piercing：槍尖、箭）、**劈砍**（Slashing：刃）、**鈍擊**（Blunt：錘、盾擊、槍柄）。每種都有對應的 **破甲值**（Armour Penetration）和 **防禦值** |
| 持續傷害 | 火焰、流血、毒，按時間扣血 |
| 混合武器 | 同一把武器的不同技能可能打出不同傷害類型，例如矛的槍尖是穿刺、槍柄是鈍擊；戰錘只有鈍擊 |
| 結算 | 攻擊方的某類傷害與破甲 vs. 防守方的該類防禦。官方開發日誌說各類傷害分開計算 |
| 屬性點 | 約 35 級開放，之後每升一級加 1 點，可以自由分配。屬性有 Strength、Agility、Toughness、Armour 等：力量加劈砍、鈍擊和穿刺破甲；敏捷加穿刺、劈砍破甲和鈍擊破甲；護甲加三種防禦（每點加多少屬於舊資料【待查證】） |
| 重量與負重 | 原作沒有負重數值；「重量」是用 **護甲等級（輕／中／重）** 來表現，並且鎖定能用的武器。【未找到】移速懲罰的具體數值 |

| 玩家為什麼在意 | 跟其他系統的關係 |
|---|---|
| 打重甲兵要用鈍擊或高破甲；配點會改變武將打誰最有效 | 兵團也有各自的傷害類型與護甲（重甲步兵怕鈍擊），所以武將與兵團的搭配會互相影響 |

來源：[gameplay.tips – Guide to Attributes](https://gameplay.tips/guides/4780-conquerors-blade.html)（舊資料）、[官方 – Introduction to damage and protection](https://conqblade.com/en/news/47-introduction-to-damage-and-protection)（403，以搜尋摘要為準）、[Fandom – Weapons](https://conquerors-blade.fandom.com/wiki/Weapons)

### 1.4 等級、裝備、稀有度、打造、重鑄、耐久

| 項目 | 運作方式 |
|---|---|
| 武將等級 | 打仗得經驗升級；等級主要帶來 **統率值上限**（見 2.3）、屬性點與系統解鎖。社群攻略提到 60 級統率 700 這個量級【待查證，會隨版本變】 |
| 裝備部位 | 武器、**頭盔、胸甲、手套、靴子**（4 個護甲欄），加上馬鞍（坐騎裝備） |
| 稀有度 | 常見→少見→稀有→史詩→傳說（顏色由灰到橙）。稀有 2～3 條隨機詞綴、史詩 3～4 條、傳說 4～6 條 |
| 打造 | 在城內工匠（Blacksmith／Armourer）用 **圖紙＋材料**（鋼錠、皮革、鉚釘、銀粉、金粉）打造。綁定裝備付銅幣，非綁定裝備付銀幣，非綁定的可以拿去市場賣 |
| 耐久 | 武將受傷就會掉耐久；耐久太低，裝備進入「損壞」狀態，屬性大減。**修理會降低耐久上限**（降的量跟修理前的損耗有關），所以裝備會慢慢消耗殆盡 |
| 重鑄 | 在「Artificer's Forge」消耗 Artificer's Stone，重新骰稀有度與詞綴。可以在新舊兩版之間擇一保留；重鑄也會回滿耐久與耐久上限。有保底：沒出傳說時，下次出傳說的機率會提高 |
| 分解 | 不要的裝備可以分解回材料；攻略建議分解前先裝備一次，才能保留它的外觀 |
| 外觀 | Attire（外觀時裝）不影響數值。來源有賽季通行證、寶箱（金鑰、銀鑰）、碎片兌換；兵團也有外觀與旗幟 |

| 玩家為什麼在意 | 跟其他系統的關係 |
|---|---|
| 裝備是中後期主要的成長，耐久讓材料需求一直存在 | 材料來自大地圖採集、市場、商人；打造站會依城池等級開放（見 4.x） |

來源：[conquerorsbladehub – Reforging & Repairing](https://www.conquerorsbladehub.com/guides/gear_crafting/reforging_and_repairing.html)、[conquerorsbladehub – Currencies & Economics](https://www.conquerorsbladehub.com/guides/economics.html)、[Fandom – Armour / Artificer's Forge](https://conquerors-blade.fandom.com/wiki/Artificer's_Forge)（搜尋摘要）

---

## 2. 兵團（Units）

### 2.1 兵團樹、時代、稀有度

| 項目 | 運作方式 |
|---|---|
| 兵團樹 | 兵團依「時代」分層排成一棵樹。要解鎖一個時代，必須先解鎖前一個時代的 **4 支兵團**；每支兵團還要前置節點加 **榮譽（Honour）** |
| 時代／星級 | 0～5 星、每半星一級：Rustic（0～0.5）→ Feudal（1～1.5）→ Chivalric（2～2.5）→ Silver（3～3.5）→ Heroic（4～4.5）→ Golden（5）。星級越高越強，統率消耗也越高 |
| 等級上限 | 大致隨時代提高，從約 10 到 30 級（Fandom 摘要【待查證】） |
| 分類 | 盾兵（小盾、塔盾）、長柄兵、近戰步兵、遠程步兵（弓、弩、火繩槍、火槍、標槍）、騎兵（槍騎、近戰騎、遠程騎）、特殊兵 |
| 國家／主題 | 原作不是用國家分樹，而是每季推出一批主題兵團（北歐、羅馬、日本、明朝、三國、阿茲特克等），並用「主題子樹」的形式加入。例如 2026 年第 26 季重新加入「北歐之魂」子樹，可以用榮譽解鎖 |
| 碎片 | 兵團碎片累積到一定數量，就可以免榮譽解鎖；重複取得的碎片轉成經驗 |
| 輔助兵團／傭兵 | 每週可以借用高星兵團一週試用。已滿級的兵團可以當作「傭兵」出戰，提供額外的榮譽、銅幣、經驗 |
| 編成預設 | 可以存 3 組一般戰鬥編成和 3 組大地圖編成，隨時切換 |

來源：[denetax – Complete Unit Guide](https://denetax.fr/en/tutoriel-gestion-unite-conqueror-blade)、[Fandom – Units / Mastery](https://conquerors-blade.fandom.com/wiki/Units)（搜尋摘要）、[官方 – Season 26 更新](https://www.conquerorsblade.com/en/news/1718/)、[官方 – 2026-06 開發路線圖](https://www.conquerorsblade.com/en/news/1792/)

### 2.2 兵團成長：等級、老兵、戰術書、精通

| 系統 | 運作方式 | 玩家為什麼在意 |
|---|---|---|
| 兵團等級 | 只有實際上場的兵團能分到經驗。每升一級血量約加 1～2%，並給 1 個 **老兵點（Veterancy Point）** | 讓「養兵」有長期目標 |
| 老兵樹 | 點數投入一條條分支節點；**左邊的節點點滿才能往右點**。節點的效果包括加數值、新陣型、新指令，或強化既有指令。常見分支例如「反騎路線 vs. 反步路線」。重置要用重置卷軸 | 同一支兵團可以養成不同用途，選擇有取捨 |
| 戰術書（Doctrine） | 每支兵團最多 **5 個欄位**，依兵團等級逐步開放。戰術書有稀有度，部分只限特定兵種或特定兵團。放上去後不能拔下，只能用新的蓋掉；舊的會銷毀，或用道具取回。例如「降低 16% 統率消耗」這類戰術書 | 第二層客製化，也是賽季獎勵的主要內容 |
| 精通（Mastery） | 部分中高星兵團有 I～VIII 共 8 段的線性強化，需要消耗精通卷軸，效果通常很強 | 長期投資，讓老兵團保持競爭力 |
| 共享經驗 | 滿級兵團上場時打到的經驗會進入共享池，可以分給任何兵團 | 降低養新兵的負擔 |

來源：[denetax – Complete Unit Guide](https://denetax.fr/en/tutoriel-gestion-unite-conqueror-blade)、[CBGG – Doctrines](https://cbgg.net/wiki/doctrines/)、[CBGG – Incendiary Archers 兵團指南](https://cbgg.net/units/incendiary-archer/)、[官方 – Unit Mastery 開發日誌](https://www.conquerorsblade.com/news/929/)

### 2.3 統率值（Leadership）與編成

| 項目 | 運作方式 |
|---|---|
| 統率上限 | 武將等級（加上部分裝備）決定統率上限。帶上場的兵團統率消耗總和不能超過上限，同一支兵團不能帶兩次 |
| 兵團消耗 | 星級越高越貴；戰術書可以降低消耗 |
| 例外 | 「自由戰」活動模式不受統率限制 |
| 設計意義 | 用一個數字同時限制「帶多少」和「帶多強」：高星兵團少帶幾支，或低星兵團多帶幾支 |

來源：[denetax – Complete Unit Guide](https://denetax.fr/en/tutoriel-gestion-unite-conqueror-blade)、[CBGG – Incendiary Archers 兵團指南](https://cbgg.net/units/incendiary-archer/)

### 2.4 傷亡、補員、補給

| 項目 | 運作方式 |
|---|---|
| 戰損延續 | 兵團戰死的人數會帶出戰場。補員要用 **兵團補給包（Kit）**、銅幣，或用銀幣在市場買；騎兵另外需要 **馬匹**（在大地圖的牧場取得） |
| 低兵力懲罰 | 兵力 50% 以下：造成傷害 −10%、受到傷害 +10%；20% 以下：不能上場 |
| 糧食（大地圖） | 沒有糧食的兵團不能攻打據點，也不能參戰；被攻擊時造成傷害 −25%、受到傷害 +25% |
| 戰場補給點 | 戰鬥中可以回補給點換兵團、補充火砲 |
| 版本變動 | 第 26 季宣布該季出戰「不消耗補給包」，可見這個經濟壓力本身也在調整【以官方公告為準】 |

來源：[denetax – Complete Unit Guide](https://denetax.fr/en/tutoriel-gestion-unite-conqueror-blade)、[官方 – Season 26 更新](https://www.conquerorsblade.com/en/news/1718/)

### 2.5 兵團指令與陣型

| 指令（PC 預設鍵） | 效果 |
|---|---|
| Follow 跟隨（C） | 兵團跑回武將身邊並跟著走 |
| Hold 駐守（X） | 兵團在武將前方以目前選的陣型列陣；**連按 X 切換到下一個陣型** |
| Attack 進攻（V） | 兵團自由攻擊附近敵人 |
| 陣型（F1～F4） | 各兵團可用的陣型不同；按 F 鍵直接切換 |
| 兵團專屬指令 | 例如盾兵的 Shield Rush、騎兵的 Charge（沿路造成大量傷害）、長槍兵架槍、弓兵齊射或火箭，大多由老兵樹解鎖或強化 |
| 陣型例子 | 龜甲盾陣（可以帶陣衝鋒）、橫隊（堵通道，但背後空虛）、圓陣（四面防禦） |
| 地圖指令 | 可以在地圖或畫面上指定移動點（細節【待查證】） |

| 玩家為什麼在意 | 跟其他系統的關係 |
|---|---|
| 武將砍殺之外，勝負關鍵在兵團站位與指令時機 | 老兵樹會解鎖新陣型與指令；地形（狹道、城門）決定哪種陣型有效 |

來源：[denetax – Keybinds & Controls](https://denetax.fr/en/tutoriel-commandes-utiles-conqueror-blade)、[Fandom – Units / Unit Orders](https://conquerors-blade.fandom.com/wiki/Units)（搜尋摘要）、[Steam 社群影片 – Orders and Formations](https://steamcommunity.com/sharedfiles/filedetails/?id=2505900640)

---

## 3. 戰場類型

### 3.1 模式總表

| 類別 | 模式 | 運作方式 |
|---|---|---|
| 配對 PvP | **攻城戰**（Siege Battle） | 攻方從城外出發，**依序奪取一連串據點**，限時內拿下最後據點就獲勝；守方守住或撐到時間結束就獲勝 |
| 配對 PvP | **野戰**（Field Battle） | 依地圖分成兩種子模式：搶據點累積分數，或攻佔敵方營地（Conquest） |
| 配對 PvP | 排位戰（Ranked）、死鬥（Deathmatch）、All or Nothing | 排位有每週結算的段位獎勵 |
| 活動 PvP | 自由戰（Free Battles） | 不限統率，戰損不消耗補給包 |
| 配對 PvE | **遠征**（Expeditions） | 多人合作打 AI 關卡（Wikipedia 寫五人） |
| 配對 PvE | **山賊突襲**（Bandit Raid） | 比擊殺速度，經驗高；每週有次數限制【待查證】 |
| 配對 PvE | **佈防守衛**（Deploy & Defend） | 開場先在地圖標記點**擺放兵團**，再分階段抵擋 AI 進攻；每階段可以重擺的次數有限；救下村民會有額外獎勵 |
| 配對 PvE | 訓練戰 | 跟 AI 打，新手練習用 |
| 大地圖 | 追擊、山賊營地、叛軍、領地戰 | 見第 4 節 |
| 特殊地圖 | 長城、Into the Breach、海盜突襲等 | 活動或特殊地圖，主要給銅幣、經驗、榮譽 |

- 配對攻城戰會**從全電腦對手開始**，再進入人機混合，最後才是全真人，作為新手的過渡（denetax）。
- 據點規則（以領地戰為例）：每場有 3 個據點，雙方各一個大本營加上一個中央點。中央點要先拿下，才能打最後的據點。據點被佔領後，即使沒人站在上面也會持續替佔領方計分，所以必須去奪回；無人爭奪時佔領約需 1 分鐘。

來源：[Fandom – Field Battle / Siege Battle / Free Battles](https://conquerors-blade.fandom.com/wiki/Siege_Battle)（搜尋摘要）、[conquerorsbladehub – Deploy & Defend](https://www.conquerorsbladehub.com/guides/deploy_and_defend.html)、[conquerorsbladehub – Territory Wars](https://www.conquerorsbladehub.com/guides/territory_wars.html)、[denetax – Beginner Guide 2026](https://denetax.fr/en/commencer-conquerors-blade-2026)

### 3.2 攻城器械與火砲

原作把這些東西分成兩類：**攻城器械**（地圖預設，或由家族在營地購買／建造）和 **火砲**（武將從自己的背包帶上場，通常一人一台）。

| 類別 | 項目 | 作用 |
|---|---|---|
| 攻城器械 | 衝車（Battering Ram） | 破城門，連打開的城門也能破壞；不傷人；操作的兵團有部分遮蔽 |
| 攻城器械 | 雲梯（Siege Ladder） | 讓步兵爬上城牆 |
| 攻城器械 | 攻城塔（Siege Tower） | 推到城牆邊開出通道；配對攻城戰中是預設的，被毀後約 10 秒重生 |
| 攻城器械 | 天橋（Skybridge） | 跨越城牆或壕溝的通道（細節【待查證】） |
| 攻城器械 | 投石機（Trebuchet） | 攻方每位玩家每場可以呼叫一次投石轟炸，用滑鼠指定落點；領地戰中是要建造的實體，可以被摧毀。守方不能用 |
| 火砲 | 臼砲／迫擊砲 | 拋射越牆，範圍傷害並擊倒、燃燒 |
| 火砲 | 長管砲（Culverin） | 直射可以穿透 3～5 人，能打火砲與攻城塔，**不傷友軍** |
| 火砲 | 一般火砲 | 範圍傷害並擊倒，**會傷友軍** |
| 火砲 | 床弩（Ballista） | 打武將用，傷害高、目標少，不傷友軍 |
| 火砲 | 蠍弩、霰彈砲、火箭車（Hwacha）、攻城床弩、投石車、火箭、巨型射石砲、火流星 | 各有射程、架設時間、是否傷友軍等差異。架設時間約 5～25 秒，稀有度影響傷害、血量、彈藥與射程 |
| 取得 | 打造（在城內的火砲工坊，用精煉零件）、摧毀敵方火砲取得碎片（5 片換一箱）、領地戰參與獎勵 | |

**守城方**：可以用城牆上的預設火砲、自己帶的火砲，或開城門出擊。領地戰的守方據點由 AI 守軍與玩家一起防守。

| 玩家為什麼在意 | 跟其他系統的關係 |
|---|---|
| 攻城戰的節奏就是「推進器械 → 破門或登城 → 奪點」 | 器械與火砲要打造（城池等級決定能不能做高階器械）、要花家族聲望購買，所以把戰略層的經濟和戰場綁在一起 |

來源：[denetax – Artillery Guide 2026](https://denetax.fr/en/tutoriel-artillerie-conqueror-blade)、[Fandom – Artillery](https://conquerors-blade.fandom.com/wiki/Artillery)（搜尋摘要）、[conquerorsbladehub – Siege Weapons crafting](https://www.conquerorsbladehub.com/crafting/siege_weapons/)

### 3.3 賽季戰役、地圖事件

- **賽季挑戰**（Season Challenges）：每季一條分階段的挑戰線，獎勵是新兵團、坐騎、戰術書。第 26 季降低了挑戰的難度與階段數。
- **賽季世界主題**：2026 年新增一個「三國」世界主題，跟正式服的賽季分開營運，有自己的時程（官方路線圖）。
- 地圖事件：大地圖上的叛軍、山賊營地，還有 AI「暴君軍」行軍（見 4.2），可以視為動態事件。

來源：[官方 – 2026-06 開發路線圖](https://www.conquerorsblade.com/en/news/1792/)、[官方 – Season 26 更新](https://www.conquerorsblade.com/en/news/1718/)

---

## 4. 戰略層（開放世界）

### 4.1 大地圖、行軍、補給、採集、運輸

| 系統 | 運作方式 |
|---|---|
| 大地圖 | 多個地區，地圖上有城市、村莊、要塞、關隘與資源點；玩家帶著自己的軍隊即時移動 |
| 糧食 | 行軍時會消耗糧食，沒糧食就有懲罰（見 2.4）。可以在旅店或農場付銅幣補給，延長遠征距離 |
| 採集 | 在資源點（農場、牧場、伐木場、皮革坊、棉田、鐵礦、銅礦、採石場）付銅幣加上 **領主課的資源稅**，**派兵團當勞力**，等待一段時間後取得資源。高階採石場會出煤、硝石等稀有材料。兵團有「勞力」數值，戰術書也能提高 |
| 運輸 | 採到的資源裝上自己的貨車或商隊；裝滿時多的資源會留在地上，要運回城市或營地的倉庫 |
| 補給營地 | 個人的 Supply Camp，用遷移令（銀幣購買）搬遷 |
| 徵用令 | 每日任務給的 Requisition Order，用了可以免稅、不受次數限制地採集一次 |
| 大地圖戰鬥 | 追擊、山賊營地、叛軍，遇敵後進入戰場 |

來源：[conquerorsbladehub – Gathering Resources](https://www.conquerorsbladehub.com/crafting/resources/)（搜尋摘要）、[denetax – Farm Resources](https://denetax.fr/en/tutoriel-ressource-conqueror-blade)、[conquerorsbladehub – Currencies & Economics](https://www.conquerorsbladehub.com/guides/economics.html)

### 4.2 家族（House）、聯盟、領地戰

| 系統 | 運作方式 |
|---|---|
| 家族／聯盟 | 家族就是公會（約 12 級開放），多個家族可以組成聯盟；不想自己找家族的玩家可以加入 AI 營運的家族（Cohort）與聯盟（Legion） |
| 領地戰 | 每週二、六各一場，宣戰時段約 1 小時。攻打一個領地需要家族聲望與家族等級達到門檻（聯盟中只要一個家族符合就行）；**宣戰要花聲望**，提早一天以上宣戰比較便宜 |
| 統治家族 | 多個家族宣戰同一塊領地時，聲望最高的家族取得主導權 |
| 野戰營地 | 軍官在營地購買投石機、衝車、攻城塔；成員在營地買器械、補兵、補糧 |
| 守方 | 每輸一場，全兵團扣三分之一兵力；只能用戰團內的兵團（防守營地時除外） |
| AI 暴君軍 | AI 大軍在地圖上行軍，玩家可以攔截；攔截失敗的話它會紮下攻城營地 |
| 繁榮度 | 領地被打下扣 40，撐到時間結束扣 10；繁榮度低於 0 會降級。繁榮度決定銀幣收入 |

來源：[conquerorsbladehub – Territory Wars](https://www.conquerorsbladehub.com/guides/territory_wars.html)、[denetax – Beginner Guide 2026](https://denetax.fr/en/commencer-conquerors-blade-2026)

### 4.3 領地（Fief）類型與城內設施

| 類型 | 特色 |
|---|---|
| 村莊 | 沒有城牆，不能用重型攻城器械；可以打造補給包與攻城器械；升級便宜 |
| 城鎮 | 有城牆，有走私商與基礎打造；聲望高（決定每週可以發幾個頭銜），但維護費高 |
| 要塞 | 有城牆，用來卡住交通路線；通常沒有資源點 |
| 關隘 | 只有基礎打造；佔領才能參加首都之戰，賽季結束時給 Triumph |
| 首都 | 所有 NPC 與服務都有；統治聯盟可以打造最高階的補給包 |
| 貿易殖民地 | 安全的交易據點，不能被攻打 |

- 領地有等級（例如村莊到 7 級、城鎮和要塞到 9 級）、維護費、繁榮度。等級越高，獎勵倍率越高，能開的打造等級也越高（例如 5 級才能打造中階攻城器械，7 級才能打造最高階）。
- 擁有者的收益：每週銀幣、攻城器械、外觀寶箱、榮譽加成、頭銜；稅率由家族設定（資源稅、工坊稅）。
- 城內 NPC：工匠（打造或重鑄）、軍需官（補兵、捐獻）、藥商（每週用銅幣賣材料）、走私商（倉庫擴充）、馬商（馬鞍）、交易所（市場）、駐軍官（遷移營地）。
- **委託任務**：領地任務（Fief Quests，給建設資源與賽季貨幣）、日常戰鬥次數任務、每週挑戰、劇情／支線任務。

來源：[conquerorsbladehub – Fief Types](https://www.conquerorsbladehub.com/guides/fief_ownership/types_of_fiefs.html)、[conquerorsbladehub – New Players Guide](https://www.conquerorsbladehub.com/guides/new_players_guide.html)、[denetax – Fief Quests](https://denetax.fr/en/tutoriel-gestion-quete-fief-conqueror-blade)

---

## 5. 經濟與成長

| 貨幣／資源 | 取得 | 用途 |
|---|---|---|
| 銅幣（Bronze） | 幾乎所有活動 | 主要貨幣：補兵、修理、請 NPC 打造綁定裝備、採集費 |
| 銀幣（Silver） | 每週挑戰、市場賣東西、領地每週分紅 | 玩家市場交易、非綁定打造、遷移令 |
| 榮譽（Honour） | 戰鬥 | 解鎖兵團樹、榮譽商店 |
| 技能點 | 戰鬥 | 武器技能升級、解鎖武器 |
| 武將經驗／兵團經驗／共享經驗 | 戰鬥 | 升級 |
| 賽季貨幣（Fame、Glory、Acclaim 等） | 戰鬥、任務、領地戰 | Glory 推進通行證；賽季結束重置 |
| 戰術書相關（Treatise、Doctrine Spirit） | 挖掘、通行證 | 取得戰術書 |
| Triumph | 領地戰、頭銜 | 賽季獎勵 |
| 付費貨幣（Sovereigns） | 真錢 | 加速、外觀、消耗品（早期資料說無法在遊戲中取得【待查證】） |

| 系統 | 運作方式 |
|---|---|
| 市場（Trading Post） | 玩家之間用銀幣交易材料、補給包、坐騎、器械 |
| 打造 | 武將裝備（工匠）、兵團補給包、火砲（工坊，要付工坊稅）。材料分基礎與精煉兩層 |
| 通行證 | 免費線加付費線，獎勵以武將、兵團、坐騎外觀與旗幟為主。第 26 季調低了貴族等級的經驗需求 |
| 賽季 | 每季約 2～3 個月【待查證】，帶入新主題兵團、地圖、平衡改動；部分系統（符文、賽季貨幣）每季重置 |
| 成就 | 有成就系統，例如成就可以給背包擴充（官方第 26 季公告），完整清單【未找到】 |
| 會員 | 付費會員（Premium）提供額外鑰匙、戰術書等 |

來源：[conquerorsbladehub – Currencies & Economics](https://www.conquerorsbladehub.com/guides/economics.html)、[Steam – OFFICIAL Consumables & Currencies guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1807773364)（舊資料）、[denetax – Crafting](https://denetax.fr/en/tutoriel-craft-conqueror-blade)、[官方 – Season 26 更新](https://www.conquerorsblade.com/en/news/1718/)

---

## 6. 其他系統

| 系統 | 現況 |
|---|---|
| 士氣 | 【未找到】原作沒有可靠資料顯示有「士氣崩潰／潰逃」機制。最接近的是「兵力低於 50% 時減傷減攻、低於 20% 不能上場」和「斷糧懲罰」。**這是 TopPath Blade 可以自己加的差異化點** |
| 天氣 | NamuWiki（韓文，二手摘要）說所有戰鬥都受天氣影響：晴天沒影響，陰天略降視野與遠程命中，某些兵種在特定天氣下會被削弱甚至完全不能作用。完整規則【待查證】（例如雨天對火器或火攻的影響沒有找到一手來源） |
| 地形 | 狹道、城門、高地會影響陣型與騎兵效果。CBGG 的兵團頁有「地形評價」相關內容（細節【待查證】） |
| 友軍傷害 | **只對部分火砲有效**：一般火砲、火箭、巨型射石砲會傷到友軍；長管砲和床弩不會。武將與兵團的近戰是否會傷友軍【未找到】，一般認知是不會 |
| PvP 配對 | 一般配對（依武將或兵團強度，細節【未找到】）、排位戰（每週段位結算）、攻城戰從全電腦對手逐步過渡到全真人 |
| 新手引導 | 開場有過場動畫，再加上幾個教學關卡（武將、移動、兵團、火砲）。各系統依武將等級分段開放（家族約 12 級、戰術書約 24 級、輔助兵團約 25 級、鐵匠約 34 級、屬性約 35 級、符文約 50 級、重鑄約 60 級，社群資料【待查證】）。社群普遍評價教學不足 |
| 社交 | 家族、聯盟、世界聊天（要消耗道具才能發言）、**騎士與侍從**（師徒制：高等玩家帶新人，第 26 季起侍從可以套用騎士的統率與兵團數值打攻城戰）、回歸玩家加成 |

來源：[NamuWiki – 配對地圖](https://en.namu.wiki/w/%EC%BB%A8%EC%BB%A4%EB%9F%AC%EC%8A%A4%20%EB%B8%94%EB%A0%88%EC%9D%B4%EB%93%9C/%EB%A7%A4%EC%B9%AD%20%EB%A7%B5)（403，以搜尋摘要為準）、[denetax – Artillery Guide 2026](https://denetax.fr/en/tutoriel-artillerie-conqueror-blade)、[denetax – Beginner Guide 2026](https://denetax.fr/en/commencer-conquerors-blade-2026)、[官方 – Season 26 更新](https://www.conquerorsblade.com/en/news/1718/)

---

## 7. 對 TopPath Blade 的建議

### 7.1 已有的系統（依 design.md v0.2）

4 兵種與克制表、側面和背後加成、5 陣型、兵團技能（每兵種 2 個）、武將 2 武器 × 3 技能、5 個裝備欄（武器、頭盔、胸甲、護手、披風）、3 稀有度、Tab 切換指揮對象與 3 種指令（跟隨、駐守、進攻）、格擋、野戰、攻城、守城（含出城與城上弓兵）。戰略層（大地圖、營地、城內、佔領、資源）已經寫了規劃，但還沒實作。

### 7.2 缺少的系統（依「對 2D 單機原型的價值」高到低，同價值時難度低的排前面）

| # | 系統 | 原作對應 | 單機價值 | 實作難度 | 說明 |
|---|---|---|---|---|---|
| ★1 | **統率值與出戰編成** | 2.3 Leadership | 高 | 低 | 給每個兵種一個統率成本，武將等級決定上限，戰前選要帶哪些兵團。一個數字就能產生編成取捨，也是後面兵團成長的前提 |
| ★2 | **兵團戰損延續與補員** | 2.4 | 高 | 低～中 | 戰後保留剩餘兵力，到城內募兵處花錢補員；兵力過低時有懲罰或不能出戰。這直接把戰鬥和 design.md 第 8 節的資源、募兵串起來 |
| ★3 | **兵團等級與老兵技能點** | 2.2 Veterancy | 高 | 中 | 兵團打仗升級，每級 1 點，投入簡化的 2 分支線性樹，例如長槍兵的「反騎」和「推進」路線，解鎖現有的兵團技能或強化它們。這是單機遊戲重玩的主要動力 |
| ★4 | **攻城器械＋多段據點** | 3.1、3.2 | 高 | 中 | 現有攻城戰只有「打城門＋主堡」。可以加上衝車（兵團推動，破門快）、雲梯或攻城塔（另一條入城路線），以及「外城據點 → 內城 → 主堡」的多段推進；佔領後的據點持續計分或解鎖重生點 |
| ★5 | **PvE 佈防模式** | 3.1 Deploy & Defend | 中高 | 低～中 | 重用守城地圖：開場在標記點擺放兵團，再分波抵擋 AI 進攻。可以直接重用現有的 AI、城牆與兵團系統，很適合當單機的重玩模式或教學關卡 |
| 6 | 傷害類型與護甲類型 | 1.3 | 中 | 中 | 把「穿刺、劈砍、鈍擊 × 輕、中、重甲」加進現有克制表，讓武器選擇也影響打誰。注意不要讓它跟現有克制表重複計算 |
| 7 | 可部署火砲（一場一台） | 3.2 | 中 | 中 | 武將背包帶一台床弩或火砲上場，有架設時間；會不會傷友軍可以做成取捨 |
| 8 | 兵團專屬陣型與指令解鎖 | 2.5 | 中 | 低 | 讓陣型從老兵樹解鎖，而不是一開始全開；指令增加「衝鋒」「射擊目標」 |
| 9 | 補給與糧食懲罰（大地圖） | 2.4、4.1 | 中 | 中 | design.md 已經規劃。原作的做法可以借：「沒糧食不能開戰、被攻擊時打折扣」 |
| 10 | 戰術書（兵團詞綴欄） | 2.2 Doctrine | 中 | 低～中 | 戰利品型的兵團裝備，提供掉落獎勵。原型可以先做 2 欄 |
| 11 | 武將屬性點 | 1.3 | 中 | 低 | 少量屬性（例如力量、敏捷、韌性）提供武將成長 |
| 12 | 裝備耐久、打造、重鑄 | 1.4 | 中低 | 中 | 適合有經濟循環之後再做；原型只要有掉落與打造就夠了 |
| 13 | 兵團樹與時代解鎖 | 2.1 | 中低 | 中 | 等兵種超過 4 種再做；可以改成「城池或科技解鎖新兵種」 |
| 14 | 天氣與地形 | 6 | 中低 | 中 | 雨天讓火箭失效、霧天降低射程，這類效果在 2D 很好表現 |
| 15 | 士氣與潰逃（原作沒有） | 6 | 中 | 中 | 可以當差異化設計：被側擊或背擊、主將陣亡時士氣下降，士氣歸零的兵團潰逃。要注意別讓單機戰鬥變得太隨機 |
| 16 | 採集、運輸、貨車 | 4.1 | 低 | 高 | 在單機裡容易變成跑腿工作，建議簡化成「佔領城池給固定收入」 |

★＝建議優先做的前 5 項。

### 7.3 不適合照搬的系統

| 系統 | 原因 | 單機替代做法 |
|---|---|---|
| 家族、聯盟、領地戰、宣戰聲望 | 需要大量線上玩家與排程 | 改成 AI 勢力的領土爭奪，也就是 design.md 規劃的「敵方反攻」；可以參考原作的「AI 暴君軍行軍，可以攔截」 |
| 玩家市場、銀幣經濟、稅率 | 需要玩家之間交易 | 改成固定價格的 NPC 商店 |
| 賽季、通行證、賽季貨幣重置 | 線上營運與付費設計，對單機只會增加負擔 | 不做，或改成章節或戰役進度 |
| 排位與配對、騎士與侍從、世界聊天 | 需要線上玩家 | 不做 |
| 碎片、鑰匙、外觀寶箱、多種代幣 | 主要用來營利與留存，系統很多但玩法價值低 | 原型只保留一種貨幣（金錢），最多再加一種成長貨幣 |
| 15 種武器、上百支兵團、數百種戰術書 | 內容量是線上遊戲規模 | 以 2～4 武器、4～8 兵種為原型上限 |
| 原作的名稱、兵團名、技能名、數值、美術 | 版權與原創性 | 只參考系統結構，自訂名稱與數值（design.md 已經是這個方向） |

### 7.4 建議做法順序（跟 design.md 第 8 節合併）

1. 統率值與編成（★1）→ 2. 戰損延續與補員（★2，跟「城內募兵處」一起做）→ 3. 兵團等級與老兵點（★3）→ 4. 攻城器械與多段據點（★4，強化現有的攻城戰）→ 5. 佈防模式（★5，重用守城地圖）。之後再接 design.md 的戰略地圖、營地與補給、敵方反攻。
