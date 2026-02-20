jest.mock('../../../src/config', () => ({
  apiKey: 'test-secret-key-12345',
  logLevel: 'error',
  nodeEnv: 'test',
}));

jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const authMiddleware = require('../../../src/middleware/auth');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  test('returns 401 when X-API-Key header is missing', () => {
    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'MISSING_API_KEY' }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when API key is wrong', () => {
    req.headers['x-api-key'] = 'wrong-key';

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'INVALID_API_KEY' }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() when API key is correct', () => {
    req.headers['x-api-key'] = 'test-secret-key-12345';

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('uses timing-safe comparison (different length keys do not crash)', () => {
    req.headers['x-api-key'] = 'short';

    // Should not throw even though lengths differ
    expect(() => authMiddleware(req, res, next)).not.toThrow();

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
