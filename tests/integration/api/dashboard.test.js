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

const configStore = require('../../../src/services/configStore');
const dashboardRoutes = require('../../../src/routes/dashboard');

function buildApp() {
  const services = {
    slackClient: {
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
    activityService: { getThreadsImIn: async () => ({ threads: [] }), getMyThreads: async () => ({ threads: [] }) },
    whitelistService: {
      resolveUserIdFromDmChannel: async (channelId) => channelId === 'D020BE909FV' ? 'U1' : null,
    },
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.services = services; next(); });
  app.use('/dashboard', dashboardRoutes);
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

    test('API key: create (shown once) → verifiable → revoke → rejected', async () => {
      const created = await agent.post('/dashboard/api/keys').send({ label: 'test-key' });
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
