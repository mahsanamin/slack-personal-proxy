const config = require('../config');
const configStore = require('../services/configStore');
const logger = require('../utils/logger');
const { formatSuccessResponse, formatErrorResponse, maskToken } = require('../utils/helpers');
const { verifyPassword, timingSafeEqualStr } = require('../utils/secureCrypto');
const { compactMention, compactThread } = require('../utils/compactThread');
const { COOKIE, issue } = require('../utils/dashboardSession');

const ERR = {
  BAD_LOGIN: { code: 'BAD_LOGIN', status: 401, message: 'Invalid username or password.' },
  DASHBOARD_NOT_CONFIGURED: { code: 'DASHBOARD_NOT_CONFIGURED', status: 503, message: 'Dashboard login is not configured. Set DASHBOARD_USER and DASHBOARD_PASSWORD_HASH.' },
  NO_MASTER_KEY: { code: 'NO_MASTER_KEY', status: 400, message: 'DASHBOARD_MASTER_KEY is not set — cannot store Slack tokens securely.' },
  SLACK_TEST_FAILED: { code: 'SLACK_TEST_FAILED', status: 400, message: 'Slack credentials failed auth.test.' },
  BAD_REQUEST: { code: 'BAD_REQUEST', status: 400, message: 'Invalid request.' },
  NOT_FOUND: { code: 'NOT_FOUND', status: 404, message: 'Not found.' },
};

function dashboardConfigured() {
  const d = config.dashboard || {};
  return Boolean(d.enabled && d.user && d.passwordHash);
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: Boolean(config.enableHttps),
    maxAge: ((config.dashboard && config.dashboard.sessionTtlMin) || 120) * 60000,
    path: '/dashboard',
  };
}

// --- Auth ---

function login(req, res) {
  if (!dashboardConfigured()) {
    return res.status(ERR.DASHBOARD_NOT_CONFIGURED.status).json(formatErrorResponse(ERR.DASHBOARD_NOT_CONFIGURED));
  }
  const { user, password } = req.body || {};
  const userOk = timingSafeEqualStr(user || '', config.dashboard.user);
  const passOk = verifyPassword(password || '', config.dashboard.passwordHash);
  if (!userOk || !passOk) {
    logger.warn(`Dashboard login failed for user "${user}"`);
    return res.status(ERR.BAD_LOGIN.status).json(formatErrorResponse(ERR.BAD_LOGIN));
  }
  res.cookie(COOKIE, issue(config.dashboard.user), cookieOptions());
  res.json(formatSuccessResponse({ user: config.dashboard.user }));
}

function logout(req, res) {
  res.clearCookie(COOKIE, { path: '/dashboard' });
  res.json(formatSuccessResponse({ loggedOut: true }));
}

// Public: lets the SPA decide whether to render login vs a "configure me" notice.
function bootstrap(req, res) {
  res.json(formatSuccessResponse({
    dashboardConfigured: dashboardConfigured(),
    enabled: Boolean(config.dashboard && config.dashboard.enabled),
  }));
}

// --- Status / security panel (auth) ---

async function status(req, res, next) {
  try {
    const { slackClient } = req.services;
    let slackAuth = 'unknown';
    let team = null;
    let currentUser = null;
    try {
      const t = await slackClient.authTest();
      slackAuth = 'valid';
      team = t.team;
      currentUser = t.user;
    } catch {
      slackAuth = 'error';
    }

    const usingStoredCreds = configStore.hasStoredSlackCreds();
    const bindAddress = process.env.BIND_ADDRESS || '127.0.0.1';
    const exposedOnNetwork = bindAddress === '0.0.0.0' || config.allowedIps.includes('0.0.0.0');

    res.json(formatSuccessResponse({
      firstRun: slackAuth !== 'valid' && !usingStoredCreds && !config.slack.token && !config.slack.botToken,
      slack: { auth: slackAuth, team, currentUser, credsSource: usingStoredCreds ? 'encrypted-store' : 'env' },
      security: {
        bindAddress,
        exposedOnNetwork,
        httpsEnabled: Boolean(config.enableHttps),
        swaggerEnabled: Boolean(config.enableSwagger),
        allowedIps: config.allowedIps,
        masterKeySet: configStore.hasMasterKey(),
        apiKeys: { total: configStore.listKeys().length, active: configStore.listKeys().filter(k => !k.revokedAt).length },
        dmAllowlistCount: configStore.dmAllowlistEntries().length,
      },
    }));
  } catch (err) {
    next(err);
  }
}

// --- Setup wizard ---

async function testSlack(req, res, next) {
  try {
    const { slackClient } = req.services;
    const { cookie, token, botToken } = req.body || {};
    const result = await slackClient.testCredentials({ cookie, token, botToken });
    res.json(formatSuccessResponse({ ok: true, team: result.team, user: result.user }));
  } catch (err) {
    return res.status(ERR.SLACK_TEST_FAILED.status).json(
      formatErrorResponse(ERR.SLACK_TEST_FAILED, { reason: err.data?.error || err.message })
    );
  }
}

async function saveSlack(req, res, next) {
  try {
    if (!configStore.hasMasterKey()) {
      return res.status(ERR.NO_MASTER_KEY.status).json(formatErrorResponse(ERR.NO_MASTER_KEY));
    }
    const { slackClient } = req.services;
    const { cookie = '', token = '', botToken = '' } = req.body || {};

    // Test before persisting — only good creds get stored.
    let result;
    try {
      result = await slackClient.testCredentials({ cookie, token, botToken });
    } catch (err) {
      return res.status(ERR.SLACK_TEST_FAILED.status).json(
        formatErrorResponse(ERR.SLACK_TEST_FAILED, { reason: err.data?.error || err.message })
      );
    }

    configStore.setSlackCreds({ cookie, token, botToken }); // emits slackCredsChanged → hot reload
    res.json(formatSuccessResponse({
      saved: true,
      team: result.team,
      user: result.user,
      token: token ? maskToken(token) : (botToken ? maskToken(botToken) : null),
    }));
  } catch (err) {
    next(err);
  }
}

// --- API keys ---

function listKeys(req, res) {
  res.json(formatSuccessResponse({ keys: configStore.listKeys() }));
}

function createKey(req, res) {
  const label = (req.body && req.body.label) || 'unnamed';
  const { key, meta } = configStore.createKey(label);
  // The secret is returned exactly once and never stored in plaintext.
  res.json(formatSuccessResponse({ key, meta, warning: 'Copy this key now — it will never be shown again.' }));
}

function revokeKey(req, res) {
  const ok = configStore.revokeKey(req.params.id);
  if (!ok) return res.status(ERR.NOT_FOUND.status).json(formatErrorResponse(ERR.NOT_FOUND));
  res.json(formatSuccessResponse({ revoked: true }));
}

// --- DM allowlist ---

const USER_ID_RE = /^[UW][A-Z0-9]+$/;

async function resolveDmTarget(services, entry) {
  const { slackClient, userService } = services;
  const trimmed = String(entry).trim().replace(/^@/, '');

  if (USER_ID_RE.test(trimmed)) {
    let name = trimmed;
    try { const u = await slackClient.getUserInfo(trimmed); name = u?.name || u?.real_name || trimmed; } catch { /* keep id */ }
    return { entry: trimmed, userId: trimmed, name };
  }
  if (trimmed.includes('@') && trimmed.includes('.')) {
    const u = await userService.getUserByEmail(trimmed);
    return { entry: trimmed, userId: u.id, name: u.name || u.real_name || trimmed };
  }
  // Treat as a username / display name — resolve from the (cached) user list.
  const { users } = await userService.listUsers(false, false);
  const found = users.find(u => u.name === trimmed || u.profile?.display_name === trimmed || u.real_name === trimmed);
  if (!found) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  return { entry: trimmed, userId: found.id, name: found.name };
}

async function listDmUsers(req, res, next) {
  try {
    const wl = req.services.whitelistService;
    const envEntries = (config.whitelist && config.whitelist.dmUsers) || [];

    // Resolve the .env seed entries (user IDs, usernames, or D-channel IDs) to names
    // so they show as proper people, not raw IDs. These are read-only from the UI
    // (they live in .env), so they carry removable:false.
    const envUsers = [];
    for (const entry of envEntries) {
      let userId = null;
      try {
        if (/^D[A-Z0-9]+$/.test(entry)) userId = await wl.resolveUserIdFromDmChannel(entry);
        else userId = wl.resolveUserId(entry);
      } catch { /* leave unresolved */ }
      const name = (userId && wl.userIdToName && wl.userIdToName.get(userId)) || null;
      envUsers.push({ source: 'env', entry, userId, name: name || entry, removable: false });
    }

    const storeUsers = configStore.listDmUsers().map((u) => ({ source: 'dashboard', removable: true, ...u }));

    res.json(formatSuccessResponse({ users: [...envUsers, ...storeUsers] }));
  } catch (err) {
    next(err);
  }
}

async function addDmUser(req, res, next) {
  try {
    const entry = req.body && req.body.entry;
    if (!entry) return res.status(ERR.BAD_REQUEST.status).json(formatErrorResponse(ERR.BAD_REQUEST, { field: 'entry' }));
    let target;
    try {
      target = await resolveDmTarget(req.services, entry);
    } catch (err) {
      return res.status(404).json(formatErrorResponse(ERR.NOT_FOUND, { reason: err.message }));
    }
    const rec = configStore.addDmUser(target); // emits dmAllowlistChanged → hot reload
    res.json(formatSuccessResponse({ added: rec }));
  } catch (err) {
    next(err);
  }
}

function removeDmUser(req, res) {
  const ok = configStore.removeDmUser(req.params.id);
  if (!ok) return res.status(ERR.NOT_FOUND.status).json(formatErrorResponse(ERR.NOT_FOUND));
  res.json(formatSuccessResponse({ removed: true }));
}

// --- Aggregated read view ---

const SUMMARY_TTL = 60; // seconds — repeat Overview loads within this window are instant

async function summary(req, res, next) {
  try {
    const { mentionService, activityService, cacheService } = req.services;
    const count = Math.min(parseInt(req.query.count, 10) || 15, 50);
    const fresh = req.query.fresh === '1' || req.query.fresh === 'true';

    // Each panel is a separate slow Slack aggregation. Support ?part=<key> so the
    // dashboard can fetch and render them one at a time (fast panels show first)
    // instead of blocking on the slowest. With no part, return all (backward compat).
    const parts = {
      mentions: async () => (await mentionService.getAllMentions(count, false)).mentions.map(compactMention),
      mentionThreads: async () => (await mentionService.getMentionThreads(count)).threads.map(compactThread),
      threadsImIn: async () => (await activityService.getThreadsImIn(count)).threads.map(compactThread),
      myThreads: async () => (await activityService.getMyThreads(count, false)).threads.map(compactThread),
    };

    const requested = req.query.part && parts[req.query.part] ? [req.query.part] : Object.keys(parts);
    const out = {};
    await Promise.all(requested.map(async (key) => {
      const cacheKey = `dash:summary:${key}:${count}`;
      if (!fresh && cacheService) {
        const cached = cacheService.get(cacheKey);
        if (cached !== undefined && cached !== null) { out[key] = cached; return; }
      }
      try {
        const data = await parts[key]();
        out[key] = data;
        if (cacheService) cacheService.set(cacheKey, data, SUMMARY_TTL);
      } catch (e) {
        out[key] = { error: e.message };
      }
    }));

    res.json(formatSuccessResponse(out));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login, logout, bootstrap, status,
  testSlack, saveSlack,
  listKeys, createKey, revokeKey,
  listDmUsers, addDmUser, removeDmUser,
  summary,
};
