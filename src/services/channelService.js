const config = require('../config');
const logger = require('../utils/logger');
const { CACHE_PREFIXES } = require('../utils/constants');
const { isScoped, canRead } = require('./keyAccess');

class ChannelService {
  constructor(slackClient, cacheService, paginationService, whitelistService, listStore = null) {
    this.slack = slackClient;
    this.cache = cacheService;
    this.pagination = paginationService;
    this.whitelist = whitelistService;
    // Optional disk copy of the channel list. Left out in tests.
    this.listStore = listStore;
    // The crawl in progress, if any. Every caller that arrives meanwhile waits for it.
    this._inflight = null;
  }

  // The cache holds the full channel list for everyone. Key scope is applied after it
  // is read, so the cache never stores anything per key.
  // refresh: true skips the saved list and asks Slack again (the dashboard button).
  async listChannels(access, { refresh = false } = {}) {
    const data = await this._loadChannelList({ refresh });
    if (!isScoped(access)) return data;

    const channels = data.channels.filter((ch) => canRead(access, ch.id));
    return { ...data, channels, total_count: channels.length };
  }

  async _loadChannelList({ refresh = false } = {}) {
    const ttlMs = config.cache.channelListTtl * 1000;

    if (!refresh) {
      const cached = this.cache.get(CACHE_PREFIXES.CHANNEL_LIST);
      if (cached) return { ...cached, cached: true };

      const saved = this.listStore && this.listStore.read();
      if (saved && Date.now() - saved.fetched_at < ttlMs) {
        const remaining = Math.max(1, Math.round((ttlMs - (Date.now() - saved.fetched_at)) / 1000));
        this.cache.set(CACHE_PREFIXES.CHANNEL_LIST, saved.data, remaining);
        return { ...saved.data, cached: true };
      }
    }

    // One crawl at a time. Slack limits conversations.list, so parallel crawls only
    // make each other slower.
    if (!this._inflight) {
      this._inflight = this._crawl(ttlMs).finally(() => { this._inflight = null; });
    }
    return this._inflight;
  }

  async _crawl(ttlMs) {
    logger.info('Fetching all channels (paginated)');
    try {
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
        // True when the workspace has more channels than the directory page cap allows.
        truncated: Boolean(result.truncated),
        api_calls_made: result.api_calls,
        fetched_at: Date.now(),
      };

      this.cache.set(CACHE_PREFIXES.CHANNEL_LIST, data, Math.round(ttlMs / 1000));
      if (this.listStore) this.listStore.write({ fetched_at: data.fetched_at, data });

      return { ...data, cached: false };
    } catch (err) {
      // Slack failed or kept rate limiting. An older saved list is better than none.
      const saved = this.listStore && this.listStore.read();
      if (saved) {
        logger.warn(`Channel refresh failed (${err.message}); serving the saved list from ${new Date(saved.fetched_at).toISOString()}`);
        return { ...saved.data, cached: true, stale: true };
      }
      throw err;
    }
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
