#!/bin/bash
# Mac：雙擊開遊戲伺服器（帳號、存檔、遊戲檔案），需要安裝 Node.js。資料存在 data/ 資料夾。
cd "$(dirname "$0")/server" || exit 1
[ -d node_modules ] || npm ci --omit=dev
(sleep 2; open http://localhost:8765/) &
node src/index.js
