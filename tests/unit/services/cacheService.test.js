const CacheService = require('../../../src/services/cacheService');

// Mock config
jest.mock('../../../src/config', () => ({
  enableCaching: true,
  logLevel: 'error',
  nodeEnv: 'test',
}));

jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('CacheService', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheService();
  });

  afterEach(() => {
    cache.flush();
  });

  test('get/set/del basic operations', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');

    cache.del('key1');
    expect(cache.get('key1')).toBeUndefined();
  });

  test('returns undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  test('has() checks key existence', () => {
    cache.set('exists', 'yes');
    expect(cache.has('exists')).toBe(true);
    expect(cache.has('nope')).toBe(false);
  });

  test('flush clears all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.flush();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  test('getStats returns statistics', () => {
    cache.set('x', 'y');
    cache.get('x');
    cache.get('missing');
    const stats = cache.getStats();
    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
  });

  test('useClones prevents mutation of cached objects', () => {
    const original = { nested: { value: 1 } };
    cache.set('obj', original);

    // Mutate the retrieved value
    const retrieved = cache.get('obj');
    retrieved.nested.value = 999;

    // Original cached value should be unaffected
    const fresh = cache.get('obj');
    expect(fresh.nested.value).toBe(1);
  });
});

describe('CacheService (disabled)', () => {
  let cache;

  beforeEach(() => {
    // Override the mock for this suite
    jest.resetModules();
    jest.doMock('../../../src/config', () => ({
      enableCaching: false,
      logLevel: 'error',
      nodeEnv: 'test',
    }));
    jest.doMock('../../../src/utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));
    const CS = require('../../../src/services/cacheService');
    cache = new CS();
  });

  test('get returns undefined when caching disabled', () => {
    cache.set('key', 'value');
    expect(cache.get('key')).toBeUndefined();
  });

  test('has returns false when caching disabled', () => {
    expect(cache.has('anything')).toBe(false);
  });

  test('set returns false when caching disabled', () => {
    expect(cache.set('key', 'value')).toBe(false);
  });

  test('del returns 0 when caching disabled', () => {
    expect(cache.del('key')).toBe(0);
  });
});
