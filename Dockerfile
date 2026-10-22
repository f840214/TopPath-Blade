# TopPath Blade：Node 後端同時提供遊戲檔案與 /api（帳號、存檔）
# 資料庫預設用 PGlite，存在 /app/data（compose.yaml 掛到主機的 ./data）
FROM node:24-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN npm ci --omit=dev --prefix server
COPY server/src/ server/src/
COPY index.html sw.js ./
COPY css/ css/
COPY js/ js/
COPY lib/ lib/
COPY assets/ assets/
ENV PORT=8765 NODE_ENV=production
EXPOSE 8765
CMD ["node", "server/src/index.js"]
