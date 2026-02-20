const request = require('supertest');
const express = require('express');

// Mock Slack WebClient before requiring server modules
jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    auth: {
      test: jest.fn().mockResolvedValue({
        ok: true,
        user_id: 'U12345',
        user: 'testuser',
        team_id: 'T12345',
        team: 'TestTeam',
      }),
    },
  })),
}));

jest.mock('../../../src/config', () => ({
  port: 3999,
  nodeEnv: 'test',
  logLevel: 'error',
  slack: { botToken: 'xoxb-test-token', cookie: '', token: '' },
  apiKey: 'test-api-key',
  rateLimit: { windowMs: 60000, maxRequests: 100 },
  enableCaching: false,
  cache: { channelTtl: 300, userTtl: 300, threadTtl: 120, healthTtl: 300 },
  maxPaginationCalls: 10,
  whitelist: { readChannels: [], writeChannels: [], dmChannels: [], dmUsers: [] },
  enableWriteOps: false,
}));

jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const helmet = require('helmet');
const { formatErrorResponse } = require('../../../src/utils/helpers');
const { ERROR_CODES } = require('../../../src/utils/constants');
const authMiddleware = require('../../../src/middleware/auth');
const errorHandler = require('../../../src/middleware/errorHandler');
const apiRoutes = require('../../../src/routes');

const SlackClient = require('../../../src/clients/slackClient');
const CacheService = require('../../../src/services/cacheService');
const PaginationService = require('../../../src/services/paginationService');
const WhitelistService = require('../../../src/services/whitelistService');
const ChannelService = require('../../../src/services/channelService');
const MessageService = require('../../../src/services/messageService');
const UserService = require('../../../src/services/userService');
const SearchService = require('../../../src/services/searchService');

async function buildApp() {
  const app = express();
  app.use(helmet());
  app.use(express.json());

  const slackClient = new SlackClient();
  await slackClient.initialize();

  const cacheService = new CacheService();
  const paginationService = new PaginationService();
  const whitelistService = new WhitelistService(slackClient, paginationService);
  await whitelistService.initialize();

  const channelService = new ChannelService(slackClient, cacheService, paginationService, whitelistService);
  const messageService = new MessageService(slackClient, cacheService, paginationService, whitelistService);
  const userService = new UserService(slackClient, cacheService, paginationService);
  const searchService = new SearchService(slackClient, cacheService, messageService, whitelistService);

  const services = {
    slackClient, cacheService, paginationService, whitelistService,
    channelService, messageService, userService, searchService,
  };

  app.use((req, _res, next) => {
    req.services = services;
    next();
  });

  app.get('/health', async (req, res) => {
    try {
      const authResult = await req.services.slackClient.authTest();
      res.json({
        status: 'healthy',
        slack_auth: 'valid',
        slack_team: authResult.team,
      });
    } catch {
      res.json({ status: 'healthy', slack_auth: 'error' });
    }
  });

  app.use('/api', authMiddleware, apiRoutes);

  app.use((_req, res) => {
    res.status(404).json(formatErrorResponse(ERROR_CODES.NOT_FOUND));
  });
  app.use(errorHandler);

  return app;
}

describe('Health endpoint', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp();
  });

  test('GET /health returns healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.slack_auth).toBe('valid');
    expect(res.body.slack_team).toBe('TestTeam');
  });

  test('GET /health does not require auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});

describe('API auth', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp();
  });

  test('GET /api/auth/test without key returns 401', async () => {
    const res = await request(app).get('/api/auth/test');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/auth/test with wrong key returns 401', async () => {
    const res = await request(app)
      .get('/api/auth/test')
      .set('X-API-Key', 'wrong-key');
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/test with correct key succeeds', async () => {
    const res = await request(app)
      .get('/api/auth/test')
      .set('X-API-Key', 'test-api-key');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user_id).toBe('U12345');
    expect(res.body.data.auth_method).toBe('bot_token');
  });

  test('GET /api/nonexistent returns 404', async () => {
    const res = await request(app)
      .get('/api/nonexistent')
      .set('X-API-Key', 'test-api-key');
    expect(res.status).toBe(404);
  });
});
