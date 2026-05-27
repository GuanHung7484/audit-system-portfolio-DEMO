// ════════════════════════════════════════════════════════════════
// 查帳憑證核對系統 — Express + PostgreSQL 後端
// ════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const { pool, query } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const FILE_STORAGE = process.env.FILE_STORAGE_PATH || '/app/files';

// ─── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// 簡單請求 log
app.use((req, res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.url}`);
  next();
});

// 健康檢查
app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, db: 'connected', time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'disconnected', error: e.message });
  }
});

// ─── 載入路由 ────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/clients',  require('./routes/clients'));
app.use('/api/history',  require('./routes/history'));
app.use('/api/files',    require('./routes/files'));
app.use('/api/settings', require('./routes/settings'));

// ─── 靜態資源：前端 HTML/JS/CSS ─────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// /app → app.html（與原系統相容）
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// 預設首頁
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.url });
});

// 全域錯誤處理
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// ─── 啟動：建立檔案目錄 + 預設 admin + 啟動 server ───────────
async function startup() {
  // 建立檔案儲存目錄
  await fs.mkdir(path.join(FILE_STORAGE, 'vouchers'), { recursive: true });
  await fs.mkdir(path.join(FILE_STORAGE, 'excel'), { recursive: true });
  console.log(`[Startup] 檔案儲存：${FILE_STORAGE}`);

  // 等資料庫就緒
  let retries = 30;
  while (retries > 0) {
    try {
      await query('SELECT 1');
      console.log('[Startup] PostgreSQL 連線成功');
      break;
    } catch (e) {
      retries--;
      if (retries === 0) {
        console.error('[Startup] 無法連線資料庫:', e.message);
        process.exit(1);
      }
      console.log(`[Startup] 等待資料庫... (剩 ${retries} 次)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 建立預設 admin 帳號（如不存在）
  try {
    const result = await query("SELECT id FROM users WHERE username = 'admin'");
    if (result.rows.length === 0) {
      const initialPwd = process.env.ADMIN_INITIAL_PASSWORD || 'admin123';
      const hash = await bcrypt.hash(initialPwd, 10);
      await query(
        `INSERT INTO users (username, display_name, password_hash, role)
         VALUES ('admin', '系統管理員', $1, 'admin')`,
        [hash]
      );
      console.log('[Startup] 已建立預設管理員帳號');
      console.log(`[Startup] 帳號: admin`);
      console.log(`[Startup] 密碼: ${initialPwd}`);
      console.log('[Startup] ⚠️ 登入後請立即修改密碼！');
    }
  } catch (e) {
    console.error('[Startup] 建立 admin 失敗:', e.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════════');
    console.log(`  查帳憑證核對系統 啟動成功`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  http://<your-server-ip>:${PORT}/app`);
    console.log('═══════════════════════════════════════════════');
  });
}

startup().catch(e => {
  console.error('[FATAL] Startup failed:', e);
  process.exit(1);
});

// 優雅關閉
process.on('SIGTERM', async () => {
  console.log('[Shutdown] SIGTERM 收到，關閉中...');
  await pool.end();
  process.exit(0);
});
