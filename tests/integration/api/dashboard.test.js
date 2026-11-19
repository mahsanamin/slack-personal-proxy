const os = require('os');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const express = require('express');

// Configure the environment BEFORE requiring config-dependent modules.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-dash-'));
const { hashPassword } = require('../../../src/utils/secureCrypto');
process.env.PERSISTENT_CACHE_DIR = TMP;
process.env.DASHBOARD_USER = 'admin';
process.env.DASHBOARD_PASSWORD_HASH = hashPassword('s3cret-pass');
process.env.DASHBOARD_MASTER_KEY = 'test-master-key-please-change-000';
process.env.ENABLE_DASHBOARD = 'true';
process.env.ENABLE_WRITE_OPS = 'true';

const configStore = require('../../../src/services/configStore');
const dashboardRoutes = require('../../../src/routes/dashboard');
const authMiddleware = require('../../../src/middleware/auth');
const messageRoutes = require('../../../src/routes/messages');
let services;

function buildApp() {
  services = {
    slackClient: {
      currentUserName: 'me',
      authTest: async () => ({ team: 'TestTeam', user: 'me', user_id: 'U1', team_id: 'T1' }),
      testCredentials: async (c) => {
        if (c.token === 'xoxc-good' || c.botToken === 'xoxb-good') return { team: 'TestTeam', user: 'me' };
        const e = new Error('invalid_auth'); e.data = { error: 'invalid_auth' }; throw e;
      },
      getUserInfo: async () => ({ name: 'someuser', real_name: 'Some User' }),
    },
    userService: {
      getUserByEmail: async () => ({ id: 'U999', name: 'emailuser' }),
      listUsers: async () => ({ users: [{ id: 'U777', name: 'byname', profile: { display_name: 'By Name' }, real_name: 'By Name' }] }),
    },
    mentionService: { getAllMentions: async () => ({ mentions: [] }), getMentionThreads: async () => ({ threads: [] }) },
    channelService: {
      listMemberChannels: async () => ({
        fetched_at: Date.now(),
        channels: [
          { id: 'C0AAAAAAA1', name: 'general', is_private: false, is_archived: false, member_count: 4 },
          { id: 'C0BBBBBBB2', name: 'secret', is_private: true, is_archived: false, member_count: 2 },
          // Group DMs come from the member list only: one renamed, one with Slack's default name.
          { id: 'C0GDMRENAM', name: 'Project-Crew', is_group_dm: true, is_private: true },
          { id: 'C0GDMDEFLT', name: 'mpdm-alice--me--bob-1', is_group_dm: true, is_private: true },
        ],
      }),
      // The saved full workspace list also holds a public channel the account has not joined.
      peekChannelList: () => ({
        fresh: true,
        fetched_at: Date.now(),
        channels: [
          { id: 'C0AAAAAAA1', name: 'general', is_private: false },
          { id: 'C0CCCCCCC3', name: 'random', is_private: false },
        ],
      }),
      warmChannelList: () => {},
      isFullListLoading: () => false,
    },
    activityService: { getThreadsImIn: async () => ({ threads: [] }), getMyThreads: async () => ({ threads: [] }) },
    whitelistService: {
      resolveUserIdFromDmChannel: async (channelId) => channelId === 'D020BE909FV' ? 'U1' : null,
      resolveUserTarget: async (target) => target.replace(/^@/, '') === 'new.person' ? 'UNEW' : 'U1',
      userIdToName: new Map([['UNEW', 'new.person'], ['U1', 'someuser']]),
    },
    messageService: {
      sendApprovedDirectMessage: jest.fn(async () => ({
        ok: true,
        channel: 'DNEW',
        ts: '1700000000.123456',
        message: { text: 'approved message' },
      })),
    },
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.services = services; next(); });
  app.use('/dashboard', dashboardRoutes);
  app.use('/api/messages', authMiddleware, messageRoutes);
  return app;
}

describe('Dashboard API', () => {
  let app;
  beforeAll(async () => {
    await configStore.init();
    app = buildApp();
  });
  afterAll(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

  test('bootstrap reports the dashboard is configured', async () => {
    const res = await request(app).get('/dashboard/api/bootstrap');
    expect(res.status).toBe(200);
    expect(res.body.data.dashboardConfigured).toBe(true);
  });

  test('slackp CLI is downloadable without a dashboard session', async () => {
    const res = await request(app).get('/dashboard/slackp');
    expect(res.status).toBe(200);
    expect(res.text).toContain('#!/usr/bin/env python3');
    expect(res.text).toContain('Agent-friendly CLI for Slack Personal Proxy');
  });

  test('protected endpoints reject without a session', async () => {
    const res = await request(app).get('/dashboard/api/status');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('DASHBOARD_UNAUTHENTICATED');
  });

  test('a valid CLI API key cannot modify the DM allowlist', async () => {
    const { key, meta } = configStore.createKey('cli-boundary-test');
    const before = configStore.dmAllowlistEntries();
    try {
      const res = await request(app)
        .post('/dashboard/api/dm-allowlist')
        .set('X-API-Key', key)
        .send({ entry: '@unauthorized-user' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('DASHBOARD_UNAUTHENTICATED');
      expect(configStore.dmAllowlistEntries()).toEqual(before);
    } finally {
      configStore.revokeKey(meta.id);
    }
  });

  test('a CLI key can request a DM but another CLI key cannot read that request', async () => {
    const first = configStore.createKey('requesting-machine', { access: 'read_write', readChannels: null });
    const second = configStore.createKey('different-machine');
    try {
      const requested = await request(app)
        .post('/api/messages/dm/request')
        .set('X-API-Key', first.key)
        .send({ target: '@new.person', text: 'owner must review this' });
      expect(requested.status).toBe(202);
      const id = requested.body.data.approval.id;

      const own = await request(app)
        .get('/api/messages/dm/requests/' + id)
        .set('X-API-Key', first.key);
      expect(own.status).toBe(200);
      expect(own.body.data.approval.status).toBe('pending');

      const other = await request(app)
        .get('/api/messages/dm/requests/' + id)
        .set('X-API-Key', second.key);
      expect(other.status).toBe(404);
    } finally {
      configStore.revokeKey(first.meta.id);
      configStore.revokeKey(second.meta.id);
    }
  });

  test('login: "remember this machine" gives a 30-day cookie, otherwise 120 minutes', async () => {
    const remembered = await request(app).post('/dashboard/login').send({ user: 'admin', password: 's3cret-pass', remember: true });
    expect(remembered.status).toBe(200);
    expect(remembered.headers['set-cookie'][0]).toContain('Max-Age=2592000');

    const normal = await request(app).post('/dashboard/login').send({ user: 'admin', password: 's3cret-pass' });
    expect(normal.headers['set-cookie'][0]).toContain('Max-Age=7200');
  });

  test('a fresh remembered session is not renewed on every request', async () => {
    const login = await request(app).post('/dashboard/login').send({ user: 'admin', password: 's3cret-pass', remember: true });
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const res = await request(app).get('/dashboard/api/status').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('a remembered session past half its life is renewed, keeping the original sign-in time', async () => {
    const { issue } = require('../../../src/utils/dashboardSession');
    const day = 24 * 60 * 60000;
    const iat = Date.now() - 20 * day; // signed in 20 days ago: 10 days of life left
    const token = issue('admin', { remember: true, iat });
    const res = await request(app).get('/dashboard/api/status').set('Cookie', 'sp_session=' + token);
    expect(res.status).toBe(200);
    const renewed = res.headers['set-cookie'][0];
    expect(renewed).toContain('Max-Age=2592000');
    expect(renewed).toContain('sp_session=');
  });

  test('a remembered session is refused after 30 days from the original sign-in, even if renewed', async () => {
    const { issue } = require('../../../src/utils/dashboardSession');
    const day = 24 * 60 * 60000;
    const token = issue('admin', { remember: true, iat: Date.now() - 31 * day });
    const res = await request(app).get('/dashboard/api/status').set('Cookie', 'sp_session=' + token);
    expect(res.status).toBe(401);
  });

  test('login rejects a bad password', async () => {
    const res = await request(app).post('/dashboard/login').send({ user: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  describe('authenticated flows', () => {
    let agent;
    beforeAll(async () => {
      agent = request.agent(app);
      const res = await agent.post('/dashboard/login').send({ user: 'admin', password: 's3cret-pass' });
      expect(res.status).toBe(200);
    });

    test('status is reachable once logged in', async () => {
      const res = await agent.get('/dashboard/api/status');
      expect(res.status).toBe(200);
      expect(res.body.data.security.masterKeySet).toBe(true);
    });

    test('API key: create requires a scope, and a bad scope is refused', async () => {
      const noScope = await agent.post('/dashboard/api/keys').send({ label: 'no-scope' });
      expect(noScope.status).toBe(400);
      expect(noScope.body.error.code).toBe('BAD_KEY_SCOPE');

      const emptyList = await agent.post('/dashboard/api/keys').send({ label: 'empty', channels: [] });
      expect(emptyList.status).toBe(400);

      const badAccess = await agent.post('/dashboard/api/keys').send({ label: 'bad', access: 'admin', channels: 'all' });
      expect(badAccess.status).toBe(400);

      const badId = await agent.post('/dashboard/api/keys').send({ label: 'bad', channels: ['general'] });
      expect(badId.status).toBe(400);

      const keys = await agent.get('/dashboard/api/keys');
      expect(keys.body.data.keys.find((k) => k.label === 'no-scope' || k.label === 'bad' || k.label === 'empty')).toBeUndefined();
    });

    test('API key: a selected-channel read-only key is stored with its scope', async () => {
      const created = await agent.post('/dashboard/api/keys').send({ label: 'scoped-key', access: 'read', channels: ['C0AAAAAAA1', 'C0AAAAAAA1'] });
      expect(created.status).toBe(200);
      const rec = configStore.verifyApiKey(created.body.data.key);
      expect(rec.access).toBe('read');
      expect(rec.readChannels).toEqual(['C0AAAAAAA1']); // duplicates removed

      const list = await agent.get('/dashboard/api/keys');
      const shown = list.body.data.keys.find((k) => k.label === 'scoped-key');
      expect(shown.access).toBe('read');
      expect(shown.readChannels).toEqual(['C0AAAAAAA1']);
      await agent.delete('/dashboard/api/keys/' + shown.id);
    });

    test('API key: an all-channels key is stored as unrestricted and defaults to read only', async () => {
      const created = await agent.post('/dashboard/api/keys').send({ label: 'all-key', channels: 'all' });
      expect(created.status).toBe(200);
      const rec = configStore.verifyApiKey(created.body.data.key);
      expect(rec.access).toBe('read');
      expect(rec.readChannels).toBeNull();
      const list = await agent.get('/dashboard/api/keys');
      await agent.delete('/dashboard/api/keys/' + list.body.data.keys.find((k) => k.label === 'all-key').id);
    });

    test('API key: edit changes access and channels, and the same secret keeps working', async () => {
      const created = await agent.post('/dashboard/api/keys').send({ label: 'edit-me', access: 'read', channels: ['C0AAAAAAA1'] });
      const secret = created.body.data.key;
      const id = created.body.data.meta.id;

      const res = await agent.patch('/dashboard/api/keys/' + id)
        .send({ access: 'read_write', channels: ['C0AAAAAAA1', 'C0GROUPDM9', 'C0GROUPDM9'] });
      expect(res.status).toBe(200);
      expect(res.body.data.meta.access).toBe('read_write');
      expect(res.body.data.meta.readChannels).toEqual(['C0AAAAAAA1', 'C0GROUPDM9']);
      expect(res.body.data.meta.updatedAt).toBeTruthy();

      // The record the auth middleware returns for the unchanged secret has the new scope.
      const rec = configStore.verifyApiKey(secret);
      expect(rec.access).toBe('read_write');
      expect(rec.readChannels).toEqual(['C0AAAAAAA1', 'C0GROUPDM9']);

      // Saved to disk, so a restart keeps it.
      const onDisk = JSON.parse(fs.readFileSync(path.join(TMP, 'apikeys.json'), 'utf8'))
        .find((k) => k.id === id);
      expect(onDisk.readChannels).toEqual(['C0AAAAAAA1', 'C0GROUPDM9']);

      // Narrowing back to read only works too.
      const back = await agent.patch('/dashboard/api/keys/' + id).send({ access: 'read', channels: ['C0GROUPDM9'] });
      expect(back.status).toBe(200);
      expect(configStore.verifyApiKey(secret).access).toBe('read');
      expect(configStore.verifyApiKey(secret).readChannels).toEqual(['C0GROUPDM9']);
      await agent.delete('/dashboard/api/keys/' + id);
    });

    test('API key: edit refuses a bad scope, a missing access, and an unknown key', async () => {
      const created = await agent.post('/dashboard/api/keys').send({ label: 'edit-guard', access: 'read_write', channels: ['C0AAAAAAA1'] });
      const id = created.body.data.meta.id;

      const noAccess = await agent.patch('/dashboard/api/keys/' + id).send({ channels: ['C0AAAAAAA1'] });
      expect(noAccess.status).toBe(400);
      const empty = await agent.patch('/dashboard/api/keys/' + id).send({ access: 'read', channels: [] });
      expect(empty.status).toBe(400);
      const badId = await agent.patch('/dashboard/api/keys/' + id).send({ access: 'read', channels: ['general'] });
      expect(badId.status).toBe(400);
      const unknown = await agent.patch('/dashboard/api/keys/no-such-id').send({ access: 'read', channels: ['C0AAAAAAA1'] });
      expect(unknown.status).toBe(404);

      // Nothing changed on the refused edits.
      const shown = (await agent.get('/dashboard/api/keys')).body.data.keys.find((k) => k.id === id);
      expect(shown.access).toBe('read_write');
      expect(shown.readChannels).toEqual(['C0AAAAAAA1']);
      await agent.delete('/dashboard/api/keys/' + id);
    });

    test('API key: edit needs a dashboard session, an API key is not enough', async () => {
      const created = await agent.post('/dashboard/api/keys').send({ label: 'edit-auth', channels: ['C0AAAAAAA1'] });
      const res = await request(app).patch('/dashboard/api/keys/' + created.body.data.meta.id)
        .set('X-API-Key', created.body.data.key)
        .send({ access: 'read_write', channels: 'all' });
      expect(res.status).toBe(401);
      expect(configStore.verifyApiKey(created.body.data.key).readChannels).toEqual(['C0AAAAAAA1']);
      await agent.delete('/dashboard/api/keys/' + created.body.data.meta.id);
    });

    test('channel picker lists channels, then group DMs labelled by their people', async () => {
      const res = await agent.get('/dashboard/api/channels');
      expect(res.status).toBe(200);
      expect(res.body.data.channels.map((c) => c.label)).toEqual(['general', 'random', 'secret', 'alice, bob', 'Project-Crew']);
      const renamed = res.body.data.channels.find((c) => c.id === 'C0GDMRENAM');
      expect(renamed.is_group_dm).toBe(true);
      expect(res.body.data.channels.find((c) => c.name === 'general').is_group_dm).toBe(false);
    });

    test('channel picker lists channels only, for choosing key scope', async () => {
      const res = await agent.get('/dashboard/api/channels');
      expect(res.status).toBe(200);
      expect(res.body.data.channels.filter((c) => !c.is_group_dm).map((c) => c.name)).toEqual(['general', 'random', 'secret']);
      // One-to-one DMs are never offered.
      expect(res.body.data.channels.some((c) => c.id.startsWith('D'))).toBe(false);
      expect(res.body.data.channels.find((c) => c.name === 'secret').is_private).toBe(true);
      // Channels the account is in come first-class; others are marked as not joined.
      expect(res.body.data.channels.find((c) => c.name === 'general').is_member).toBe(true);
      expect(res.body.data.channels.find((c) => c.name === 'random').is_member).toBe(false);
      expect(res.body.data.full_ready).toBe(true);
    });

    test('API key: create (shown once) → verifiable → revoke → rejected', async () => {
      const created = await agent.post('/dashboard/api/keys').send({ label: 'test-key', channels: ['C0AAAAAAA1'] });
      expect(created.status).toBe(200);
      const key = created.body.data.key;
      expect(key.startsWith('spk_')).toBe(true);
      expect(configStore.verifyApiKey(key)).toBeTruthy();

      const list = await agent.get('/dashboard/api/keys');
      const rec = list.body.data.keys.find((k) => k.label === 'test-key');
      expect(rec).toBeTruthy();
      expect(rec.prefix).not.toContain(key.slice(-4)); // never exposes the full secret

      const del = await agent.delete('/dashboard/api/keys/' + rec.id);
      expect(del.status).toBe(200);
      expect(configStore.verifyApiKey(key)).toBeNull(); // deleted keys stop working
      // Deleted key is removed from the list entirely (hard delete, not soft-revoke).
      const after = await agent.get('/dashboard/api/keys');
      expect(after.body.data.keys.find((k) => k.id === rec.id)).toBeUndefined();
    });

    test('Slack setup: bad creds rejected, good creds stored & encrypted', async () => {
      const bad = await agent.post('/dashboard/api/setup/slack').send({ token: 'xoxc-bad' });
      expect(bad.status).toBe(400);

      const good = await agent.post('/dashboard/api/setup/slack').send({ cookie: 'xoxd-c', token: 'xoxc-good' });
      expect(good.status).toBe(200);
      expect(configStore.hasStoredSlackCreds()).toBe(true);
      expect(configStore.getSlackCreds().token).toBe('xoxc-good');
      // On-disk file must not contain the plaintext token.
      const raw = fs.readFileSync(path.join(TMP, 'secrets.enc'), 'utf8');
      expect(raw).not.toContain('xoxc-good');
    });

    test('DM allowlist: add by email → list → remove', async () => {
      const add = await agent.post('/dashboard/api/dm-allowlist').send({ entry: 'someone@example.com' });
      expect(add.status).toBe(200);
      expect(add.body.data.added.userId).toBe('U999');

      const list = await agent.get('/dashboard/api/dm-allowlist');
      const rec = list.body.data.users.find((u) => u.userId === 'U999');
      expect(rec).toBeTruthy();
      expect(configStore.dmAllowlistEntries()).toContain('U999');

      const del = await agent.delete('/dashboard/api/dm-allowlist/' + rec.id);
      expect(del.status).toBe(200);
    });

    test('DM allowlist: accepts a D-channel ID and resolves it to a user', async () => {
      const add = await agent.post('/dashboard/api/dm-allowlist').send({ entry: 'D020BE909FV' });
      expect(add.status).toBe(200);
      expect(add.body.data.added).toMatchObject({
        entry: 'D020BE909FV',
        userId: 'U1',
        name: 'someuser',
      });

      const list = await agent.get('/dashboard/api/dm-allowlist');
      const rec = list.body.data.users.find((u) => u.entry === 'D020BE909FV');
      expect(rec).toBeTruthy();

      const del = await agent.delete('/dashboard/api/dm-allowlist/' + rec.id);
      expect(del.status).toBe(200);
    });

    test('DM approval: dashboard sends the exact request once and cannot replay it', async () => {
      const { meta } = configStore.createKey('approval-machine', { access: 'read_write', readChannels: null });
      const approval = configStore.createDmApproval({
        target: '@new.person', userId: 'UNEW', name: 'new.person',
        text: 'approved message', apiKeyId: meta.id, apiKeyLabel: meta.label,
      });
      const encrypted = fs.readFileSync(path.join(TMP, 'dm-approvals.enc'), 'utf8');
      expect(encrypted).not.toContain('approved message');

      const list = await agent.get('/dashboard/api/dm-approvals');
      expect(list.body.data.requests.find((r) => r.id === approval.id)).toBeTruthy();

      const sent = await agent
        .post('/dashboard/api/dm-approvals/' + approval.id + '/decision')
        .send({ decision: 'send_once' });
      expect(sent.status).toBe(200);
      expect(services.messageService.sendApprovedDirectMessage).toHaveBeenCalledWith(
        'UNEW', 'approved message', null
      );

      const replay = await agent
        .post('/dashboard/api/dm-approvals/' + approval.id + '/decision')
        .send({ decision: 'send_once' });
      expect(replay.status).toBe(409);
      configStore.revokeKey(meta.id);
    });

    test('DM approval: temporary access is bound to one API key and revoked with it', async () => {
      const { meta } = configStore.createKey('temporary-machine', { access: 'read_write', readChannels: null });
      const approval = configStore.createDmApproval({
        target: '@new.person', userId: 'UNEW', name: 'new.person',
        text: 'temporary message', apiKeyId: meta.id, apiKeyLabel: meta.label,
      });
      const decided = await agent
        .post('/dashboard/api/dm-approvals/' + approval.id + '/decision')
        .send({ decision: 'allow_temporarily' });
      expect(decided.status).toBe(200);
      expect(configStore.hasTemporaryDmGrant(meta.id, 'UNEW')).toBe(true);
      expect(configStore.hasTemporaryDmGrant('another-key', 'UNEW')).toBe(false);
      configStore.revokeKey(meta.id);
      expect(configStore.hasTemporaryDmGrant(meta.id, 'UNEW')).toBe(false);
    });

    test('summary returns all panels, or just one with ?part=', async () => {
      const all = await agent.get('/dashboard/api/summary');
      expect(all.status).toBe(200);
      expect(Object.keys(all.body.data).sort()).toEqual(
        ['mentionThreads', 'mentions', 'myThreads', 'threadsImIn'].sort()
      );

      const one = await agent.get('/dashboard/api/summary?part=mentions');
      expect(one.status).toBe(200);
      expect(Object.keys(one.body.data)).toEqual(['mentions']);
      expect(Array.isArray(one.body.data.mentions)).toBe(true);
    });

    test('logout clears the session', async () => {
      await agent.post('/dashboard/logout');
      const res = await agent.get('/dashboard/api/status');
      expect(res.status).toBe(401);
    });
  });
});
