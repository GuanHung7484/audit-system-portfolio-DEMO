// ════════════════════════════════════════════════════════════════
// /api/clients/* — 客戶 / 廠商管理
// ════════════════════════════════════════════════════════════════
const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/clients — 取得所有客戶（含預設 8 家 + 自訂）
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await query(
      `SELECT id, name, locked, sort_order, aliases, created_at, updated_at
       FROM clients
       ORDER BY sort_order ASC, created_at ASC`
    );
    res.json({ clients: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/clients — 新增客戶
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, aliases } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: '客戶名稱必填' });
    const r = await query(
      `INSERT INTO clients (name, locked, sort_order, aliases)
       VALUES ($1, FALSE, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM clients), $2)
       RETURNING id, name, locked, sort_order, aliases`,
      [name.trim(), aliases || []]
    );
    res.json({ client: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: '客戶名稱已存在' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/clients/:id — 修改客戶名稱 / 別名
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, aliases, sort_order } = req.body || {};
    const fields = [];
    const values = [];
    let i = 1;
    if (name !== undefined) { fields.push(`name = $${i++}`); values.push(name); }
    if (aliases !== undefined) { fields.push(`aliases = $${i++}`); values.push(aliases); }
    if (sort_order !== undefined) { fields.push(`sort_order = $${i++}`); values.push(sort_order); }
    if (fields.length === 0) return res.status(400).json({ error: '沒有要更新的欄位' });
    values.push(req.params.id);
    const r = await query(
      `UPDATE clients SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (r.rows.length === 0) return res.status(404).json({ error: '找不到客戶' });
    res.json({ client: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: '客戶名稱已存在' });
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/clients/:id — 刪除客戶（lock 客戶不可刪）
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const c = await query('SELECT locked FROM clients WHERE id = $1', [req.params.id]);
    if (c.rows.length === 0) return res.status(404).json({ error: '找不到客戶' });
    if (c.rows[0].locked) return res.status(403).json({ error: '預設客戶不能刪除' });
    await query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
