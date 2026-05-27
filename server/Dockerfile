# ════════════════════════════════════════════════════════════════
# 查帳系統 Node.js 後端 Dockerfile
# ════════════════════════════════════════════════════════════════

FROM node:20-alpine

# 設定時區
RUN apk add --no-cache tzdata curl && \
    cp /usr/share/zoneinfo/Asia/Taipei /etc/localtime && \
    echo "Asia/Taipei" > /etc/timezone

WORKDIR /app

# 先複製 package.json 安裝依賴（利用 Docker layer cache）
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# 複製應用程式碼
COPY . .

# 建立檔案儲存目錄
RUN mkdir -p /app/files/vouchers /app/files/excel

# 開放 port
EXPOSE 3000

# 健康檢查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
