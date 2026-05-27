// ════════════════════════════════════════════════════════════════
// /api/files/* — 檔案上傳 / 下載（憑證圖片 + Excel）
// ════════════════════════════════════════════════════════════════
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const FILE_STORAGE = process.env.FILE_STORAGE_PATH || '/app/files';

// ─── 將檔名「淨化」成安全的路徑 ─────────────────────────────
function safeName(s) {
  return String(s || '').replace(/[\/\\:*?"<>|]/g, '_').slice(0, 250);
}

// ─── Multer 設定：使用 memory storage（之後手動寫入磁碟） ─
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
    // 建立資料夾
    const dir = path.join(FILE_STORAGE, 'vouchers', histId);
    await fs.mkdir(dir, { recursive: true });

    const results = [];
    for (const f of req.files) {
      const filename = safeName(f.originalname);
      const fullPath = path.join(dir, filename);
      await fs.writeFile(fullPath, f.buffer);
      // 寫入 DB
      await query(
        `INSERT INTO vouchers (audit_run_id, file_name, storage_path, mime_type, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [Number(histId), filename, `vouchers/${histId}/${filename}`, f.mimetype, f.size, req.user.id]
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
    const fullPath = path.join(FILE_STORAGE, 'vouchers', histId, name);
    if (!fsSync.existsSync(fullPath)) {
      return res.status(404).json({ error: '檔案不存在' });
    }
    res.sendFile(fullPath);
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
    const dir = path.join(FILE_STORAGE, 'vouchers', histId);
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (e) { /* ignore */ }
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
    const dir = path.join(FILE_STORAGE, 'excel', clientId);
    await fs.mkdir(dir, { recursive: true });
    const filename = safeName(req.file.originalname);
    const fullPath = path.join(dir, filename);
    await fs.writeFile(fullPath, req.file.buffer);
    // 寫入 DB
    await query(
      `INSERT INTO excel_files (client_id, file_name, storage_path, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [clientId, filename, `excel/${clientId}/${filename}`, req.file.size, req.user.id]
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
    const fullPath = path.join(FILE_STORAGE, 'excel', req.params.clientId, safeName(req.params.name));
    if (!fsSync.existsSync(fullPath)) {
      return res.status(404).json({ error: '檔案不存在' });
    }
    res.sendFile(fullPath);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
