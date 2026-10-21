@echo off
rem 用本機伺服器開遊戲（PixiJS / WebGL 不能讀 file:// 的圖片）。需要安裝 Node.js。
cd /d "%~dp0"
start "" http://localhost:8765/
npx -y http-server -p 8765 -c-1
