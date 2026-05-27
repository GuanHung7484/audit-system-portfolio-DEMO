// ════════════════════════════════════════════════════════════════
// PostgreSQL 連線池
// 使用分開的環境變數（避免密碼含特殊字元導致 URL 解析錯誤）
// ════════════════════════════════════════════════════════════════
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.PGHOST     || 'db',
  port:     Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'audit_db',
  user:     process.env.PGUSER     || process.env.POSTGRES_USER || 'audit_user',
  password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '',
  max: 20,                  // 最大同時連線
  idleTimeoutMillis: 30000, // 閒置 30 秒關閉
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB Pool Error]', err);
});

// 包裝 query 函式（自動 log 慢查詢）
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      console.warn(`[Slow Query] ${duration}ms: ${text.slice(0, 100)}`);
    }
    return res;
  } catch (err) {
    console.error('[Query Error]', err.message, 'SQL:', text.slice(0, 200));
    throw err;
  }
}

module.exports = { pool, query };
