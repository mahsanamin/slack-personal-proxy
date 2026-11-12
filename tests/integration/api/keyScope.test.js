const request = require('supertest');
const express = require('express');

jest.mock('../../../src/config', () => ({
  enableWriteOps: true,
  dmApprovals: { enabled: false },
  cache: { channelTtl: 300 },
  whitelist: { writeChannels: [], dmUsers: [] },
}));

jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Keys are looked up by the plain secret; these records stand in for stored keys.
const KEYS = {
  'secret-legacy': { id: 'k-legacy', label: 'legacy' },
  'secret-read': { id: 'k-read', label: 'read only', access: 'read', readChannels: ['C0AAAAAAA1'] },
  'secret-readwrite': { id: 'k-rw', label: 'read write', access: 'read_write', readChannels: ['C0AAAAAAA1'] },
  'secret-all-read': { id: 'k-all', label: 'all read only', access: 'read', readChannels: null },
};

jest.mock('../../../src/services/configStore', () => ({
  verifyApiKey: (provided) => KEYS[provided] || null,
  hasTemporaryDmGrant: () => false,
  hasMasterKey: () => false,
}));

const authMiddleware = require('../../../src/middleware/auth');
const channelRoutes = require('../../../src/routes/channels');
const conversationRoutes = require('../../../src/routes/conversations');
const messageRoutes = require('../../../src/routes/messages');
const mentionRoutes = require('../../../src/routes/mentions');
const activityRoutes = require('../../../src/routes/activity');
const searchRoutes = require('../../../src/routes/search');

const ChannelService = require('../../../src/services/channelService');
const SearchService = require('../../../src/services/searchService');
const MentionService = require('../../../src/services/mentionService');
const ActivityService = require('../../../src/services/activityService');

const PUBLIC_CHANNEL = 'C0AAAAAAA1';
const OTHER_CHANNEL = 'C0BBBBBBB2';
const DM_CHANNEL = 'D0AAAAAAA1';

const ALL_CHANNELS = [
  { id: PUBLIC_CHANNEL, name: 'general-ish', is_private: false },
  { id: OTHER_CHANNEL, name: 'secret-project', is_private: true },
];

// Slack search results: one match per place a key could be scoped out of.
const SEARCH_MATCHES = [
  { ts: '1700000001.000100', text: 'in allowed', user: 'U2', channel: { id: PUBLIC_CHANNEL, name: 'general-ish' }, permalink: 'https://x.slack.com/archives/' + PUBLIC_CHANNEL + '/p1700000001000100' },
  { ts: '1700000002.000100', text: 'in dm', user: 'U3', channel: { id: DM_CHANNEL, name: 'dm' }, permalink: 'https://x.slack.com/archives/' + DM_CHANNEL + '/p1700000002000100' },
  { ts: '1700000003.000100', text: 'in other', user: 'U4', channel: { id: OTHER_CHANNEL, name: 'secret-project' }, permalink: 'https://x.slack.com/archives/' + OTHER_CHANNEL + '/p1700000003000100' },
];

function buildServices() {
  const slackClient = {
    currentUserId: 'U1',
    searchMessages: jest.fn(async () => ({ messages: SEARCH_MATCHES, total: SEARCH_MATCHES.length })),
    // Pass matches through with thread_ts taken from the permalink (no extra API calls).
    enrichSearchMatches: jest.fn(async (matches) => ({
      matches: matches.map((m) => ({ ...m, thread_ts: null, reply_count: 0 })),
      apiCalls: 0,
    })),
    getChannelInfo: jest.fn(async (id) => ({ id, name: id, is_private: false })),
  };
  const cache = { get: () => undefined, set: () => {} };
  const pagination = { fetchAllChannels: async () => ({ items: ALL_CHANNELS, api_calls: 1 }) };
  const whitelistService = { channelIdToName: new Map(), resolveUserTarget: async () => 'U9', userIdToName: new Map() };
  const messageService = {
    getCompleteThread: jest.fn(async (channelId, threadTs) => ({
      parent: { ts: threadTs, text: 'parent', user: 'U2' }, replies: [], reply_count: 0, participants: [], api_calls_made: 0,
    })),
    getRecentMessages: jest.fn(async () => ({ messages: [], parent_count: 0, threads_fetched: 0, total_thread_replies: 0, api_calls_made: 0 })),
    sendMessage: jest.fn(async (channelId) => ({ channel: channelId, ts: '1700000009.000100', message: { text: 'hi' } })),
    sendDirectMessage: jest.fn(async () => ({ channel: 'D9', ts: '1', message: { text: 'hi' } })),
  };
  const channelService = new ChannelService(slackClient, cache, pagination, whitelistService);
  channelService.getChannelInfo = jest.fn(async (id) => ({ id, name: 'channel', is_private: false }));
  return {
    slackClient,
    channelService,
    messageService,
    whitelistService,
    searchService: new SearchService(slackClient, cache, messageService, whitelistService),
    mentionService: new MentionService(slackClient, cache, messageService, whitelistService),
    activityService: new ActivityService(slackClient, cache, messageService, whitelistService),
  };
}

function buildApp(services) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.services = services; next(); });
  app.use('/api', authMiddleware);
  app.use('/api/channels', channelRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/mentions', mentionRoutes);
  app.use('/api/activity', activityRoutes);
  app.use('/api/search', searchRoutes);
  // Minimal error handler: writes plain thrown error objects the way errorHandler does.
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
  });
  return app;
}

const READ = 'secret-read';
const READ_WRITE = 'secret-readwrite';
const ALL_READ = 'secret-all-read';
const LEGACY = 'secret-legacy';

describe('per-key channel scope (HTTP)', () => {
  let services;
  let app;

  beforeEach(() => {
    services = buildServices();
    app = buildApp(services);
  });

  describe('auth', () => {
    test('a key that does not exist is still rejected', async () => {
      const res = await request(app).get('/api/channels').set('X-API-Key', 'nope');
      expect(res.status).toBe(401);
    });
  });

  describe('channel reads', () => {
    test('scoped key can read an allowed channel', async () => {
      const res = await request(app).get(`/api/channels/${PUBLIC_CHANNEL}/info`).set('X-API-Key', READ);
      expect(res.status).toBe(200);
    });

    test('scoped key is refused a channel it was not given, with a clear code', async () => {
      const res = await request(app).get(`/api/channels/${OTHER_CHANNEL}/info`).set('X-API-Key', READ);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CHANNEL_NOT_IN_KEY_SCOPE');
      expect(services.channelService.getChannelInfo).not.toHaveBeenCalled();
    });

    test('scoped key cannot read a direct message channel unless it was listed', async () => {
      const res = await request(app).get(`/api/channels/${DM_CHANNEL}/recent-messages`).set('X-API-Key', READ);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CHANNEL_NOT_IN_KEY_SCOPE');
      expect(services.messageService.getRecentMessages).not.toHaveBeenCalled();
    });

    test('scoped key cannot read a thread in a channel outside its scope', async () => {
      const res = await request(app).get(`/api/channels/${OTHER_CHANNEL}/thread/1700000003.000100`).set('X-API-Key', READ);
      expect(res.status).toBe(403);
      expect(services.messageService.getCompleteThread).not.toHaveBeenCalled();
    });

    test('scoped key cannot read a thread through a permalink for another channel', async () => {
      const url = `https://x.slack.com/archives/${OTHER_CHANNEL}/p1700000003000100`;
      const res = await request(app).get('/api/conversations/permalink').query({ url }).set('X-API-Key', READ);
      expect(res.status).toBe(403);
      expect(services.messageService.getCompleteThread).not.toHaveBeenCalled();
    });

    test('scoped key can read a thread through a permalink for an allowed channel', async () => {
      const url = `https://x.slack.com/archives/${PUBLIC_CHANNEL}/p1700000001000100`;
      const res = await request(app).get('/api/conversations/permalink').query({ url }).set('X-API-Key', READ);
      expect(res.status).toBe(200);
    });

    test('all-channels read-only key reads any channel including DMs', async () => {
      const res = await request(app).get(`/api/channels/${DM_CHANNEL}/recent-messages`).set('X-API-Key', ALL_READ);
      expect(res.status).toBe(200);
    });

    test('legacy key keeps full access, unchanged from before scopes', async () => {
      const res = await request(app).get(`/api/channels/${OTHER_CHANNEL}/info`).set('X-API-Key', LEGACY);
      expect(res.status).toBe(200);
    });
  });

  describe('channel list', () => {
    test('scoped key sees only its channels and an honest total', async () => {
      const res = await request(app).get('/api/channels').set('X-API-Key', READ);
      expect(res.status).toBe(200);
      expect(res.body.data.channels.map((c) => c.id)).toEqual([PUBLIC_CHANNEL]);
      expect(res.body.data.total_count).toBe(1);
    });

    test('legacy key still sees every channel', async () => {
      const res = await request(app).get('/api/channels').set('X-API-Key', LEGACY);
      expect(res.body.data.channels).toHaveLength(2);
    });
  });

  describe('sending', () => {
    test('read-only key cannot send to an allowed channel', async () => {
      const res = await request(app)
        .post(`/api/messages/${PUBLIC_CHANNEL}/send`)
        .set('X-API-Key', READ)
        .send({ text: 'hello' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('KEY_READ_ONLY');
      expect(services.messageService.sendMessage).not.toHaveBeenCalled();
    });

    test('read-write key can send to an allowed channel', async () => {
      const res = await request(app)
        .post(`/api/messages/${PUBLIC_CHANNEL}/send`)
        .set('X-API-Key', READ_WRITE)
        .send({ text: 'hello' });
      expect(res.status).toBe(200);
      expect(services.messageService.sendMessage).toHaveBeenCalledWith(PUBLIC_CHANNEL, 'hello', null, 'k-rw');
    });

    test('read-write key cannot send to a channel outside its scope', async () => {
      const res = await request(app)
        .post(`/api/messages/${OTHER_CHANNEL}/send`)
        .set('X-API-Key', READ_WRITE)
        .send({ text: 'hello' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CHANNEL_NOT_IN_KEY_SCOPE');
      expect(services.messageService.sendMessage).not.toHaveBeenCalled();
    });

    test('selected-channel key cannot send a direct message to a user, even read-write', async () => {
      const res = await request(app)
        .post('/api/messages/dm/send')
        .set('X-API-Key', READ_WRITE)
        .send({ target: 'someone', text: 'hi' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DM_NOT_IN_KEY_SCOPE');
      expect(services.messageService.sendDirectMessage).not.toHaveBeenCalled();
    });

    test('read-only key is refused for direct messages too', async () => {
      const res = await request(app)
        .post('/api/messages/dm/send')
        .set('X-API-Key', ALL_READ)
        .send({ target: 'someone', text: 'hi' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('KEY_READ_ONLY');
    });
  });

  describe('search, mentions and activity filter out other channels', () => {
    test('search returns only matches in the key channels, and no total that counts hidden ones', async () => {
      const res = await request(app).get('/api/search/messages').query({ query: 'in', count: 10, verbose: true }).set('X-API-Key', READ);
      expect(res.status).toBe(200);
      const channels = res.body.data.results.map((r) => r.message.channel_id);
      expect(channels).toEqual([PUBLIC_CHANNEL]);
      expect(res.body.data.total_matches).toBe(1);
    });

    test('search for an unrestricted key is unchanged', async () => {
      const res = await request(app).get('/api/search/messages').query({ query: 'in', count: 10 }).set('X-API-Key', LEGACY);
      expect(res.body.data.results).toHaveLength(3);
      expect(res.body.data.total_matches).toBe(3);
    });

    test('mentions return only key channels and the total matches what is returned', async () => {
      const res = await request(app).get('/api/mentions/all').query({ count: 10, includeThreads: false }).set('X-API-Key', READ);
      expect(res.status).toBe(200);
      expect(res.body.data.mentions.map((m) => m.channel_id)).toEqual([PUBLIC_CHANNEL]);
      expect(res.body.meta.total_mentions).toBe(1);
    });

    test('mentions by channel refuse a channel outside the key scope', async () => {
      const res = await request(app).get(`/api/mentions/by-channel/${OTHER_CHANNEL}`).set('X-API-Key', READ);
      expect(res.status).toBe(403);
    });

    test('threads the key is in only include key channels', async () => {
      // Activity only keeps thread replies, so each match gets a parent that is not itself.
      services.slackClient.enrichSearchMatches = jest.fn(async (matches) => ({
        matches: matches.map((m) => ({ ...m, thread_ts: '1699999999.000100', reply_count: 0 })),
        apiCalls: 0,
      }));
      const res = await request(app).get('/api/activity/threads-im-in').query({ count: 10 }).set('X-API-Key', READ);
      expect(res.status).toBe(200);
      expect(res.body.data.threads.map((t) => t.channel_id)).toEqual([PUBLIC_CHANNEL]);
    });
  });
});
