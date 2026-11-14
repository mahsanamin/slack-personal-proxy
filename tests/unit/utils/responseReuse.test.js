const { reuse } = require('../../../src/utils/responseReuse');
const CacheService = require('../../../src/services/cacheService');

jest.mock('../../../src/config', () => ({ enableCaching: true, logLevel: 'error', nodeEnv: 'test' }));
jest.mock('../../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

describe('responseReuse', () => {
  test('second identical ask within the window is answered from the saved result', async () => {
    const cache = new CacheService();
    const compute = jest.fn(async () => ({ n: 1 }));
    const first = await reuse(cache, ['a', 1], 45, compute);
    const second = await reuse(cache, ['a', 1], 45, compute);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.value).toEqual({ n: 1 });
  });

  test('a different question is computed separately', async () => {
    const cache = new CacheService();
    const compute = jest.fn(async () => ({ n: 1 }));
    await reuse(cache, ['a', 1], 45, compute);
    await reuse(cache, ['a', 2], 45, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  test('callers that arrive while the work is running share it', async () => {
    const cache = new CacheService();
    let release;
    const gate = new Promise((r) => { release = r; });
    const compute = jest.fn(async () => { await gate; return { n: 1 }; });
    const calls = [reuse(cache, ['b'], 45, compute), reuse(cache, ['b'], 45, compute), reuse(cache, ['b'], 45, compute)];
    release();
    const results = await Promise.all(calls);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.reused)).toHaveLength(2);
  });

  test('ttl 0 turns saving off but still shares work in progress', async () => {
    const cache = new CacheService();
    const compute = jest.fn(async () => ({ n: 1 }));
    await reuse(cache, ['c'], 0, compute);
    await reuse(cache, ['c'], 0, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  test('a partial result is not kept, so the next ask can finish it', async () => {
    const cache = new CacheService();
    const compute = jest.fn(async () => ({ partial: true }));
    await reuse(cache, ['d'], 45, compute);
    await reuse(cache, ['d'], 45, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  test('a failure is not kept and the next ask tries again', async () => {
    const cache = new CacheService();
    const compute = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ n: 2 });
    await expect(reuse(cache, ['e'], 45, compute)).rejects.toThrow('boom');
    const again = await reuse(cache, ['e'], 45, compute);
    expect(again.value).toEqual({ n: 2 });
  });
});
