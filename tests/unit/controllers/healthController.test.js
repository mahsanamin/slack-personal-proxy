jest.mock('../../../src/config', () => ({
  logLevel: 'error',
  nodeEnv: 'test',
  enableCaching: true,
  cache: { healthTtl: 300 },
}));

jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { healthCheck } = require('../../../src/controllers/healthController');

function buildRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status: jest.fn(function status(code) { this.statusCode = code; return this; }),
    json: jest.fn(function json(payload) { this.body = payload; return this; }),
  };
  return res;
}

function buildReq({ authTest, healthProbe, cached = null } = {}) {
  const cacheService = {
    get: jest.fn().mockReturnValue(cached),
    set: jest.fn(),
  };
  return {
    services: {
      cacheService,
      slackClient: {
        authTest: authTest || jest.fn().mockResolvedValue({ team: 'TestTeam' }),
        healthProbe: healthProbe || jest.fn().mockResolvedValue(true),
      },
    },
  };
}

describe('healthController', () => {
  it('reports healthy with 200 when auth and the data probe both succeed', async () => {
    const req = buildReq();
    const res = buildRes();

    await healthCheck(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.slack_auth).toBe('valid');
    expect(res.body.slack_api).toBe('ok');
    expect(res.body.slack_team).toBe('TestTeam');
  });

  // The exact failure that hid a dead proxy for days: auth.test bypasses the
  // throttle queue, so it kept passing while every real endpoint returned
  // message_not_found. Health must call this degraded, not healthy.
  it('reports degraded with 503 when auth passes but the data probe fails', async () => {
    const err = Object.assign(new Error('boom'), { data: { error: 'message_not_found' } });
    const req = buildReq({ healthProbe: jest.fn().mockRejectedValue(err) });
    const res = buildRes();

    await healthCheck(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.slack_auth).toBe('valid');
    expect(res.body.slack_api).toBe('error');
    expect(res.body.slack_api_error).toBe('message_not_found');
  });

  it('reports degraded with 503 when auth fails', async () => {
    const req = buildReq({ authTest: jest.fn().mockRejectedValue(new Error('invalid_auth')) });
    const res = buildRes();

    await healthCheck(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.slack_auth).toBe('error');
  });

  it('never caches a degraded result, so it clears on the next poll', async () => {
    const err = Object.assign(new Error('boom'), { data: { error: 'message_not_found' } });
    const req = buildReq({ healthProbe: jest.fn().mockRejectedValue(err) });
    const res = buildRes();

    await healthCheck(req, res);

    expect(req.services.cacheService.set).not.toHaveBeenCalled();
  });

  it('caches a healthy result', async () => {
    const req = buildReq();
    const res = buildRes();

    await healthCheck(req, res);

    expect(req.services.cacheService.set).toHaveBeenCalledTimes(1);
  });

  it('serves a cache hit without re-probing Slack', async () => {
    const req = buildReq({ cached: { status: 'healthy', slack_auth: 'valid' } });
    const res = buildRes();

    await healthCheck(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(req.services.slackClient.authTest).not.toHaveBeenCalled();
    expect(req.services.slackClient.healthProbe).not.toHaveBeenCalled();
  });

  it('always reports live uptime, even from cache', async () => {
    const req = buildReq({ cached: { status: 'healthy', uptime: 1 } });
    const res = buildRes();

    await healthCheck(req, res);

    expect(res.body.uptime).toBe(Math.floor(process.uptime()));
  });
});
