# 查帳憑證核對系統 — Docker 部署版

把整套系統打包成 Docker，**本機開發 + Linux 主機部署**。

## 📦 架構

```
┌──────────────────────────────────────────────────────┐
│  Docker Compose                                      │
│                                                      │
│  ┌──────────────────┐    ┌──────────────────────┐    │
│  │ audit-app        │    │ audit-db             │    │
│  │ Node.js + Express│ ←→ │ PostgreSQL 16        │    │
│  │ Port: 3000       │    │ Port: 5432 (內部)    │    │
│  └──────────────────┘    └──────────────────────┘    │
│         ↓                                            │
│  Volume: app_files (憑證 + Excel)                    │
│  Volume: db_data (資料庫)                            │
└──────────────────────────────────────────────────────┘
```

---

## 🚀 本機開發（Windows + Docker Desktop）

### 1. 準備設定檔

```powershell
cd audit-docker-server
copy .env.example .env
```

開啟 `.env`，**至少修改以下兩個密碼**：
- `POSTGRES_PASSWORD`：資料庫密碼（任意強密碼）
- `JWT_SECRET`：token 加密金鑰（32+ 字元隨機字串）
- `ADMIN_INITIAL_PASSWORD`：管理員初始密碼

### 2. 啟動

```powershell
docker compose up -d
```

第一次會自動：
1. 下載 PostgreSQL + Node 映像檔（約 3 分鐘）
2. 建立資料庫 + 8 家預設客戶
3. 建立 admin 管理員帳號（密碼 = ADMIN_INITIAL_PASSWORD）
4. 啟動 Node 服務

### 3. 開啟瀏覽器

```
http://localhost:3000
```

帳號：`admin`，密碼：你在 .env 設的 `ADMIN_INITIAL_PASSWORD`

### 4. 看 log

```powershell
docker compose logs -f app
```

### 5. 停止

```powershell
docker compose down
```

加 `-v` 會連資料庫資料一起清空（重置）：
```powershell
docker compose down -v
```

---

## 🐧 Linux 主機部署（Ubuntu）

### Step 1：在 Linux 安裝 Docker

```bash
# 1) 更新系統
sudo apt update && sudo apt upgrade -y

# 2) 安裝 Docker 官方版
sudo apt install -y docker.io docker-compose-plugin

# 3) 把當前使用者加入 docker 群組（之後不用 sudo）
sudo usermod -aG docker $USER
newgrp docker

# 4) 驗證
docker --version
docker compose version
```

### Step 2：把專案傳到 Linux 主機

**方法 A：用 USB 隨身碟**
1. 把 `audit-docker-server/` 整個資料夾複製到隨身碟
2. 在 Linux 主機上插入隨身碟
3. 複製到 `/opt/audit-server/`

**方法 B：用 scp（推薦）**
在 Windows PowerShell：
```powershell
cd 'C:\path\to\audit-docker-server'
scp -r . user@192.168.x.x:/tmp/audit-docker-server
```

然後在 Linux 主機：
```bash
sudo mv /tmp/audit-docker-server /opt/audit-server
sudo chown -R $USER:$USER /opt/audit-server
cd /opt/audit-server
```

**方法 C：用 git**（適合長期維護）
```bash
# 推到 Github 私人 repo，主機端 clone
cd /opt
sudo git clone https://github.com/yourname/audit-server.git
sudo chown -R $USER:$USER audit-server
cd audit-server
```

### Step 3：設定環境變數

```bash
cp .env.example .env
nano .env
# 改 POSTGRES_PASSWORD / JWT_SECRET / ADMIN_INITIAL_PASSWORD
```

### Step 4：啟動

```bash
docker compose up -d
```

驗證：
```bash
docker compose ps          # 兩個 container 都應為 healthy
docker compose logs -f app # 看 log
```

### Step 5：開放防火牆（內網存取）

```bash
sudo ufw allow from 192.168.0.0/16 to any port 3000
sudo ufw status
```

### Step 6：從其他電腦測試

取得 Linux 主機 IP：
```bash
hostname -I
```

在區域網路內的任一台電腦的瀏覽器：
```
http://<linux-ip>:3000
```

例如：`http://192.168.1.100:3000`

---

## 👤 使用者管理

### 第一次登入

帳號：`admin`，密碼：`.env` 中 `ADMIN_INITIAL_PASSWORD` 的值。

### 修改密碼

登入後，點右上角 👤 頭像。

### 新增查帳人員（用 admin 帳號）

目前透過 API 新增（之後可加 UI）：

```bash
# 取得 admin token（先登入）
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"你的密碼"}' | jq -r .token)

# 新增使用者
curl -X POST http://localhost:3000/api/auth/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"陳大明","displayName":"陳大明","password":"chen2026","role":"auditor"}'
```

---

## 💾 資料備份

### 備份資料庫

```bash
# 進 db container 內 dump
docker compose exec db pg_dump -U audit_user audit_db > backup-$(date +%Y%m%d).sql

# 或備份整個 volume
docker run --rm -v audit-docker-server_db_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/db-backup-$(date +%Y%m%d).tar.gz /data
```

### 備份檔案（憑證 + Excel）

```bash
docker run --rm -v audit-docker-server_app_files:/data -v $(pwd):/backup alpine \
  tar czf /backup/files-backup-$(date +%Y%m%d).tar.gz /data
```

### 自動備份（每天 02:00）

`sudo crontab -e`：
```cron
0 2 * * * cd /opt/audit-server && docker compose exec -T db pg_dump -U audit_user audit_db | gzip > /backup/db-$(date +\%Y\%m\%d).sql.gz
```

---

## 🔧 常用指令

| 動作 | 指令 |
|------|------|
| 啟動 | `docker compose up -d` |
| 停止 | `docker compose down` |
| 重啟 app | `docker compose restart app` |
| 看 log | `docker compose logs -f app` |
| 進 container | `docker compose exec app sh` |
| 進資料庫 | `docker compose exec db psql -U audit_user audit_db` |
| 更新（拉新版） | `git pull && docker compose up -d --build` |
| 完全重置 | `docker compose down -v && docker compose up -d` |

---

## 🆘 常見問題

### Q：上不去？
1. `docker compose ps` → 兩個 container 都該是 `running` + `healthy`
2. `docker compose logs app` → 看錯誤訊息
3. 確認 port 3000 沒被佔用：`sudo lsof -i :3000`

### Q：忘記 admin 密碼？
進資料庫直接 reset：
```bash
docker compose exec db psql -U audit_user audit_db -c \
  "UPDATE users SET password_hash = '\$2a\$10\$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' WHERE username = 'admin';"
# 上面 hash 對應密碼：admin123
```

### Q：要從外網存取？
建議用 Cloudflare Tunnel（免費 + 安全）：
```bash
# 安裝 cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
# 申請並設定 tunnel（詳見 Cloudflare 文件）
```

---

## 📁 專案結構

```
audit-docker-server/
├── docker-compose.yml      # Docker 編排
├── .env.example            # 環境變數範本
├── .env                    # 你的設定（不要 commit）
├── README.md               # 本檔案
├── db/
│   ├── schema.sql          # 資料表結構
│   └── seed.sql            # 預設客戶資料
└── server/
    ├── Dockerfile          # Node app 映像檔
    ├── package.json
    ├── server.js           # Express 主入口
    ├── db.js               # PG 連線
    ├── middleware/
    │   └── auth.js         # JWT 驗證
    ├── routes/
    │   ├── auth.js         # /api/auth/*
    │   ├── clients.js      # /api/clients/*
    │   ├── history.js      # /api/history/*
    │   ├── files.js        # /api/files/*
    │   └── settings.js     # /api/settings/*
    └── public/             # 前端靜態檔
        ├── index.html      # 登入頁
        └── app.html        # 主程式
```

---

## 🔄 從舊版 Supabase 版本遷移

如果有舊版 Supabase 上的資料要搬過來：

1. 從 Supabase Dashboard → SQL Editor 匯出：
   ```sql
   COPY (SELECT * FROM audit_runs) TO STDOUT WITH CSV HEADER;
   ```
2. 存成 `migration.csv`，傳到 Linux 主機
3. 匯入新 PG：
   ```bash
   docker compose exec -T db psql -U audit_user audit_db \
     -c "\copy audit_runs FROM '/tmp/migration.csv' CSV HEADER;"
   ```
