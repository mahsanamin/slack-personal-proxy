const config = require('../config');
const logger = require('../utils/logger');
const { ERROR_CODES } = require('../utils/constants');

// Channel IDs start with C, D, G, or W
const CHANNEL_ID_REGEX = /^[CDGW][A-Z0-9]+$/;
const USER_ID_REGEX = /^[UW][A-Z0-9]+$/;

class WhitelistService {
  constructor(slackClient, paginationService) {
    this.slack = slackClient;
    this.pagination = paginationService;

    // Resolved maps: name -> id, id -> name
    this.channelNameToId = new Map();
    this.channelIdToName = new Map();
    this.userNameToId = new Map();
    this.userIdToName = new Map();

    // Parsed whitelist entries
    this.readChannelEntries = config.whitelist.readChannels;
    this.writeChannelEntries = config.whitelist.writeChannels;
    this.dmUserEntries = config.whitelist.dmUsers;

    // Resolved ID sets (populated after initialize)
    this.readChannelIds = new Set();
    this.writeChannelIds = new Set();
    this.dmUserIds = new Set();

    this.enforceRead = this.readChannelEntries.length > 0;
    this.enforceWrite = this.writeChannelEntries.length > 0;
    this.enforceDm = this.dmUserEntries.length > 0;
  }

  async initialize() {
    // Build lookup maps using full pagination
    if (this.enforceRead || this.enforceWrite) {
      await this._resolveChannels();
    }
    if (this.enforceDm) {
      await this._resolveUsers();
    }

    // Resolve whitelist entries to IDs
    for (const entry of this.readChannelEntries) {
      const id = this._resolveChannelEntry(entry);
      if (id) this.readChannelIds.add(id);
      else logger.warn(`Could not resolve read channel: ${entry}`);
    }
    for (const entry of this.writeChannelEntries) {
      const id = this._resolveChannelEntry(entry);
      if (id) this.writeChannelIds.add(id);
      else logger.warn(`Could not resolve write channel: ${entry}`);
    }
    for (const entry of this.dmUserEntries) {
      const id = this._resolveUserEntry(entry);
      if (id) this.dmUserIds.add(id);
      else logger.warn(`Could not resolve DM user: ${entry}`);
    }

    logger.info(
      `Whitelist initialized: read=${this.readChannelIds.size} channels, ` +
      `write=${this.writeChannelIds.size} channels, dm=${this.dmUserIds.size} users`
    );
  }

  async _resolveChannels() {
    logger.info('Fetching all channels for whitelist resolution...');
    const result = await this.pagination.fetchAllChannels(this.slack);
    for (const ch of result.items) {
      this.channelNameToId.set(ch.name, ch.id);
      this.channelIdToName.set(ch.id, ch.name);
    }
    logger.info(`Resolved ${result.items.length} channels (${result.api_calls} API calls)`);
  }

  async _resolveUsers() {
    logger.info('Fetching all users for whitelist resolution...');
    const result = await this.pagination.fetchAllUsers(this.slack);
    for (const user of result.items) {
      this.userNameToId.set(user.name, user.id);
      this.userIdToName.set(user.id, user.name);
    }
    logger.info(`Resolved ${result.items.length} users (${result.api_calls} API calls)`);
  }

  _resolveChannelEntry(entry) {
    if (CHANNEL_ID_REGEX.test(entry)) return entry;
    return this.channelNameToId.get(entry) || null;
  }

  _resolveUserEntry(entry) {
    if (USER_ID_REGEX.test(entry)) return entry;
    return this.userNameToId.get(entry) || null;
  }

  canReadChannel(channelId) {
    if (!this.enforceRead) return { allowed: true };
    if (this.readChannelIds.has(channelId)) return { allowed: true };
    return {
      allowed: false,
      error: {
        ...ERROR_CODES.CHANNEL_NOT_WHITELISTED,
        details: {
          channel: channelId,
          whitelisted_channels: [...this.readChannelIds],
        },
      },
    };
  }

  canWriteChannel(channelId) {
    if (!this.enforceWrite) return { allowed: true };
    if (this.writeChannelIds.has(channelId)) return { allowed: true };
    return {
      allowed: false,
      error: {
        ...ERROR_CODES.WRITE_CHANNEL_NOT_WHITELISTED,
        details: {
          channel: channelId,
          whitelisted_channels: [...this.writeChannelIds],
        },
      },
    };
  }

  canSendDmToUser(userIdOrName) {
    if (!this.enforceDm) return { allowed: true };
    // Check by ID directly
    if (this.dmUserIds.has(userIdOrName)) return { allowed: true };
    // Check by name -> resolve to ID
    const id = this.userNameToId.get(userIdOrName);
    if (id && this.dmUserIds.has(id)) return { allowed: true };

    return {
      allowed: false,
      error: {
        ...ERROR_CODES.USER_NOT_WHITELISTED,
        details: {
          user: userIdOrName,
          whitelisted_users: [...this.dmUserIds],
        },
      },
    };
  }

  resolveChannelId(nameOrId) {
    if (CHANNEL_ID_REGEX.test(nameOrId)) return nameOrId;
    return this.channelNameToId.get(nameOrId) || null;
  }

  resolveUserId(nameOrId) {
    if (USER_ID_REGEX.test(nameOrId)) return nameOrId;
    return this.userNameToId.get(nameOrId) || null;
  }

  getStatus() {
    return {
      enforce: this.enforceRead || this.enforceWrite || this.enforceDm,
      read_channels: {
        configured: this.enforceRead,
        count: this.readChannelIds.size,
        channels: this.readChannelEntries,
      },
      write_channels: {
        configured: this.enforceWrite,
        count: this.writeChannelIds.size,
        channels: this.writeChannelEntries,
      },
      dm_users: {
        configured: this.enforceDm,
        count: this.dmUserIds.size,
        users: this.dmUserEntries,
      },
    };
  }
}

module.exports = WhitelistService;
