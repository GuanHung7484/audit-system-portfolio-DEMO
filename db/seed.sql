-- ════════════════════════════════════════════════════════════════
-- 初始資料：8 家預設客戶
-- 注意：管理員帳號由 Node.js 程式在啟動時建立（會 hash 密碼）
-- ════════════════════════════════════════════════════════════════

INSERT INTO clients (name, locked, sort_order, aliases) VALUES
  ('晨光早餐店', TRUE, 1, ARRAY['晨光早餐店', '晨光']),
  ('鼎旺火鍋',   TRUE, 2, ARRAY['鼎旺火鍋', '鼎旺']),
  ('悅風美髮',   TRUE, 3, ARRAY['悅風美髮', '悅風']),
  ('翠山書屋',   TRUE, 4, ARRAY['翠山書屋', '翠山']),
  ('陽光藥局',   TRUE, 5, ARRAY['陽光藥局', '陽光']),
  ('海風小吃',   TRUE, 6, ARRAY['海風小吃', '海風']),
  ('青木文具',   TRUE, 7, ARRAY['青木文具', '青木']),
  ('凱旋超市',   TRUE, 8, ARRAY['凱旋超市', '凱旋'])
ON CONFLICT (name) DO NOTHING;

-- 預設應用設定
INSERT INTO app_settings (key, value) VALUES
  ('initialized', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
