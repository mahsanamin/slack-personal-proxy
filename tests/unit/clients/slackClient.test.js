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
