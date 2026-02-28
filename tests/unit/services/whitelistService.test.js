jest.mock('../../../src/config', () => ({
  whitelist: {
    writeChannels: ['bot-testing'],
    dmUsers: ['alice', 'U99999', 'D11111111'],
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
      getChannelInfo: jest.fn().mockResolvedValue({
        id: 'D11111111',
        user: 'U33333',
        is_im: true,
      }),
    };

    pagination = new PaginationService();
    whitelist = new WhitelistService(mockSlackClient, pagination);
    await whitelist.initialize();
  });

  test('resolves write channels', () => {
    expect(whitelist.writeChannelIds.has('C67890')).toBe(true);
  });

  test('resolves DM users by name and ID', () => {
    expect(whitelist.dmUserIds.has('U11111')).toBe(true); // alice
    expect(whitelist.dmUserIds.has('U99999')).toBe(true); // direct ID
  });

  test('canWriteChannel allows whitelisted channel', () => {
    const result = whitelist.canWriteChannel('C67890');
    expect(result.allowed).toBe(true);
  });

  test('canWriteChannel blocks non-whitelisted channel', () => {
    const result = whitelist.canWriteChannel('C12345');
    expect(result.allowed).toBe(false);
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

  test('resolves DM channel ID (D-prefix) to user ID', () => {
    expect(whitelist.dmUserIds.has('U33333')).toBe(true);
  });

  test('resolveUserIdFromDmChannel returns cached user ID', async () => {
    const userId = await whitelist.resolveUserIdFromDmChannel('D11111111');
    expect(userId).toBe('U33333');
  });

  test('resolveUserIdFromDmChannel fetches from API for unknown channel', async () => {
    mockSlackClient.getChannelInfo.mockResolvedValueOnce({
      id: 'D99999999',
      user: 'U44444',
      is_im: true,
    });
    const userId = await whitelist.resolveUserIdFromDmChannel('D99999999');
    expect(userId).toBe('U44444');
  });

  test('getStatus returns whitelist configuration', () => {
    const status = whitelist.getStatus();
    expect(status.enforce).toBe(true);
    expect(status.write_channels.configured).toBe(true);
    expect(status.dm_users.configured).toBe(true);
    expect(status).not.toHaveProperty('read_channels');
    expect(status).not.toHaveProperty('dm_channels');
  });

  test('resolveChannelId resolves name to ID', () => {
    expect(whitelist.resolveChannelId('bot-testing')).toBe('C67890');
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
      whitelist: { writeChannels: [], dmUsers: [] },
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

  test('allows all operations when no whitelist configured', async () => {
    await whitelist.initialize();
    expect(whitelist.canWriteChannel('C_ANY').allowed).toBe(true);
    expect(whitelist.canSendDmToUser('U_ANY').allowed).toBe(true);
  });
});
