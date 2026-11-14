const MentionService = require('../../../src/services/mentionService');
const ActivityService = require('../../../src/services/activityService');

// A budget of 0 means the time limit has always passed.
jest.mock('../../../src/config', () => ({ requestBudgetMs: 0, enableCaching: true, logLevel: 'error', nodeEnv: 'test' }));
jest.mock('../../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const FULL = { unrestricted: true, canWrite: true, readable: null };

function slackWith(matches) {
  return {
    currentUserId: 'U1',
    searchMessages: jest.fn(async () => ({ messages: matches, total: matches.length })),
    enrichSearchMatches: jest.fn(async (m) => ({ matches: m.map((x) => ({ ...x, thread_ts: x.ts, reply_count: 0 })), apiCalls: 0, partial: false })),
  };
}

describe('request time limit', () => {
  test('mention threads past the limit are left out and the answer is marked partial', async () => {
    const messageService = { getCompleteThread: jest.fn() };
    const matches = [{ ts: '1.1', channel: { id: 'C1', name: 'a' }, text: 'hi', user: 'U2' }];
    const service = new MentionService(slackWith(matches), {}, messageService, {});
    const result = await service.getMentionThreads(5, FULL);
    expect(messageService.getCompleteThread).not.toHaveBeenCalled();
    expect(result.partial).toBe(true);
    expect(result.threads).toHaveLength(0);
  });

  test('threads-im-in past the limit are left out and the answer is marked partial', async () => {
    const messageService = { getCompleteThread: jest.fn() };
    const matches = [{ ts: '2.2', channel: { id: 'C1', name: 'a' }, text: 'hi' }];
    const slack = slackWith(matches);
    // Make the match look like a reply inside a thread.
    slack.enrichSearchMatches = jest.fn(async (m) => ({ matches: m.map((x) => ({ ...x, thread_ts: '1.1' })), apiCalls: 0 }));
    const service = new ActivityService(slack, {}, messageService, {});
    const result = await service.getThreadsImIn(5, FULL);
    expect(messageService.getCompleteThread).not.toHaveBeenCalled();
    expect(result.partial).toBe(true);
  });

  test('my-threads past the limit keep the thread basics but skip replies', async () => {
    const messageService = { getCompleteThread: jest.fn() };
    const matches = [{ ts: '3.3', channel: { id: 'C1', name: 'a' }, text: 'parent' }];
    const slack = slackWith(matches);
    slack.enrichSearchMatches = jest.fn(async (m) => ({ matches: m.map((x) => ({ ...x, thread_ts: x.ts, reply_count: 2 })), apiCalls: 0, partial: false }));
    const service = new ActivityService(slack, {}, messageService, {});
    const result = await service.getMyThreads(5, true, FULL);
    expect(messageService.getCompleteThread).not.toHaveBeenCalled();
    expect(result.partial).toBe(true);
    expect(result.threads).toHaveLength(1);
  });
});
