-- ════════════════════════════════════════════════════════════════
-- 查帳憑證核對系統 — PostgreSQL Schema
-- ════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. 使用者表（查帳人員） ──────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'auditor', -- 'admin' | 'auditor'
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. 客戶 / 廠商分頁 ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  locked BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  aliases TEXT[] DEFAULT '{}', -- 別名陣列，如 ['晨光', '早餐店']
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. Excel 檔案 ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS excel_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT,
  file_name TEXT NOT NULL,
  storage_path TEXT,
  file_size BIGINT,
  parsed_data JSONB,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4. 憑證圖片 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_run_id BIGINT, -- 對應 audit_runs.id
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  status TEXT, -- '正確' / '不正確' / '待確認' / ''
  remark TEXT,
  meta_data JSONB,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vouchers_audit_run ON vouchers(audit_run_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_client ON vouchers(client_id);

-- ─── 5. 歷史審核紀錄（核心表） ────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_runs (
  id BIGINT PRIMARY KEY,  -- 用 Date.now() 時間戳作為 ID
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,
  excel_file TEXT,
  audit_month TEXT, -- 例：'4月', '5月笠'
  auditor TEXT,
  audit_date TEXT,
  voucher_count INT DEFAULT 0,
  result_ok INT DEFAULT 0,
  result_err INT DEFAULT 0,
  result_wait INT DEFAULT 0,
  voucher_list JSONB DEFAULT '[]',
  rows JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_runs_client ON audit_runs(client_name);
CREATE INDEX IF NOT EXISTS idx_audit_runs_created ON audit_runs(created_at DESC);

-- ─── 6. 應用設定（key-value） ────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 7. 自動更新 updated_at 的 trigger ───────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS clients_updated_at ON clients;
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS audit_runs_updated_at ON audit_runs;
CREATE TRIGGER audit_runs_updated_at BEFORE UPDATE ON audit_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
