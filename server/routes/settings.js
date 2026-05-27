// ════════════════════════════════════════════════════════════════
// /api/settings/* — 應用設定（key-value 通用 storage）
// ════════════════════════════════════════════════════════════════
const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/settings — 取得所有設定
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await query('SELECT key, value FROM app_settings');
    const obj = {};
    r.rows.forEach(row => { obj[row.key] = row.value; });
    res.json({ settings: obj });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/settings/:key — 取得單一設定
router.get('/:key', requireAuth, async (req, res) => {
  try {
    const r = await query('SELECT value FROM app_settings WHERE key = $1', [req.params.key]);
    if (r.rows.length === 0) return res.status(404).json({ error: '找不到設定' });
    res.json({ key: req.params.key, value: r.rows[0].value });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/settings/:key — 新增或更新設定
router.put('/:key', requireAuth, async (req, res) => {
  try {
    const value = req.body && req.body.value !== undefined ? req.body.value : req.body;
    await query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [req.params.key, JSON.stringify(value)]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/settings/:key — 刪除設定
router.delete('/:key', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM app_settings WHERE key = $1', [req.params.key]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
