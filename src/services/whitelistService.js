const config = require('../config');
const logger = require('../utils/logger');
const { ERROR_CODES } = require('../utils/constants');

// Channel IDs start with C, D, G, or W
const CHANNEL_ID_REGEX = /^[CDGW][A-Z0-9]+$/;
const USER_ID_REGEX = /^[UW][A-Z0-9]+$/;
const DM_CHANNEL_ID_REGEX = /^D[A-Z0-9]+$/;

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
    this.writeChannelEntries = config.whitelist.writeChannels;
    this.dmUserEntries = config.whitelist.dmUsers;

    // Resolved ID sets (populated after initialize)
    this.writeChannelIds = new Set();
    this.dmUserIds = new Set();
    this.dmChannelToUserId = new Map();

    this.enforceWrite = this.writeChannelEntries.length > 0;
    this.enforceDm = this.dmUserEntries.length > 0;
  }

  async initialize() {
    // Build lookup maps using full pagination
    if (this.enforceWrite) {
      await this._resolveChannels();
    }
    if (this.dmUserEntries.length > 0) {
      await this._resolveUsers();
    }

    // Resolve whitelist entries to IDs
    for (const entry of this.writeChannelEntries) {
      const id = this._resolveChannelEntry(entry);
      if (id) this.writeChannelIds.add(id);
      else logger.warn(`Could not resolve write channel: ${entry}`);
    }
    for (const entry of this.dmUserEntries) {
      if (DM_CHANNEL_ID_REGEX.test(entry)) {
        const userId = await this._resolveUserIdFromDmChannel(entry);
        if (userId) {
          this.dmUserIds.add(userId);
          this.dmChannelToUserId.set(entry, userId);
        } else {
          logger.warn(`Could not resolve DM channel to user: ${entry}`);
        }
      } else {
        const id = this._resolveUserEntry(entry);
        if (id) this.dmUserIds.add(id);
        else logger.warn(`Could not resolve DM user: ${entry}`);
      }
    }

    logger.info(
      `Whitelist initialized: write=${this.writeChannelIds.size} channels, ` +
      `dm=${this.dmUserIds.size} users`
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

  async _resolveUserIdFromDmChannel(dmChannelId) {
    try {
      const channel = await this.slack.getChannelInfo(dmChannelId);
      if (channel && channel.user) {
        logger.info(`Resolved DM channel ${dmChannelId} to user ${channel.user}`);
        return channel.user;
      }
      return null;
    } catch (err) {
      logger.error(`Failed to resolve DM channel ${dmChannelId}: ${err.message}`);
      return null;
    }
  }

  async resolveUserIdFromDmChannel(dmChannelId) {
    if (this.dmChannelToUserId.has(dmChannelId)) {
      return this.dmChannelToUserId.get(dmChannelId);
    }
    const userId = await this._resolveUserIdFromDmChannel(dmChannelId);
    if (userId) {
      this.dmChannelToUserId.set(dmChannelId, userId);
    }
    return userId;
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
      enforce: this.enforceWrite || this.enforceDm,
      write_channels: {
        configured: this.enforceWrite,
        count: this.writeChannelIds.size,
        channels: this.writeChannelEntries,
      },
      dm_users: {
        configured: this.dmUserEntries.length > 0,
        count: this.dmUserIds.size,
        users: this.dmUserEntries,
      },
    };
  }
}

module.exports = WhitelistService;
