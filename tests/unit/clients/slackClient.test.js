jest.mock('../../../src/config', () => ({
  slackThrottleMs: 1,
  logLevel: 'error',
  nodeEnv: 'test',
  slack: {},
}));

jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const SlackClient = require('../../../src/clients/slackClient');

describe('SlackClient._throttle', () => {
  let client;

  beforeEach(() => {
    client = new SlackClient();
  });

  it('returns the resolved value of the wrapped call', async () => {
    await expect(client._throttle(async () => 'ok')).resolves.toBe('ok');
  });

  it('propagates the wrapped call error to that caller', async () => {
    const err = Object.assign(new Error('boom'), { data: { error: 'message_not_found' } });
    await expect(client._throttle(async () => { throw err; })).rejects.toBe(err);
  });

  // Regression: a single failing call used to leave _requestQueue permanently
  // rejected, so every later call chained .then() onto a rejected promise, its
  // handler never ran, and the ORIGINAL error was re-thrown without contacting
  // Slack. That took down every endpoint until the process restarted.
  it('does not poison later calls after one failure', async () => {
    const err = Object.assign(new Error('boom'), { data: { error: 'message_not_found' } });

    await expect(client._throttle(async () => { throw err; })).rejects.toBe(err);

    const after = jest.fn().mockResolvedValue('still working');
    await expect(client._throttle(after)).resolves.toBe('still working');
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('keeps working after many consecutive failures', async () => {
    const err = Object.assign(new Error('boom'), { data: { error: 'message_not_found' } });

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await expect(client._throttle(async () => { throw err; })).rejects.toBe(err);
    }

    await expect(client._throttle(async () => 'alive')).resolves.toBe('alive');
  });

  it('still runs queued calls when an earlier queued call rejects', async () => {
    const err = new Error('boom');
    const failing = client._throttle(async () => { throw err; });
    const following = client._throttle(async () => 'second');

    await expect(failing).rejects.toBe(err);
    await expect(following).resolves.toBe('second');
  });

  it('serializes calls in order', async () => {
    const order = [];
    await Promise.all([
      client._throttle(async () => { order.push(1); }),
      client._throttle(async () => { order.push(2); }),
      client._throttle(async () => { order.push(3); }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
});
