const crypto = require('crypto');

/**
 * Cryptographic helpers for the management dashboard.
 *
 * - AES-256-GCM for Slack tokens at rest (secrets.enc)
 * - SHA-256 for API-key fingerprints (keys are high-entropy, no slow hash needed)
 * - scrypt for the dashboard login password (low-entropy, needs a slow hash)
 * - HMAC-SHA256 for signed session cookies
 *
 * The master key never lives on disk — only in the DASHBOARD_MASTER_KEY env var —
 * so a leaked ./data volume alone yields no plaintext secrets.
 */

// Derive a fixed 32-byte AES key from an arbitrary-length passphrase.
function deriveKey(masterKey) {
  return crypto.createHash('sha256').update(String(masterKey), 'utf8').digest();
}

// Encrypt a UTF-8 string. Returns a self-describing base64 payload: iv|tag|ciphertext.
function encrypt(plaintext, masterKey) {
  if (!masterKey) throw new Error('Master key required to encrypt secrets');
  const key = deriveKey(masterKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

// Decrypt a payload produced by encrypt(). Throws on tamper / wrong key.
function decrypt(payload, masterKey) {
  if (!masterKey) throw new Error('Master key required to decrypt secrets');
  const key = deriveKey(masterKey);
  const raw = Buffer.from(String(payload), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// SHA-256 hex fingerprint (used for API-key storage/verification).
function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

// Generate a new dashboard API key. `spk_` = slack-proxy key.
function generateApiKey() {
  return 'spk_' + crypto.randomBytes(24).toString('hex');
}

// Constant-time string comparison that never throws on length mismatch.
function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// --- Password hashing (scrypt, built into Node — no native dep) ---

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  // Use ':' as the separator (not '$'): the hash goes into .env, and '$' triggers
  // shell/compose variable expansion, which corrupts the value. Salt/hash are hex.
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  // Accept both the current ':' format and the legacy '$' format.
  const parts = stored.split(/[:$]/);
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  let actual;
  try {
    actual = crypto.scryptSync(String(password), salt, expected.length);
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// --- Signed session tokens (HMAC-SHA256) ---

function signSession(payloadObj, secret) {
  const body = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', String(secret)).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySession(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', String(secret)).update(body).digest('base64url');
  if (!timingSafeEqualStr(sig, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

module.exports = {
  encrypt,
  decrypt,
  sha256,
  generateApiKey,
  timingSafeEqualStr,
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
};
