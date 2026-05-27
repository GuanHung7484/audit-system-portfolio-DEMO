// ════════════════════════════════════════════════════════════════
// /api/history/* — 歷史審核紀錄（audit_runs）CRUD
// ════════════════════════════════════════════════════════════════
const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// 將 DB 列轉成前端用格式（與舊版 Supabase 相容）
function dbRowToHistory(r) {
  const voucherList = r.voucher_list || [];
  const rows = r.rows || [];
  // 動態計算未匹配數
  const linked = new Set();
  rows.forEach(rw => { if (rw && rw.voucherName) linked.add(rw.voucherName); });
  const unmatched = Math.max(0, voucherList.length - linked.size);
  // 從 rows 推斷月份
  const sheets = new Set();
  rows.forEach(rw => { if (rw && rw.sheet) sheets.add(rw.sheet); });
  const auditMonth = r.audit_month || Array.from(sheets).join('、');
  return {
    id: Number(r.id),
    clientName: r.client_name || '',
    auditMonth: auditMonth,
    auditDate: r.audit_date || '',
    auditor: r.auditor || '',
    excelFile: r.excel_file || '',
    voucherCount: r.voucher_count || 0,
    voucherList,
    rows,
    results: {
      ok: r.result_ok || 0,
      err: r.result_err || 0,
      wait: r.result_wait || 0,
      unmatched,
    },
  };
}

// GET /api/history — 取得所有紀錄
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await query(
      `SELECT * FROM audit_runs ORDER BY id DESC LIMIT 500`
    );
    res.json({ history: r.rows.map(dbRowToHistory) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/history/:id — 取得單筆
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const r = await query('SELECT * FROM audit_runs WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: '找不到該筆紀錄' });
    res.json({ entry: dbRowToHistory(r.rows[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/history — 新增 / 更新（upsert）
// 接受單筆 entry 或 batch [{...}]
router.post('/', requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const entries = Array.isArray(body) ? body : [body];
    if (entries.length === 0) return res.json({ ok: true, count: 0 });

    let count = 0;
    for (const e of entries) {
      if (!e || !e.id) continue;
      await query(
        `INSERT INTO audit_runs (
            id, client_name, excel_file, audit_month, auditor, audit_date,
            voucher_count, result_ok, result_err, result_wait,
            voucher_list, rows, created_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET
            client_name   = EXCLUDED.client_name,
            excel_file    = EXCLUDED.excel_file,
            audit_month   = EXCLUDED.audit_month,
            auditor       = EXCLUDED.auditor,
            audit_date    = EXCLUDED.audit_date,
            voucher_count = EXCLUDED.voucher_count,
            result_ok     = EXCLUDED.result_ok,
            result_err    = EXCLUDED.result_err,
            result_wait   = EXCLUDED.result_wait,
            voucher_list  = EXCLUDED.voucher_list,
            rows          = EXCLUDED.rows,
            updated_at    = NOW()`,
        [
          Number(e.id),
          e.clientName || null,
          e.excelFile || '',
          e.auditMonth || '',
          e.auditor || '',
          e.auditDate || '',
          e.voucherCount || 0,
          (e.results && e.results.ok) || 0,
          (e.results && e.results.err) || 0,
          (e.results && e.results.wait) || 0,
          JSON.stringify(e.voucherList || []),
          JSON.stringify(e.rows || []),
          req.user.id,
        ]
      );
      count++;
    }
    res.json({ ok: true, count });
  } catch (e) {
    console.error('[history POST] error:', e);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/history/:id — 部分更新（例如：改 client_name、改 row status）
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const allowed = ['client_name', 'audit_month', 'auditor', 'audit_date',
                     'result_ok', 'result_err', 'result_wait', 'rows', 'voucher_list'];
    const fields = [], values = [];
    let i = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        fields.push(`${k} = $${i++}`);
        values.push(
          k === 'rows' || k === 'voucher_list'
            ? JSON.stringify(req.body[k])
            : req.body[k]
        );
      }
    }
    // 前端駝峰式
    if (req.body.clientName !== undefined) {
      fields.push(`client_name = $${i++}`); values.push(req.body.clientName);
    }
    if (req.body.auditMonth !== undefined) {
      fields.push(`audit_month = $${i++}`); values.push(req.body.auditMonth);
    }
    if (fields.length === 0) return res.status(400).json({ error: '沒有要更新的欄位' });
    values.push(req.params.id);
    const r = await query(
      `UPDATE audit_runs SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      values
    );
    if (r.rows.length === 0) return res.status(404).json({ error: '找不到紀錄' });
    res.json({ entry: dbRowToHistory(r.rows[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/history/:id — 刪除單筆
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM audit_runs WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/history — 全部刪除（管理員）
router.delete('/', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理員權限' });
    }
    await query('DELETE FROM audit_runs');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
