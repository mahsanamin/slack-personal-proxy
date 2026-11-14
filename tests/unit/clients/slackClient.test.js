const SlackClient = require('../../../src/clients/slackClient');

describe('SlackClient request throttling', () => {
  test('a failed request does not poison every later queued request', async () => {
    const client = new SlackClient();
    client._throttleMs = 0;

    await expect(client._throttle(async () => {
      throw new Error('not_allowed_token_type');
    })).rejects.toThrow('not_allowed_token_type');

    await expect(client._throttle(async () => 'next request reached Slack')).resolves.toBe(
      'next request reached Slack'
    );
  });
});

describe('SlackClient per-method queues', () => {
  test('a slow call on one Slack method does not hold up another method', async () => {
    const client = new SlackClient();
    client._throttleMs = 0;
    let release;
    const gate = new Promise((r) => { release = r; });

    const slow = client._throttle(async () => { await gate; return 'replies'; }, 'conversations.replies');
    const other = await client._throttle(async () => 'search', 'search.messages');
    expect(other).toBe('search');

    release();
    await expect(slow).resolves.toBe('replies');
  });

  test('calls to the same method still run one at a time, in order', async () => {
    const client = new SlackClient();
    client._throttleMs = 0;
    const order = [];
    const a = client._throttle(async () => { await new Promise((r) => setTimeout(r, 20)); order.push('a'); }, 'm');
    const b = client._throttle(async () => { order.push('b'); }, 'm');
    await Promise.all([a, b]);
    expect(order).toEqual(['a', 'b']);
  });

  test('enrichSearchMatches stops looking up reply counts once the deadline has passed', async () => {
    const client = new SlackClient();
    client.getMessage = jest.fn(async () => ({ ts: '1.1', reply_count: 3 }));
    const matches = [
      { ts: '1.1', permalink: 'https://x/archives/C1/p1?thread_ts=1.1', channel: { id: 'C1' } },
      { ts: '2.2', permalink: 'https://x/archives/C1/p2?thread_ts=2.2', channel: { id: 'C1' } },
    ];
    const result = await client.enrichSearchMatches(matches, { fetchReplyCounts: true, deadline: Date.now() - 1 });
    expect(client.getMessage).not.toHaveBeenCalled();
    expect(result.partial).toBe(true);
    expect(result.matches).toHaveLength(2);
  });
});
