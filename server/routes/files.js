// ════════════════════════════════════════════════════════════════
// /api/files/* — 檔案上傳 / 下載（憑證圖片 + Excel）
// 使用 Supabase Storage 儲存（不依賴本地磁碟）
// ════════════════════════════════════════════════════════════════
const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ─── Supabase 客戶端（Service Key，後端專用） ────────────────
// Node.js 20 需要明確指定 ws 作為 WebSocket transport
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { realtime: { transport: ws } }
);
const BUCKET = 'audit-files-DEMO';

// ─── 將檔名「淨化」成安全的路徑 ─────────────────────────────
function safeName(s) {
  return String(s || '').replace(/[\/\\:*?"<>|]/g, '_').slice(0, 250);
}

// ─── Multer 設定：使用 memory storage（之後交給 Supabase） ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
});

// ─── 憑證圖片：POST /api/files/voucher/:histId ──────────────
router.post('/voucher/:histId', requireAuth, upload.array('files', 100), async (req, res) => {
  try {
    const histId = req.params.histId;
    if (!histId) return res.status(400).json({ error: 'histId 必填' });
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '沒有上傳檔案' });
    }

    const results = [];
    for (const f of req.files) {
      const filename = safeName(f.originalname);
      const storagePath = `vouchers/${histId}/${filename}`;

      // 上傳到 Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, f.buffer, {
          contentType: f.mimetype,
          upsert: true,
        });
      if (uploadError) throw uploadError;

      // 寫入 DB
      await query(
        `INSERT INTO vouchers (audit_run_id, file_name, storage_path, mime_type, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [Number(histId), filename, storagePath, f.mimetype, f.size, req.user.id]
      );
      results.push({ name: filename, size: f.size });
    }
    res.json({ ok: true, files: results });
  } catch (e) {
    console.error('[voucher upload]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── 取得憑證：GET /api/files/voucher/:histId/:name ─────────
router.get('/voucher/:histId/:name', requireAuth, async (req, res) => {
  try {
    const histId = req.params.histId;
    const name = safeName(req.params.name);
    const storagePath = `vouchers/${histId}/${name}`;

    // 產生 1 小時效期的簽署 URL，回傳給前端直接下載
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);
    if (error || !data) return res.status(404).json({ error: '檔案不存在' });
    res.redirect(data.signedUrl);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 列出某次審核所有憑證 ──────────────────────────────────
router.get('/voucher/:histId', requireAuth, async (req, res) => {
  try {
    const histId = req.params.histId;
    const r = await query(
      `SELECT file_name, mime_type, file_size, uploaded_at FROM vouchers WHERE audit_run_id = $1`,
      [Number(histId)]
    );
    res.json({ files: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 刪除某次審核所有憑證 ──────────────────────────────────
router.delete('/voucher/:histId', requireAuth, async (req, res) => {
  try {
    const histId = req.params.histId;

    // 列出 Storage 中的檔案並全部刪除
    const { data: files } = await supabase.storage
      .from(BUCKET)
      .list(`vouchers/${histId}`);
    if (files && files.length > 0) {
      const paths = files.map(f => `vouchers/${histId}/${f.name}`);
      await supabase.storage.from(BUCKET).remove(paths);
    }

    // 刪除 DB 記錄
    await query('DELETE FROM vouchers WHERE audit_run_id = $1', [Number(histId)]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Excel 上傳：POST /api/files/excel/:clientId ────────────
router.post('/excel/:clientId', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const clientId = req.params.clientId;
    if (!req.file) return res.status(400).json({ error: '沒有上傳檔案' });
    const filename = safeName(req.file.originalname);
    const storagePath = `excel/${clientId}/${filename}`;

    // 上傳到 Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype ||
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });
    if (uploadError) throw uploadError;

    // 寫入 DB
    await query(
      `INSERT INTO excel_files (client_id, file_name, storage_path, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [clientId, filename, storagePath, req.file.size, req.user.id]
    );
    res.json({ ok: true, name: filename, size: req.file.size });
  } catch (e) {
    console.error('[excel upload]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── 取得 Excel：GET /api/files/excel/:clientId/:name ───────
router.get('/excel/:clientId/:name', requireAuth, async (req, res) => {
  try {
    const storagePath = `excel/${req.params.clientId}/${safeName(req.params.name)}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);
    if (error || !data) return res.status(404).json({ error: '檔案不存在' });
    res.redirect(data.signedUrl);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
