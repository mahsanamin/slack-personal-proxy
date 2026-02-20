const PaginationService = require('../../../src/services/paginationService');

jest.mock('../../../src/config', () => ({
  maxPaginationCalls: 10,
  logLevel: 'error',
  nodeEnv: 'test',
}));

jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('PaginationService', () => {
  let pagination;

  beforeEach(() => {
    pagination = new PaginationService();
  });

  test('fetchAll collects items from multiple pages', async () => {
    let callNum = 0;
    const apiFn = async () => {
      callNum++;
      if (callNum === 1) return { items: ['a', 'b'], next_cursor: 'cursor1' };
      if (callNum === 2) return { items: ['c', 'd'], next_cursor: 'cursor2' };
      return { items: ['e'], next_cursor: '' };
    };

    const result = await pagination.fetchAll(apiFn);

    expect(result.items).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.api_calls).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.total_count).toBe(5);
  });

  test('fetchAll respects maxCalls limit', async () => {
    const apiFn = async () => ({ items: ['x'], next_cursor: 'more' });

    const result = await pagination.fetchAll(apiFn, 3);

    // Should make 3 calls then stop
    expect(result.api_calls).toBe(3);
    expect(result.truncated).toBe(true);
    expect(result.items).toHaveLength(3);
  });

  test('fetchAll handles single page results', async () => {
    const apiFn = async () => ({ items: [1, 2, 3], next_cursor: null });

    const result = await pagination.fetchAll(apiFn);

    expect(result.items).toEqual([1, 2, 3]);
    expect(result.api_calls).toBe(1);
    expect(result.truncated).toBe(false);
  });

  test('fetchAll handles different response key names', async () => {
    const apiFn = async () => ({ channels: [{ id: 'C1' }], next_cursor: null });

    const result = await pagination.fetchAll(apiFn);

    expect(result.items).toEqual([{ id: 'C1' }]);
  });

  test('fetchAllReplies removes parent message', async () => {
    const mockSlackClient = {
      getThreadReplies: jest.fn()
        .mockResolvedValueOnce({
          messages: [
            { ts: '1000.000', text: 'parent' },
            { ts: '1000.001', text: 'reply1' },
          ],
          next_cursor: null,
        }),
    };

    const result = await pagination.fetchAllReplies(mockSlackClient, 'C123', '1000.000');

    expect(result.items).toEqual([{ ts: '1000.001', text: 'reply1' }]);
    expect(result.total_count).toBe(1);
  });

  test('fetchAllChannels calls slackClient.listChannels', async () => {
    const mockSlackClient = {
      listChannels: jest.fn().mockResolvedValue({
        channels: [{ id: 'C1', name: 'general' }],
        next_cursor: null,
      }),
    };

    const result = await pagination.fetchAllChannels(mockSlackClient);

    expect(result.items).toEqual([{ id: 'C1', name: 'general' }]);
    expect(mockSlackClient.listChannels).toHaveBeenCalled();
  });

  test('fetchAllUsers calls slackClient.listUsers', async () => {
    const mockSlackClient = {
      listUsers: jest.fn().mockResolvedValue({
        users: [{ id: 'U1', name: 'alice' }],
        next_cursor: null,
      }),
    };

    const result = await pagination.fetchAllUsers(mockSlackClient);

    expect(result.items).toEqual([{ id: 'U1', name: 'alice' }]);
    expect(mockSlackClient.listUsers).toHaveBeenCalled();
  });
});
