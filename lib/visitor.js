// lib/visitor.js — anonymous per-browser session id stored in an httpOnly cookie
import crypto from 'node:crypto';

const COOKIE = 'vid';

export function getVisitorId(req, res) {
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([A-Za-z0-9-]{16,})').exec(req.headers.cookie || '');
  if (m) return m[1];
  const id = crypto.randomUUID();
  const cookie = `${COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, cookie) : cookie);
  return id;
}

// 只存 SHA-256，不存完整 session id 或 IP
// Only a SHA-256 hash is stored, never the raw session id or IP.
export function hashVisitor(id) {
  return crypto.createHash('sha256').update(id).digest('hex');
}
