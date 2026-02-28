let mockAllowedIps = [];

jest.mock('../../../src/config', () => ({
  get allowedIps() { return mockAllowedIps; },
  logLevel: 'error',
  nodeEnv: 'test',
}));

jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('IP Whitelist Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { ip: '10.0.0.1', socket: { remoteAddress: '10.0.0.1' } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.resetModules();
  });

  function loadMiddleware() {
    // Re-require to pick up the current mockAllowedIps
    jest.resetModules();
    return require('../../../src/middleware/ipWhitelist');
  }

  test('localhost-only when allowlist is empty (blocks external IPs)', () => {
    mockAllowedIps = [];
    const ipWhitelist = loadMiddleware();

    req.ip = '10.0.0.1';
    ipWhitelist(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('localhost-only when allowlist is empty (allows loopback)', () => {
    mockAllowedIps = [];
    const ipWhitelist = loadMiddleware();

    req.ip = '127.0.0.1';
    ipWhitelist(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('allows all IPs when 0.0.0.0 is in allowlist', () => {
    mockAllowedIps = ['0.0.0.0'];
    const ipWhitelist = loadMiddleware();

    req.ip = '203.0.113.50';
    ipWhitelist(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('allows IP within CIDR range', () => {
    mockAllowedIps = ['100.64.0.0/10'];
    const ipWhitelist = loadMiddleware();

    req.ip = '100.100.50.1';
    ipWhitelist(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('allows explicit single IP', () => {
    mockAllowedIps = ['192.168.64.1'];
    const ipWhitelist = loadMiddleware();

    req.ip = '192.168.64.1';
    ipWhitelist(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('blocks IP not in allowlist with 403', () => {
    mockAllowedIps = ['192.168.64.1'];
    const ipWhitelist = loadMiddleware();

    req.ip = '10.0.0.99';
    ipWhitelist(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'IP_NOT_ALLOWED' }),
      })
    );
  });

  test('always allows loopback 127.0.0.1', () => {
    mockAllowedIps = ['192.168.64.1'];
    const ipWhitelist = loadMiddleware();

    req.ip = '127.0.0.1';
    ipWhitelist(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('always allows loopback ::1', () => {
    mockAllowedIps = ['192.168.64.1'];
    const ipWhitelist = loadMiddleware();

    req.ip = '::1';
    ipWhitelist(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('always allows IPv4-mapped loopback ::ffff:127.0.0.1', () => {
    mockAllowedIps = ['192.168.64.1'];
    const ipWhitelist = loadMiddleware();

    req.ip = '::ffff:127.0.0.1';
    ipWhitelist(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('always allows Docker bridge gateway (172.x.x.x)', () => {
    mockAllowedIps = ['192.168.64.1'];
    const ipWhitelist = loadMiddleware();

    req.ip = '::ffff:172.20.0.1';
    ipWhitelist(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('handles IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)', () => {
    mockAllowedIps = ['192.168.64.1'];
    const ipWhitelist = loadMiddleware();

    req.ip = '::ffff:192.168.64.1';
    ipWhitelist(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('blocks IPv4-mapped IPv6 when underlying IP not allowed', () => {
    mockAllowedIps = ['192.168.64.1'];
    const ipWhitelist = loadMiddleware();

    req.ip = '::ffff:10.0.0.99';
    ipWhitelist(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
