const ChannelService = require('../../../src/services/channelService');
const CacheService = require('../../../src/services/cacheService');

jest.mock('../../../src/config', () => ({
  enableCaching: true,
  logLevel: 'error',
  nodeEnv: 'test',
  cache: { channelTtl: 300, channelListTtl: 43200 },
}));

jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const ITEMS = [
  { id: 'C1', name: 'general', num_members: 3 },
  { id: 'C2', name: 'secret', is_private: true, num_members: 1 },
];

function memoryStore(initial = null) {
  let entry = initial;
  return {
    read: jest.fn(() => entry),
    write: jest.fn((e) => { entry = e; }),
  };
}

function build({ store = memoryStore(), fetchAllChannels } = {}) {
  const pagination = { fetchAllChannels: fetchAllChannels || jest.fn(async () => ({ items: ITEMS, api_calls: 1 })) };
  const service = new ChannelService({}, new CacheService(), pagination, {}, store);
  return { service, pagination, store };
}

const FULL = { unrestricted: true, canWrite: true, readable: null };

describe('ChannelService channel list cache', () => {
  test('crawls once, then serves from memory', async () => {
    const { service, pagination } = build();
    const first = await service.listChannels(FULL);
    const second = await service.listChannels(FULL);
    expect(pagination.fetchAllChannels).toHaveBeenCalledTimes(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.channels).toHaveLength(2);
  });

  test('saves the list to disk and a new service reuses it without calling Slack', async () => {
    const store = memoryStore();
    await build({ store }).service.listChannels(FULL);
    expect(store.write).toHaveBeenCalledTimes(1);

    const restarted = build({ store });
    const result = await restarted.service.listChannels(FULL);
    expect(restarted.pagination.fetchAllChannels).not.toHaveBeenCalled();
    expect(result.cached).toBe(true);
    expect(result.channels).toHaveLength(2);
  });

  test('ignores a saved list older than the TTL', async () => {
    const old = { fetched_at: Date.now() - 43200 * 1000 - 5000, data: { channels: [{ id: 'COLD', name: 'old' }] } };
    const { service, pagination } = build({ store: memoryStore(old) });
    const result = await service.listChannels(FULL);
    expect(pagination.fetchAllChannels).toHaveBeenCalledTimes(1);
    expect(result.channels.map((c) => c.id)).toEqual(['C1', 'C2']);
  });

  test('refresh asks Slack again even when a fresh list is saved', async () => {
    const { service, pagination } = build();
    await service.listChannels(FULL);
    await service.listChannels(FULL, { refresh: true });
    expect(pagination.fetchAllChannels).toHaveBeenCalledTimes(2);
  });

  test('concurrent callers share one crawl', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const fetchAllChannels = jest.fn(async () => { await gate; return { items: ITEMS, api_calls: 1 }; });
    const { service } = build({ fetchAllChannels });
    const calls = [service.listChannels(FULL), service.listChannels(FULL, { refresh: true }), service.listChannels(FULL, { refresh: true })];
    release();
    await Promise.all(calls);
    expect(fetchAllChannels).toHaveBeenCalledTimes(1);
  });

  test('a failed refresh serves the older saved list and marks it stale', async () => {
    const saved = { fetched_at: Date.now() - 1000, data: { channels: [{ id: 'CSAVED', name: 'saved' }] } };
    const fetchAllChannels = jest.fn(async () => { throw new Error('ratelimited'); });
    const { service } = build({ store: memoryStore(saved), fetchAllChannels });
    const result = await service.listChannels(FULL, { refresh: true });
    expect(result.stale).toBe(true);
    expect(result.channels.map((c) => c.id)).toEqual(['CSAVED']);
  });

  test('a failed crawl with nothing saved still throws', async () => {
    const fetchAllChannels = jest.fn(async () => { throw new Error('ratelimited'); });
    const { service } = build({ fetchAllChannels });
    await expect(service.listChannels(FULL)).rejects.toThrow('ratelimited');
  });

  test('a failed crawl does not leave the next call stuck on it', async () => {
    const fetchAllChannels = jest.fn()
      .mockRejectedValueOnce(new Error('ratelimited'))
      .mockResolvedValueOnce({ items: ITEMS, api_calls: 1 });
    const { service } = build({ fetchAllChannels });
    await expect(service.listChannels(FULL)).rejects.toThrow();
    const result = await service.listChannels(FULL);
    expect(result.channels).toHaveLength(2);
  });

  test('a scoped key still only sees its channels from the saved list', async () => {
    const { service } = build();
    const scoped = { unrestricted: false, canWrite: false, readable: new Set(['C1']) };
    const result = await service.listChannels(scoped);
    expect(result.channels.map((c) => c.id)).toEqual(['C1']);
  });
});
