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
 *   - dm-approvals.enc : encrypted pending messages, decisions, and temporary grants
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
    this._dmApprovalState = { requests: [], grants: [] };
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
    this._dmApprovalState = this._readApprovalState();
    this._purgeDmApprovalState();
    this.initialized = true;

    logger.info(
      `ConfigStore ready (dir=${this.dataDir}, keys=${this._keys.length}, ` +
      `dmUsers=${this._dmUsers.length}, pendingApprovals=${this.listDmApprovals().length}, ` +
      `secrets=${this.hasStoredSlackCreds() ? 'present' : 'none'}, ` +
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

  _readApprovalState() {
    const file = this._path('dm-approvals.enc');
    if (!fs.existsSync(file)) return { requests: [], grants: [] };
    if (!this.masterKey) {
      logger.warn('ConfigStore: DASHBOARD_MASTER_KEY missing; encrypted DM approvals cannot be loaded');
      return { requests: [], grants: [] };
    }
    try {
      const parsed = JSON.parse(decrypt(fs.readFileSync(file, 'utf8'), this.masterKey));
      return {
        requests: Array.isArray(parsed.requests) ? parsed.requests : [],
        grants: Array.isArray(parsed.grants) ? parsed.grants : [],
      };
    } catch (err) {
      logger.warn(`ConfigStore: could not read encrypted DM approvals: ${err.message}`);
      return { requests: [], grants: [] };
    }
  }

  _writeApprovalState() {
    if (!this.masterKey) throw new Error('DASHBOARD_MASTER_KEY is required for DM approvals');
    const payload = encrypt(JSON.stringify(this._dmApprovalState), this.masterKey);
    fs.writeFileSync(this._path('dm-approvals.enc'), payload, { mode: 0o600 });
  }

  _purgeDmApprovalState() {
    const now = Date.now();
    let changed = false;
    for (const request of this._dmApprovalState.requests) {
      if (request.status === 'pending' && Date.parse(request.expiresAt) <= now) {
        request.status = 'expired';
        request.resolvedAt = new Date(now).toISOString();
        changed = true;
      } else if (request.status === 'pending' && !this.isApiKeyIdActive(request.apiKeyId)) {
        request.status = 'cancelled';
        request.decision = 'api_key_revoked';
        request.resolvedAt = new Date(now).toISOString();
        changed = true;
      }
    }
    const grants = this._dmApprovalState.grants.filter((g) => Date.parse(g.expiresAt) > now && this.isApiKeyIdActive(g.apiKeyId));
    if (grants.length !== this._dmApprovalState.grants.length) {
      this._dmApprovalState.grants = grants;
      changed = true;
    }
    // Keep a small audit trail without allowing the encrypted file to grow forever.
    if (this._dmApprovalState.requests.length > 300) {
      const pending = this._dmApprovalState.requests.filter((r) => r.status === 'pending');
      const resolved = this._dmApprovalState.requests.filter((r) => r.status !== 'pending').slice(-200);
      this._dmApprovalState.requests = [...pending, ...resolved];
      changed = true;
    }
    if (changed && this.masterKey) this._writeApprovalState();
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
    const beforeGrants = this._dmApprovalState.grants.length;
    const now = new Date().toISOString();
    let requestsChanged = false;
    for (const request of this._dmApprovalState.requests) {
      if (request.apiKeyId === id && request.status === 'pending') {
        request.status = 'cancelled';
        request.decision = 'api_key_revoked';
        request.resolvedAt = now;
        requestsChanged = true;
      }
    }
    this._dmApprovalState.grants = this._dmApprovalState.grants.filter((g) => g.apiKeyId !== id);
    if (this.masterKey && (requestsChanged || beforeGrants !== this._dmApprovalState.grants.length)) {
      this._writeApprovalState();
    }
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

  // ---------------------------------------------------------------------------
  // Owner-approved DMs (encrypted at rest)
  // ---------------------------------------------------------------------------

  isApiKeyIdActive(id) {
    if (id === 'legacy-env') return Boolean(config.apiKey);
    return this._keys.some((k) => k.id === id && !k.revokedAt);
  }

  createDmApproval({ target, userId, name, text, threadTs = null, apiKeyId, apiKeyLabel }) {
    if (!this.masterKey) throw new Error('DASHBOARD_MASTER_KEY is required for DM approvals');
    this._purgeDmApprovalState();
    const settings = config.dmApprovals || {};
    const maxPending = settings.maxPending || 100;
    const keyPending = this._dmApprovalState.requests.filter((r) => r.status === 'pending' && r.apiKeyId === apiKeyId);
    if (keyPending.length >= maxPending) throw new Error(`Too many pending approval requests (maximum ${maxPending})`);
    const now = Date.now();
    const rec = {
      id: crypto.randomUUID(),
      status: 'pending',
      target,
      userId,
      name: name || target,
      text,
      threadTs,
      apiKeyId,
      apiKeyLabel: apiKeyLabel || 'unknown',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + (settings.requestTtlMin || 60) * 60000).toISOString(),
    };
    this._dmApprovalState.requests.push(rec);
    this._writeApprovalState();
    logger.info(`DM approval requested for ${rec.name} by key ${rec.apiKeyLabel} (${rec.id})`);
    return { ...rec };
  }

  listDmApprovals({ includeResolved = true, apiKeyId = null } = {}) {
    this._purgeDmApprovalState();
    return this._dmApprovalState.requests
      .filter((r) => (includeResolved || r.status === 'pending') && (!apiKeyId || r.apiKeyId === apiKeyId))
      .map((r) => ({ ...r }))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  getDmApproval(id) {
    this._purgeDmApprovalState();
    const rec = this._dmApprovalState.requests.find((r) => r.id === id);
    return rec ? { ...rec } : null;
  }

  claimDmApproval(id) {
    this._purgeDmApprovalState();
    const rec = this._dmApprovalState.requests.find((r) => r.id === id);
    if (!rec || rec.status !== 'pending' || !this.isApiKeyIdActive(rec.apiKeyId)) return null;
    rec.status = 'processing';
    this._writeApprovalState();
    return { ...rec };
  }

  releaseDmApproval(id) {
    const rec = this._dmApprovalState.requests.find((r) => r.id === id);
    if (!rec || rec.status !== 'processing') return false;
    rec.status = 'pending';
    this._writeApprovalState();
    return true;
  }

  completeDmApproval(id, decision, result = {}) {
    const rec = this._dmApprovalState.requests.find((r) => r.id === id);
    if (!rec || !['pending', 'processing'].includes(rec.status)) return null;
    rec.status = decision === 'reject' ? 'rejected' : 'approved';
    rec.decision = decision;
    rec.resolvedAt = new Date().toISOString();
    if (result.channel) rec.channel = result.channel;
    if (result.ts) rec.ts = result.ts;
    this._writeApprovalState();
    return { ...rec };
  }

  addTemporaryDmGrant({ apiKeyId, apiKeyLabel, userId, name, minutes = null }) {
    const settings = config.dmApprovals || {};
    const duration = Math.max(1, Math.min(Number(minutes) || settings.temporaryGrantMin || 15, 1440));
    this._dmApprovalState.grants = this._dmApprovalState.grants.filter((g) => !(g.apiKeyId === apiKeyId && g.userId === userId));
    const grant = {
      id: crypto.randomUUID(), apiKeyId, apiKeyLabel, userId, name,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + duration * 60000).toISOString(),
    };
    this._dmApprovalState.grants.push(grant);
    this._writeApprovalState();
    return { ...grant };
  }

  hasTemporaryDmGrant(apiKeyId, userId) {
    if (!apiKeyId || !userId) return false;
    this._purgeDmApprovalState();
    return this._dmApprovalState.grants.some((g) => g.apiKeyId === apiKeyId && g.userId === userId);
  }

  listTemporaryDmGrants() {
    this._purgeDmApprovalState();
    return this._dmApprovalState.grants.map((g) => ({ ...g }));
  }
}

// Singleton — required by both the auth middleware and the dashboard controllers.
module.exports = new ConfigStore();
