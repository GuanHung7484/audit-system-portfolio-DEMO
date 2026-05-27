// ════════════════════════════════════════════════════════════════
// /api/auth/* — 登入、登出、修改密碼、使用者管理
// ════════════════════════════════════════════════════════════════
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { requireAuth, requireAdmin, signToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: '請輸入帳號與密碼' });
    }
    const result = await query(
      'SELECT id, username, display_name, password_hash, role, active FROM users WHERE username = $1',
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }
    const user = result.rows[0];
    if (!user.active) {
      return res.status(403).json({ error: '帳號已停用' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }
    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    });
  } catch (e) {
    console.error('[login] error:', e);
    res.status(500).json({ error: '登入失敗' });
  }
});

// GET /api/auth/me — 取得當前使用者資訊
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/change-password — 修改自己的密碼
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '新密碼至少 6 字元' });
    }
    const r = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: '使用者不存在' });
    const ok = await bcrypt.compare(oldPassword || '', r.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: '舊密碼錯誤' });
    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[change-password] error:', e);
    res.status(500).json({ error: '修改失敗' });
  }
});

// ─── 以下為 admin 才能用的 user 管理 API ────────────────────

// GET /api/auth/users — 取得所有使用者
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  const r = await query(
    'SELECT id, username, display_name, role, active, created_at FROM users ORDER BY created_at DESC'
  );
  res.json({ users: r.rows });
});

// POST /api/auth/users — 新增使用者
router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, displayName, password, role = 'auditor' } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: '帳號和密碼必填' });
    }
    const hash = await bcrypt.hash(password, 10);
    const r = await query(
      `INSERT INTO users (username, display_name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, display_name, role, active`,
      [username, displayName || username, hash, role]
    );
    res.json({ user: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: '帳號已存在' });
    }
    console.error('[create user] error:', e);
    res.status(500).json({ error: '建立失敗' });
  }
});

// DELETE /api/auth/users/:id — 停用使用者
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await query('UPDATE users SET active = FALSE WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
