const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const config = require('../config');
const logger = require('../utils/logger');
const {
  encrypt,
  decrypt,
  sha256,
  generateApiKey,
  timingSafeEqualStr,
} = require('../utils/secureCrypto');

/**
 * Single source of truth for the dashboard's mutable state, persisted to the one
 * writable mount (./data). Three concerns:
 *
 *   - apikeys.json     : API keys as SHA-256 fingerprints + metadata (never the secret)
 *   - secrets.enc      : Slack credentials, AES-256-GCM encrypted with DASHBOARD_MASTER_KEY
 *   - dm-allowlist.json: extra users allowed to receive DMs, on top of the .env seed
 *
 * Emits 'slackCredsChanged' and 'dmAllowlistChanged' so the server can hot-reload the
 * Slack client and whitelist service without a restart.
 *
 * The constructor performs NO filesystem or config access, so requiring this module is
 * always safe (including under mocked config in tests). Call init() at server boot.
 */
class ConfigStore extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.dataDir = null;
    this.masterKey = '';
    this._keys = [];            // in-memory API key records (source of truth after init)
    this._dmUsers = [];         // in-memory DM-allowlist records
    this._flushTimer = null;
  }

  async init() {
    this.dataDir = path.resolve(process.cwd(), config.dataDir || 'data');
    this.masterKey = (config.dashboard && config.dashboard.masterKey) || '';

    await fs.promises.mkdir(this.dataDir, { recursive: true });

    this._keys = this._readJson(this._path('apikeys.json'), []);
    // Purge any legacy soft-revoked keys — revoke is now a hard delete, so a revoked
    // record should not linger in the list.
    const active = this._keys.filter((k) => !k.revokedAt);
    if (active.length !== this._keys.length) {
      this._keys = active;
      this._writeJson(this._path('apikeys.json'), this._keys);
    }
    this._dmUsers = this._readJson(this._path('dm-allowlist.json'), []);
    this.initialized = true;

    logger.info(
      `ConfigStore ready (dir=${this.dataDir}, keys=${this._keys.length}, ` +
      `dmUsers=${this._dmUsers.length}, secrets=${this.hasStoredSlackCreds() ? 'present' : 'none'}, ` +
      `masterKey=${this.masterKey ? 'set' : 'MISSING'})`
    );
  }

  _path(name) {
    return path.join(this.dataDir, name);
  }

  _readJson(file, fallback) {
    try {
      if (!fs.existsSync(file)) return fallback;
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      logger.warn(`ConfigStore: could not read ${file}: ${err.message}`);
      return fallback;
    }
  }

  _writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  }

  // ---------------------------------------------------------------------------
  // API keys
  // ---------------------------------------------------------------------------

  /**
   * Synchronous key verification for the auth middleware.
   * Checks the legacy .env key first, then active store fingerprints.
   * Returns a descriptor on match, or null. Never throws.
   */
  verifyApiKey(providedKey) {
    if (!providedKey) return null;

    // Legacy single key from .env (backward compatibility)
    if (config.apiKey && timingSafeEqualStr(providedKey, config.apiKey)) {
      return { id: 'legacy-env', label: 'Legacy .env key', legacy: true };
    }

    const fingerprint = sha256(providedKey);
    for (const rec of this._keys) {
      if (rec.revokedAt) continue;
      if (timingSafeEqualStr(rec.hash, fingerprint)) {
        rec.lastUsedAt = new Date().toISOString();
        this._scheduleFlush();
        return rec;
      }
    }
    return null;
  }

  // Debounced persistence of lastUsedAt updates (avoids a disk write per request).
  _scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      try {
        this._writeJson(this._path('apikeys.json'), this._keys);
      } catch (err) {
        logger.warn(`ConfigStore: key flush failed: ${err.message}`);
      }
    }, 5000);
    if (this._flushTimer.unref) this._flushTimer.unref();
  }

  listKeys() {
    // Metadata only — never the secret.
    return this._keys.map((k) => ({
      id: k.id,
      label: k.label,
      prefix: k.prefix,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt || null,
      revokedAt: k.revokedAt || null,
    }));
  }

  /** Creates a key, persists only its fingerprint, and returns the secret ONCE. */
  createKey(label) {
    const secret = generateApiKey();
    const rec = {
      id: crypto.randomUUID(),
      label: (label || 'unnamed').toString().slice(0, 80),
      prefix: secret.slice(0, 12) + '…',
      hash: sha256(secret),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    this._keys.push(rec);
    this._writeJson(this._path('apikeys.json'), this._keys);
    logger.info(`API key created: ${rec.label} (${rec.prefix})`);
    return { key: secret, meta: this.listKeys().find((k) => k.id === rec.id) };
  }

  /** Hard-delete a key: it is removed from the list entirely and stops working. */
  revokeKey(id) {
    const idx = this._keys.findIndex((k) => k.id === id);
    if (idx === -1) return false;
    const [rec] = this._keys.splice(idx, 1);
    this._writeJson(this._path('apikeys.json'), this._keys);
    logger.info(`API key deleted: ${rec.label} (${rec.prefix})`);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Slack credentials (encrypted at rest)
  // ---------------------------------------------------------------------------

  hasMasterKey() {
    return Boolean(this.masterKey);
  }

  hasStoredSlackCreds() {
    return fs.existsSync(this._path('secrets.enc'));
  }

  /** Returns decrypted { cookie, token, botToken } or null. Throws on master-key mismatch. */
  getSlackCreds() {
    if (!this.hasStoredSlackCreds()) return null;
    if (!this.masterKey) throw new Error('DASHBOARD_MASTER_KEY not set — cannot decrypt stored Slack credentials');
    const payload = fs.readFileSync(this._path('secrets.enc'), 'utf8');
    return JSON.parse(decrypt(payload, this.masterKey));
  }

  /** Encrypts and persists Slack credentials, then signals a hot-reload. */
  setSlackCreds({ cookie = '', token = '', botToken = '' } = {}) {
    if (!this.masterKey) {
      throw new Error('DASHBOARD_MASTER_KEY not set — refusing to store Slack credentials in plaintext');
    }
    const payload = encrypt(JSON.stringify({ cookie, token, botToken }), this.masterKey);
    fs.writeFileSync(this._path('secrets.enc'), payload, { mode: 0o600 });
    logger.info('Slack credentials updated (encrypted at rest)');
    this.emit('slackCredsChanged');
  }

  // ---------------------------------------------------------------------------
  // DM allowlist
  // ---------------------------------------------------------------------------

  listDmUsers() {
    return this._dmUsers.map((u) => ({ ...u }));
  }

  /** Adds a DM-allowed user record { entry, userId, name } and signals a reload. */
  addDmUser({ entry, userId = null, name = null }) {
    if (!entry) throw new Error('entry is required');
    if (this._dmUsers.some((u) => u.entry === entry || (userId && u.userId === userId))) {
      return this._dmUsers.find((u) => u.entry === entry || (userId && u.userId === userId));
    }
    const rec = { id: crypto.randomUUID(), entry, userId, name, addedAt: new Date().toISOString() };
    this._dmUsers.push(rec);
    this._writeJson(this._path('dm-allowlist.json'), this._dmUsers);
    logger.info(`DM allowlist: added ${name || entry}`);
    this.emit('dmAllowlistChanged');
    return rec;
  }

  removeDmUser(id) {
    const idx = this._dmUsers.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    const [rec] = this._dmUsers.splice(idx, 1);
    this._writeJson(this._path('dm-allowlist.json'), this._dmUsers);
    logger.info(`DM allowlist: removed ${rec.name || rec.entry}`);
    this.emit('dmAllowlistChanged');
    return true;
  }

  /** Entries to feed the whitelist service: .env seed merged with store additions. */
  dmAllowlistEntries() {
    const seed = (config.whitelist && config.whitelist.dmUsers) || [];
    const stored = this._dmUsers.map((u) => u.userId || u.entry).filter(Boolean);
    return Array.from(new Set([...seed, ...stored]));
  }
}

// Singleton — required by both the auth middleware and the dashboard controllers.
module.exports = new ConfigStore();
