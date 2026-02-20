jest.mock('../../../src/config', () => ({
  whitelist: {
    readChannels: ['engineering', 'C12345'],
    writeChannels: ['bot-testing'],
    dmChannels: ['D11111'],
    dmUsers: ['alice', 'U99999'],
  },
  maxPaginationCalls: 10,
  logLevel: 'error',
  nodeEnv: 'test',
}));

jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const WhitelistService = require('../../../src/services/whitelistService');
const PaginationService = require('../../../src/services/paginationService');

describe('WhitelistService', () => {
  let whitelist;
  let mockSlackClient;
  let pagination;

  beforeEach(async () => {
    mockSlackClient = {
      listChannels: jest.fn().mockResolvedValue({
        channels: [
          { id: 'C12345', name: 'engineering' },
          { id: 'C67890', name: 'bot-testing' },
          { id: 'C11111', name: 'general' },
        ],
        next_cursor: null,
      }),
      listUsers: jest.fn().mockResolvedValue({
        users: [
          { id: 'U11111', name: 'alice' },
          { id: 'U99999', name: 'bob' },
          { id: 'U22222', name: 'carol' },
        ],
        next_cursor: null,
      }),
    };

    pagination = new PaginationService();
    whitelist = new WhitelistService(mockSlackClient, pagination);
    await whitelist.initialize();
  });

  test('resolves channel names to IDs during initialization', () => {
    // 'engineering' should resolve to C12345, 'C12345' is already an ID
    expect(whitelist.readChannelIds.has('C12345')).toBe(true);
    expect(whitelist.readChannelIds.size).toBe(1); // Both resolve to same ID
  });

  test('resolves write channels', () => {
    expect(whitelist.writeChannelIds.has('C67890')).toBe(true);
  });

  test('resolves DM users by name and ID', () => {
    expect(whitelist.dmUserIds.has('U11111')).toBe(true); // alice
    expect(whitelist.dmUserIds.has('U99999')).toBe(true); // direct ID
  });

  test('canReadChannel allows whitelisted channel', () => {
    const result = whitelist.canReadChannel('C12345');
    expect(result.allowed).toBe(true);
  });

  test('canReadChannel blocks non-whitelisted channel', () => {
    const result = whitelist.canReadChannel('C99999');
    expect(result.allowed).toBe(false);
    expect(result.error.code).toBe('CHANNEL_NOT_WHITELISTED');
  });

  test('canWriteChannel allows whitelisted channel', () => {
    const result = whitelist.canWriteChannel('C67890');
    expect(result.allowed).toBe(true);
  });

  test('canWriteChannel blocks non-whitelisted channel', () => {
    const result = whitelist.canWriteChannel('C12345');
    expect(result.allowed).toBe(false);
  });

  test('canSendDm allows whitelisted DM channel', () => {
    const result = whitelist.canSendDm('D11111');
    expect(result.allowed).toBe(true);
  });

  test('canSendDm blocks non-whitelisted DM channel', () => {
    const result = whitelist.canSendDm('D99999');
    expect(result.allowed).toBe(false);
    expect(result.error.code).toBe('USER_NOT_WHITELISTED');
  });

  test('canSendDmToUser allows whitelisted user by ID', () => {
    const result = whitelist.canSendDmToUser('U99999');
    expect(result.allowed).toBe(true);
  });

  test('canSendDmToUser allows whitelisted user by name', () => {
    const result = whitelist.canSendDmToUser('alice');
    expect(result.allowed).toBe(true);
  });

  test('canSendDmToUser blocks non-whitelisted user', () => {
    const result = whitelist.canSendDmToUser('carol');
    expect(result.allowed).toBe(false);
    expect(result.error.code).toBe('USER_NOT_WHITELISTED');
  });

  test('getStatus returns whitelist configuration', () => {
    const status = whitelist.getStatus();
    expect(status.enforce).toBe(true);
    expect(status.read_channels.configured).toBe(true);
    expect(status.read_channels.count).toBe(1);
    expect(status.write_channels.configured).toBe(true);
    expect(status.dm_users.configured).toBe(true);
  });

  test('resolveChannelId resolves name to ID', () => {
    expect(whitelist.resolveChannelId('engineering')).toBe('C12345');
    expect(whitelist.resolveChannelId('C12345')).toBe('C12345');
    expect(whitelist.resolveChannelId('nonexistent')).toBeNull();
  });

  test('resolveUserId resolves name to ID', () => {
    expect(whitelist.resolveUserId('alice')).toBe('U11111');
    expect(whitelist.resolveUserId('U99999')).toBe('U99999');
  });
});

describe('WhitelistService (no whitelist configured)', () => {
  let whitelist;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../../src/config', () => ({
      whitelist: { readChannels: [], writeChannels: [], dmChannels: [], dmUsers: [] },
      maxPaginationCalls: 10,
      logLevel: 'error',
      nodeEnv: 'test',
    }));
    jest.doMock('../../../src/utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));
    const WS = require('../../../src/services/whitelistService');
    const PS = require('../../../src/services/paginationService');
    whitelist = new WS({}, new PS());
  });

  test('allows all channels when no whitelist configured', async () => {
    await whitelist.initialize();
    expect(whitelist.canReadChannel('C_ANY').allowed).toBe(true);
    expect(whitelist.canWriteChannel('C_ANY').allowed).toBe(true);
    expect(whitelist.canSendDm('D_ANY').allowed).toBe(true);
    expect(whitelist.canSendDmToUser('U_ANY').allowed).toBe(true);
  });
});
