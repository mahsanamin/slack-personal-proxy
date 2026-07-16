const config = require('../config');
const { sha256, signSession, verifySession } = require('./secureCrypto');

const COOKIE = 'sp_session';

// Secret ties every session to this instance's master key + password hash, so rotating
// either invalidates all outstanding sessions. Never persisted.
function sessionSecret() {
  const d = config.dashboard || {};
  return sha256(`${d.masterKey || ''}|${d.passwordHash || ''}|sp-dashboard-session`);
}

function issue(user) {
  const ttlMin = (config.dashboard && config.dashboard.sessionTtlMin) || 120;
  return signSession({ u: user, exp: Date.now() + ttlMin * 60000 }, sessionSecret());
}

function read(token) {
  const s = verifySession(token, sessionSecret());
  if (!s || !s.exp || s.exp < Date.now()) return null;
  return s;
}

// Minimal single-cookie parser (avoids adding cookie-parser to a read-only image).
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

module.exports = { COOKIE, sessionSecret, issue, read, readCookie };
