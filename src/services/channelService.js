const config = require('../config');
const logger = require('../utils/logger');
const { CACHE_PREFIXES } = require('../utils/constants');
const { isScoped, canRead } = require('./keyAccess');

class ChannelService {
  constructor(slackClient, cacheService, paginationService, whitelistService, listStore = null, memberStore = null) {
    this.slack = slackClient;
    this.cache = cacheService;
    this.pagination = paginationService;
    this.whitelist = whitelistService;
    // Optional disk copies of the two lists. Left out in tests.
    this.listStore = listStore;
    this.memberStore = memberStore;
    // The fetch in progress for each list, if any. Callers that arrive meanwhile wait for it.
    this._inflight = { all: null, member: null };
  }

  // The cache holds the full channel list for everyone. Key scope is applied after it
  // is read, so the cache never stores anything per key.
  // refresh: true skips the saved list and asks Slack again.
  async listChannels(access, { refresh = false } = {}) {
    const data = await this._loadChannelList({ refresh });
    if (!isScoped(access)) return data;

    const channels = data.channels.filter((ch) => canRead(access, ch.id));
    return { ...data, channels, total_count: channels.length };
  }

  // Only the channels the Slack account belongs to. Slack answers this quickly (a few
  // calls), unlike the full workspace list, so the dashboard picker starts from it.
  async listMemberChannels({ refresh = false } = {}) {
    return this._cachedList({
      slot: 'member',
      cacheKey: CACHE_PREFIXES.MEMBER_CHANNEL_LIST,
      store: this.memberStore,
      refresh,
      fetchItems: () => this.pagination.fetchMemberChannels(this.slack),
      label: 'your channels',
    });
  }

  // The saved full workspace list if there is one, however old. Never calls Slack.
  peekChannelList() {
    const cached = this.cache.get(CACHE_PREFIXES.CHANNEL_LIST);
    const saved = cached ? { fetched_at: cached.fetched_at, data: cached } : (this.listStore && this.listStore.read());
    if (!saved) return null;
    const fresh = Date.now() - saved.fetched_at < config.cache.channelListTtl * 1000;
    return { ...saved.data, fetched_at: saved.fetched_at, fresh };
  }

  isFullListLoading() {
    return Boolean(this._inflight.all);
  }

  // Builds the full workspace list in the background without making anyone wait.
  // Does nothing when a fresh list is saved or a crawl is already running. force asks
  // for a rebuild anyway, but only if the saved list is over an hour old.
  warmChannelList({ force = false } = {}) {
    const current = this.peekChannelList();
    const old = current && Date.now() - current.fetched_at > 3600 * 1000;
    const needed = !current || !current.fresh || (force && old);
    if (!needed || this._inflight.all) return;
    this._loadChannelList({ refresh: Boolean(current) }).catch((err) => {
      logger.warn(`Background channel list build failed: ${err.message}`);
    });
  }

  _loadChannelList({ refresh = false } = {}) {
    return this._cachedList({
      slot: 'all',
      cacheKey: CACHE_PREFIXES.CHANNEL_LIST,
      store: this.listStore,
      refresh,
      fetchItems: () => this.pagination.fetchAllChannels(this.slack),
      label: 'all channels',
    });
  }

  // Memory copy, then disk copy, then Slack. One fetch per list at a time, because Slack
  // limits these methods and parallel fetches only slow each other down. If Slack fails
  // and an older disk copy exists, that copy is returned and marked stale.
  async _cachedList({ slot, cacheKey, store, refresh, fetchItems, label }) {
    const ttlMs = config.cache.channelListTtl * 1000;

    if (!refresh) {
      const cached = this.cache.get(cacheKey);
      if (cached) return { ...cached, cached: true };

      const saved = store && store.read();
      if (saved && Date.now() - saved.fetched_at < ttlMs) {
        const remaining = Math.max(1, Math.round((ttlMs - (Date.now() - saved.fetched_at)) / 1000));
        this.cache.set(cacheKey, saved.data, remaining);
        return { ...saved.data, cached: true };
      }
    }

    if (!this._inflight[slot]) {
      this._inflight[slot] = this._fetchList({ cacheKey, store, ttlMs, fetchItems, label })
        .finally(() => { this._inflight[slot] = null; });
    }
    return this._inflight[slot];
  }

  async _fetchList({ cacheKey, store, ttlMs, fetchItems, label }) {
    logger.info(`Fetching ${label} (paginated)`);
    try {
      const result = await fetchItems();

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

      this.cache.set(cacheKey, data, Math.round(ttlMs / 1000));
      if (store) store.write({ fetched_at: data.fetched_at, data });

      return { ...data, cached: false };
    } catch (err) {
      const saved = store && store.read();
      if (saved) {
        logger.warn(`Refreshing ${label} failed (${err.message}); serving the saved list from ${new Date(saved.fetched_at).toISOString()}`);
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
