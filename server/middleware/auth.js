// ════════════════════════════════════════════════════════════════
// JWT 認證 middleware
// ════════════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-please-change';

// 驗證 token 並把使用者資料放到 req.user
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: '未登入' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token 無效或過期' });
  }
}

// 僅 admin 可用
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理員權限' });
  }
  next();
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, displayName: user.display_name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { requireAuth, requireAdmin, signToken, JWT_SECRET };
