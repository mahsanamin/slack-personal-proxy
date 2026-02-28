const config = require('../config');
const logger = require('../utils/logger');
const { CACHE_PREFIXES } = require('../utils/constants');

class UserService {
  constructor(slackClient, cacheService, paginationService) {
    this.slack = slackClient;
    this.cache = cacheService;
    this.pagination = paginationService;
  }

  async listUsers(includeDeleted = false, includeBots = false) {
    const cacheKey = `${CACHE_PREFIXES.USER_LIST}:${includeDeleted}:${includeBots}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    logger.info('Fetching all users (paginated)');
    const result = await this.pagination.fetchAllUsers(this.slack);

    let users = result.items;

    // Filter by default
    if (!includeDeleted) {
      users = users.filter(u => !u.deleted);
    }
    if (!includeBots) {
      users = users.filter(u => !u.is_bot && u.id !== 'USLACKBOT');
    }

    const mapped = users.map(u => ({
      id: u.id,
      name: u.name,
      real_name: u.real_name || '',
      email: u.profile?.email || '',
      is_admin: u.is_admin || false,
      is_owner: u.is_owner || false,
      is_bot: u.is_bot || false,
      deleted: u.deleted || false,
      profile: {
        display_name: u.profile?.display_name || '',
        status_text: u.profile?.status_text || '',
        status_emoji: u.profile?.status_emoji || '',
        avatar_hash: u.profile?.avatar_hash || '',
        image_72: u.profile?.image_72 || '',
      },
      tz: u.tz || '',
      tz_offset: u.tz_offset || 0,
    }));

    const data = {
      users: mapped,
      total_count: mapped.length,
      api_calls_made: result.api_calls,
    };

    this.cache.set(cacheKey, data, config.cache.userTtl);

    return { ...data, cached: false };
  }

  async getUserProfile(userId) {
    const cacheKey = CACHE_PREFIXES.USER_PROFILE + userId;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    logger.info(`Fetching profile for user ${userId}`);
    const user = await this.slack.getUserInfo(userId);

    const data = {
      id: user.id,
      name: user.name,
      real_name: user.real_name || '',
      email: user.profile?.email || '',
      title: user.profile?.title || '',
      phone: user.profile?.phone || '',
      skype: user.profile?.skype || '',
      profile: {
        display_name: user.profile?.display_name || '',
        status_text: user.profile?.status_text || '',
        status_emoji: user.profile?.status_emoji || '',
        first_name: user.profile?.first_name || '',
        last_name: user.profile?.last_name || '',
        fields: user.profile?.fields || {},
      },
      is_admin: user.is_admin || false,
      is_owner: user.is_owner || false,
    };

    this.cache.set(cacheKey, data, config.cache.userTtl);

    return { ...data, cached: false };
  }
  async getUserByEmail(email) {
    const cacheKey = CACHE_PREFIXES.USER_BY_EMAIL + email;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    logger.info(`Looking up user by email: ${email}`);
    const user = await this.slack.lookupUserByEmail(email);
    const dmChannel = await this.slack.openDmChannel(user.id);

    const data = {
      id: user.id,
      name: user.name,
      real_name: user.real_name || '',
      email: user.profile?.email || email,
      dm_channel_id: dmChannel.id,
      profile: {
        display_name: user.profile?.display_name || '',
        status_text: user.profile?.status_text || '',
        status_emoji: user.profile?.status_emoji || '',
        image_72: user.profile?.image_72 || '',
      },
      is_admin: user.is_admin || false,
      is_bot: user.is_bot || false,
      deleted: user.deleted || false,
      tz: user.tz || '',
    };

    this.cache.set(cacheKey, data, config.cache.userTtl);

    return { ...data, cached: false };
  }
}

module.exports = UserService;
