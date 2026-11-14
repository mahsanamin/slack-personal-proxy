const { EventEmitter } = require('events');
const requestLog = require('../../../src/middleware/requestLog');
const { noteSlackCall } = require('../../../src/utils/requestContext');
const logger = require('../../../src/utils/logger');

jest.mock('../../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

function run({ query = {}, apiKey, status = 200, locals = {}, calls = [] }) {
  const req = { method: 'GET', baseUrl: '/api/activity', path: '/threads-im-in', query, ip: '100.1.1.1', apiKey };
  const res = new EventEmitter();
  res.statusCode = status;
  res.locals = locals;
  requestLog(req, res, () => { calls.forEach((m) => noteSlackCall(m)); });
  res.emit('finish');
}

describe('requestLog', () => {
  beforeEach(() => { logger.info.mockClear(); logger.warn.mockClear(); });

  test('logs key label, route, status and how many Slack calls the request caused', () => {
    run({ query: { count: '50' }, apiKey: { label: 'agent-1' }, calls: ['search.messages', 'conversations.replies', 'conversations.replies'] });
    const line = logger.info.mock.calls[0][0];
    expect(line).toContain('GET /api/activity/threads-im-in 200');
    expect(line).toContain('key="agent-1"');
    expect(line).toContain('slack_calls=3');
    expect(line).toContain('conversations.replies:2');
    expect(line).toContain('count=50');
  });

  test('never logs query values other than count', () => {
    run({ query: { query: 'secret salary talk', count: '5' }, apiKey: { label: 'k' } });
    const line = logger.info.mock.calls[0][0];
    expect(line).not.toContain('secret salary talk');
    expect(line).toContain('params=query+count');
  });

  test('a request with no valid key is logged as key none', () => {
    run({ status: 401 });
    expect(logger.info.mock.calls[0][0]).toContain('key="none"');
  });

  test('marks reused and partial answers', () => {
    run({ apiKey: { label: 'k' }, locals: { requestNote: { reused: true, partial: true } } });
    const line = logger.info.mock.calls[0][0];
    expect(line).toContain('reused=true');
    expect(line).toContain('partial=true');
  });

  test('server errors are logged as warnings', () => {
    run({ status: 500, apiKey: { label: 'k' } });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
