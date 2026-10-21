@echo off
rem 開遊戲伺服器（帳號、存檔、遊戲檔案），需要安裝 Node.js。資料存在 data\ 資料夾。
cd /d "%~dp0server"
if not exist node_modules call npm ci --omit=dev
start "" http://localhost:8765/
node src\index.js
