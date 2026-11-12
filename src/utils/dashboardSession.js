const config = require('../config');
const { sha256, signSession, verifySession } = require('./secureCrypto');

const COOKIE = 'sp_session';

// Secret ties every session to this instance's master key + password hash, so rotating
// either invalidates all outstanding sessions. Never persisted.
function sessionSecret() {
  const d = config.dashboard || {};
  return sha256(`${d.masterKey || ''}|${d.passwordHash || ''}|sp-dashboard-session`);
}

// Normal sessions expire after sessionTtlMin. A "remember this machine" session lasts
// rememberDays, and every request made with it renews it (see dashboardAuth), so it only
// ends after that many days without use.
function sessionMaxAgeMs(remember) {
  const d = config.dashboard || {};
  if (remember) return (d.rememberDays || 30) * 24 * 60 * 60000;
  return (d.sessionTtlMin || 120) * 60000;
}

// A remembered session can never outlive this many days after the original sign-in,
// however often it is renewed. Renewal keeps active use signed in; this cap limits how
// long a copied cookie stays usable.
function absoluteMaxAgeMs(remember) {
  return sessionMaxAgeMs(remember);
}

// iat is the time of the original sign-in. Renewals pass it through unchanged.
function issue(user, { remember = false, iat = null } = {}) {
  const now = Date.now();
  const start = iat || now;
  const exp = Math.min(now + sessionMaxAgeMs(remember), start + absoluteMaxAgeMs(remember));
  return signSession({ u: user, r: Boolean(remember), iat: start, exp }, sessionSecret());
}

// Renew only when at least half the lifetime has passed, so fewer valid tokens circulate.
function needsRenewal(session) {
  const remaining = session.exp - Date.now();
  return remaining < sessionMaxAgeMs(session.r) / 2;
}

function cookieOptions(remember = false) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: Boolean(config.enableHttps),
    maxAge: sessionMaxAgeMs(remember),
    path: '/dashboard',
  };
}

function read(token) {
  const s = verifySession(token, sessionSecret());
  if (!s || !s.exp || s.exp < Date.now()) return null;
  if (s.r && (!s.iat || Date.now() - s.iat > absoluteMaxAgeMs(true))) return null;
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

module.exports = { COOKIE, sessionSecret, issue, read, readCookie, cookieOptions, needsRenewal };
