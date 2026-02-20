const config = require('../config');
const logger = require('../utils/logger');
const { CACHE_PREFIXES } = require('../utils/constants');

class ChannelService {
  constructor(slackClient, cacheService, paginationService) {
    this.slack = slackClient;
    this.cache = cacheService;
    this.pagination = paginationService;
  }

  async listChannels() {
    const cached = this.cache.get(CACHE_PREFIXES.CHANNEL_LIST);
    if (cached) {
      return { ...cached, cached: true };
    }

    logger.info('Fetching all channels (paginated)');
    const result = await this.pagination.fetchAllChannels(this.slack);

    const channels = result.items.map(ch => ({
      id: ch.id,
      name: ch.name,
      is_private: ch.is_private || false,
      is_archived: ch.is_archived || false,
      member_count: ch.num_members || 0,
      purpose: ch.purpose || { value: '', creator: '' },
      topic: ch.topic || { value: '', creator: '' },
    }));

    const data = {
      channels,
      total_count: channels.length,
      api_calls_made: result.api_calls,
    };

    this.cache.set(CACHE_PREFIXES.CHANNEL_LIST, data, config.cache.channelTtl);

    return { ...data, cached: false };
  }

  async getChannelInfo(channelId) {
    const cacheKey = CACHE_PREFIXES.CHANNEL_INFO + channelId;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    logger.info(`Fetching channel info for ${channelId}`);
    const channel = await this.slack.getChannelInfo(channelId);

    const data = {
      id: channel.id,
      name: channel.name,
      created: channel.created,
      creator: channel.creator,
      is_private: channel.is_private || false,
      is_archived: channel.is_archived || false,
      is_general: channel.is_general || false,
      member_count: channel.num_members || 0,
      purpose: channel.purpose || {},
      topic: channel.topic || {},
    };

    this.cache.set(cacheKey, data, config.cache.channelTtl);

    return { ...data, cached: false };
  }
}

module.exports = ChannelService;
