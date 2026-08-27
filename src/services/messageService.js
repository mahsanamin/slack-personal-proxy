const config = require('../config');
const logger = require('../utils/logger');
const { CACHE_PREFIXES, ERROR_CODES } = require('../utils/constants');
const configStore = require('./configStore');

class MessageService {
  constructor(slackClient, cacheService, paginationService, whitelistService, persistentCacheService = null) {
    this.slack = slackClient;
    this.cache = cacheService;
    this.pagination = paginationService;
    this.whitelist = whitelistService;
    this.persistentCache = persistentCacheService;
  }

  _isPersistentCacheEnabled() {
    return config.persistentCache.enabled && this.persistentCache;
  }

  _slimMessage(msg, userName) {
    return {
      ts: msg.ts,
      user: msg.user || null,
      user_name: userName,
      text: msg.text || '',
      thread_ts: msg.thread_ts || null,
      reply_count: msg.reply_count || 0,
      subtype: msg.subtype || null,
    };
  }

  async _enrichAndSlim(messages) {
    const enriched = await Promise.all(
      messages.map(async (msg) => {
        const userName = await this.getUserName(msg.user);
        return this._slimMessage(msg, userName);
      })
    );
    // Sort oldest-first for JSONL append
    return enriched.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
  }

  async getRecentMessages(channelId, count = 5, includeThreads = true) {
    if (this._isPersistentCacheEnabled()) {
      return this._getRecentMessagesWithPersistentCache(channelId, count, includeThreads);
    }

    return this._getRecentMessagesFromApi(channelId, count, includeThreads);
  }

  async _getRecentMessagesWithPersistentCache(channelId, count, includeThreads) {
    let totalApiCalls = 0;
    const meta = this.persistentCache.readMeta(channelId);

    let newMessages = [];
    if (meta && meta.lastTs) {
      // Delta fetch — only messages newer than lastTs
      logger.info(`Persistent cache hit for ${channelId}, fetching delta since ${meta.lastTs}`);
      const fetchLimit = config.persistentCache.maxFetchOnSync;
      const history = await this.slack.getConversationHistory(channelId, fetchLimit, null, meta.lastTs);
      totalApiCalls++;
      // Filter out the message at lastTs itself (oldest is exclusive in Slack API, but be safe)
      newMessages = (history.messages || []).filter(m => m.ts !== meta.lastTs);
    } else {
      // Cold start — fetch count messages
      logger.info(`Persistent cache cold start for ${channelId}`);
      const history = await this.slack.getConversationHistory(channelId, count);
      totalApiCalls++;
      newMessages = history.messages || [];
    }

    // Enrich, slim, sort oldest-first, append
    if (newMessages.length > 0) {
      const slim = await this._enrichAndSlim(newMessages);
      this.persistentCache.appendMessages(channelId, slim);
    }

    // Read last N from file
    const cachedMessages = this.persistentCache.readLastMessages(channelId, count);

    // If includeThreads, fetch thread data for messages with replies
    let threadsFetched = 0;
    let totalThreadReplies = 0;

    const result = includeThreads
      ? await Promise.all(cachedMessages.map(async (msg) => {
          if (msg.reply_count > 0) {
            const threadResult = await this._getThreadRepliesWithPersistentCache(channelId, msg.ts || msg.thread_ts);
            threadsFetched++;
            totalThreadReplies += threadResult.replies.length;
            totalApiCalls += threadResult.api_calls;
            return {
              ...msg,
              is_thread_parent: true,
              thread_replies: threadResult.replies,
              thread_truncated: false,
            };
          }
          return { ...msg, is_thread_parent: false };
        }))
      : cachedMessages.map(msg => ({ ...msg, is_thread_parent: (msg.reply_count || 0) > 0 }));

    return {
      messages: result,
      threads_fetched: threadsFetched,
      total_thread_replies: totalThreadReplies,
      parent_count: result.length,
      api_calls_made: totalApiCalls,
      cached: meta && meta.lastTs ? newMessages.length === 0 : false,
      persistent_cache: true,
    };
  }

  async _getThreadRepliesWithPersistentCache(channelId, threadTs) {
    let apiCalls = 0;
    const meta = this.persistentCache.readThreadMeta(channelId, threadTs);

    let newReplies = [];
    if (meta && meta.lastTs) {
      const fetchLimit = config.persistentCache.maxFetchOnSync;
      const result = await this.slack.getThreadReplies(channelId, threadTs, fetchLimit, null, meta.lastTs);
      apiCalls++;
      // Filter out thread parent and the message at lastTs
      newReplies = (result.messages || []).filter(m => m.ts !== threadTs && m.ts !== meta.lastTs);
    } else {
      const result = await this.slack.getThreadReplies(channelId, threadTs, 200);
      apiCalls++;
      // Filter out thread parent
      newReplies = (result.messages || []).filter(m => m.ts !== threadTs);
    }

    if (newReplies.length > 0) {
      const slim = await this._enrichAndSlim(newReplies);
      this.persistentCache.appendThreadReplies(channelId, threadTs, slim);
    }

    const replies = this.persistentCache.readThreadReplies(channelId, threadTs);
    return { replies, api_calls: apiCalls };
  }

  async _getRecentMessagesFromApi(channelId, count, includeThreads) {
    logger.info(`Fetching ${count} recent messages from ${channelId}, includeThreads=${includeThreads}`);

    // Fetch parent messages
    const history = await this.slack.getConversationHistory(channelId, count);
    const messages = history.messages;
    let totalApiCalls = 1;

    if (!includeThreads) {
      // Still enrich with usernames
      const enriched = await Promise.all(
        messages.map(async (msg) => ({
          ...msg,
          user_name: await this.getUserName(msg.user),
          is_thread_parent: (msg.reply_count || 0) > 0,
        }))
      );

      return {
        messages: enriched,
        threads_fetched: 0,
        total_thread_replies: 0,
        parent_count: messages.length,
        api_calls_made: totalApiCalls,
        cached: false,
      };
    }

    // Fetch threads for messages that have replies
    let threadsFetched = 0;
    let totalThreadReplies = 0;

    const messagesWithThreads = await Promise.all(
      messages.map(async (msg) => {
        const userName = await this.getUserName(msg.user);

        if (msg.reply_count && msg.reply_count > 0) {
          const cacheKey = CACHE_PREFIXES.THREAD + `${channelId}:${msg.ts}`;
          let threadData = this.cache.get(cacheKey);

          if (!threadData) {
            logger.info(`Fetching thread ${msg.ts} with ${msg.reply_count} replies`);

            const result = await this.pagination.fetchAllReplies(
              this.slack, channelId, msg.ts, 10
            );

            // Enrich replies with usernames
            const enrichedReplies = await Promise.all(
              result.items.map(async (reply) => ({
                ...reply,
                user_name: await this.getUserName(reply.user),
              }))
            );

            threadData = {
              replies: enrichedReplies,
              truncated: result.truncated,
              api_calls: result.api_calls,
            };

            totalApiCalls += result.api_calls;
            this.cache.set(cacheKey, threadData, config.cache.threadTtl);
          }

          threadsFetched++;
          totalThreadReplies += threadData.replies.length;

          return {
            ...msg,
            user_name: userName,
            is_thread_parent: true,
            thread_replies: threadData.replies,
            thread_truncated: threadData.truncated || false,
          };
        }

        return {
          ...msg,
          user_name: userName,
          is_thread_parent: false,
        };
      })
    );

    return {
      messages: messagesWithThreads,
      threads_fetched: threadsFetched,
      total_thread_replies: totalThreadReplies,
      parent_count: messages.length,
      api_calls_made: totalApiCalls,
      cached: false,
    };
  }

  async getCompleteThread(channelId, threadTs) {
    if (this._isPersistentCacheEnabled()) {
      return this._getCompleteThreadWithPersistentCache(channelId, threadTs);
    }

    return this._getCompleteThreadFromApi(channelId, threadTs);
  }

  async _getCompleteThreadWithPersistentCache(channelId, threadTs) {
    let totalApiCalls = 0;

    // Always fetch parent from Slack (cheap, 1 call) to get latest state
    const firstBatch = await this.slack.getThreadReplies(channelId, threadTs, 1);
    totalApiCalls++;
    if (!firstBatch.messages || firstBatch.messages.length === 0) {
      const { ERROR_CODES } = require('../utils/constants');
      throw ERROR_CODES.THREAD_NOT_FOUND;
    }
    const parent = firstBatch.messages[0];
    const parentUserName = await this.getUserName(parent.user);

    // Delta-fetch replies
    const threadResult = await this._getThreadRepliesWithPersistentCache(channelId, threadTs);
    totalApiCalls += threadResult.api_calls;

    const replies = threadResult.replies;

    return {
      parent: { ...this._slimMessage(parent, parentUserName), is_thread_parent: true },
      replies,
      reply_count: replies.length,
      participants: [...new Set([parent.user, ...replies.map(r => r.user)].filter(Boolean))],
      truncated: false,
      api_calls_made: totalApiCalls,
      cached: false,
      persistent_cache: true,
    };
  }

  async _getCompleteThreadFromApi(channelId, threadTs) {
    const cacheKey = CACHE_PREFIXES.THREAD + `${channelId}:${threadTs}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.parent) {
      logger.info(`Using cached complete thread ${threadTs}`);
      return { ...cached, cached: true };
    }

    logger.info(`Fetching complete thread ${threadTs}`);

    // Fetch the parent + first batch to get parent message
    const firstBatch = await this.slack.getThreadReplies(channelId, threadTs, 1);
    if (!firstBatch.messages || firstBatch.messages.length === 0) {
      const { ERROR_CODES } = require('../utils/constants');
      throw ERROR_CODES.THREAD_NOT_FOUND;
    }
    const parent = firstBatch.messages[0];

    // Fetch all replies (paginated)
    const result = await this.pagination.fetchAllReplies(
      this.slack, channelId, threadTs, 10
    );

    // Enrich with usernames
    const enrichedReplies = await Promise.all(
      result.items.map(async (reply) => ({
        ...reply,
        user_name: await this.getUserName(reply.user),
      }))
    );

    const threadData = {
      parent: {
        ...parent,
        user_name: await this.getUserName(parent.user),
      },
      replies: enrichedReplies,
      reply_count: enrichedReplies.length,
      participants: [...new Set([parent.user, ...enrichedReplies.map(r => r.user)].filter(Boolean))],
      truncated: result.truncated,
      api_calls_made: result.api_calls + 1,
    };

    this.cache.set(cacheKey, threadData, config.cache.threadTtl);

    return { ...threadData, cached: false };
  }

  async getThreadReplies(channelId, threadTs, count = 50, oldest = null) {
    logger.info(`Fetching thread replies ${threadTs} in ${channelId} (count=${count}, oldest=${oldest || 'none'})`);

    const cacheKey = oldest
      ? null // Don't cache filtered requests
      : CACHE_PREFIXES.THREAD + `${channelId}:${threadTs}:replies:${count}`;

    if (cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        logger.info(`Using cached thread replies ${threadTs}`);
        return { ...cached, cached: true };
      }
    }

    let allMessages = [];
    let cursor = null;
    let apiCalls = 0;
    // Request count + 1 because Slack always includes the parent as the first message
    const perPage = Math.min(count + 1, 200);

    do {
      const batch = await this.slack.getThreadReplies(channelId, threadTs, perPage, cursor, oldest);
      apiCalls++;
      allMessages = allMessages.concat(batch.messages || []);

      if (!batch.has_more || allMessages.length >= count + 1) {
        break;
      }
      cursor = batch.next_cursor;
    } while (cursor);

    if (allMessages.length === 0) {
      throw { ...ERROR_CODES.THREAD_NOT_FOUND };
    }

    // First message is the parent
    const parentRaw = allMessages[0];
    const repliesRaw = allMessages.slice(1, count + 1);

    const parentUserName = await this.getUserName(parentRaw.user);
    const enrichedReplies = await Promise.all(
      repliesRaw.map(async (reply) => ({
        ...reply,
        user_name: await this.getUserName(reply.user),
      }))
    );

    const result = {
      channel_id: channelId,
      thread_ts: threadTs,
      parent_message: {
        ...parentRaw,
        user_name: parentUserName,
      },
      replies: enrichedReplies,
      reply_count: enrichedReplies.length,
      api_calls_made: apiCalls,
    };

    if (cacheKey) {
      this.cache.set(cacheKey, result, config.cache.threadTtl);
    }

    return { ...result, cached: false };
  }

  async getMessageHistory(channelId, count = 100, oldest = null, latest = null) {
    logger.info(`Fetching message history from ${channelId} (count=${count}, oldest=${oldest || 'none'}, latest=${latest || 'none'})`);

    let allMessages = [];
    let cursor = null;
    let apiCalls = 0;
    let hasMore = false;

    do {
      const batch = await this.slack.getConversationHistory(channelId, Math.min(count - allMessages.length, 200), cursor, oldest, latest);
      apiCalls++;
      allMessages = allMessages.concat(batch.messages || []);

      if (!batch.has_more || allMessages.length >= count) {
        hasMore = batch.has_more || false;
        break;
      }
      cursor = batch.next_cursor;
    } while (cursor);

    allMessages = allMessages.slice(0, count);

    const enriched = await Promise.all(
      allMessages.map(async (msg) => ({
        ...msg,
        user_name: await this.getUserName(msg.user),
      }))
    );

    return {
      messages: enriched,
      has_more: hasMore,
      api_calls_made: apiCalls,
    };
  }

  async deleteMessage(channelId, messageTs) {
    if (!config.enableWriteOps) {
      throw { ...ERROR_CODES.WRITE_OPS_DISABLED };
    }

    const isDm = channelId.startsWith('D');
    if (isDm) {
      const userId = await this.whitelist.resolveUserIdFromDmChannel(channelId);
      if (!userId) {
        throw { ...ERROR_CODES.USER_NOT_FOUND, details: { channel: channelId } };
      }
      const dmCheck = this.whitelist.canSendDmToUser(userId);
      if (!dmCheck.allowed) {
        throw dmCheck.error;
      }
    } else {
      const writeCheck = this.whitelist.canWriteChannel(channelId);
      if (!writeCheck.allowed) {
        throw writeCheck.error;
      }
    }

    logger.info(`Deleting message ${messageTs} from ${channelId}`);
    return await this.slack.deleteMessage(channelId, messageTs);
  }

  async sendMessage(channelId, text, threadTs = null, apiKeyId = null) {
    const isDm = channelId.startsWith('D');
    if (isDm) {
      const userId = await this.whitelist.resolveUserIdFromDmChannel(channelId);
      if (!userId) {
        const err = { ...ERROR_CODES.USER_NOT_FOUND, details: { channel: channelId } };
        throw err;
      }
      const dmCheck = this.whitelist.canSendDmToUser(userId);
      if (!dmCheck.allowed && !configStore.hasTemporaryDmGrant(apiKeyId, userId)) {
        throw dmCheck.error;
      }
    } else {
      const writeCheck = this.whitelist.canWriteChannel(channelId);
      if (!writeCheck.allowed) {
        throw writeCheck.error;
      }
    }

    logger.info(`Sending message to ${channelId}${threadTs ? ` (thread: ${threadTs})` : ''}`);

    const result = await this.slack.postMessage(channelId, text, threadTs);

    return {
      ok: result.ok,
      channel: result.channel,
      ts: result.ts,
      message: result.message,
    };
  }

  async sendDirectMessage(target, text, threadTs = null, apiKeyId = null) {
    const normalized = String(target || '').trim().replace(/^@/, '');
    const userId = await this.whitelist.resolveUserTarget(normalized);
    if (!userId) {
      throw { ...ERROR_CODES.USER_NOT_FOUND, details: { user: target } };
    }

    const dmCheck = this.whitelist.canSendDmToUser(userId);
    if (!dmCheck.allowed && !configStore.hasTemporaryDmGrant(apiKeyId, userId)) {
      throw dmCheck.error;
    }

    const channel = await this.slack.openDmChannel(userId);
    if (!channel || !channel.id) {
      throw { ...ERROR_CODES.USER_NOT_FOUND, details: { user: target } };
    }
    logger.info(`Sending direct message to ${normalized} (${channel.id})`);
    const result = await this.slack.postMessage(channel.id, text, threadTs);
    return {
      ok: result.ok,
      channel: result.channel,
      ts: result.ts,
      message: result.message,
    };
  }

  async sendApprovedDirectMessage(userId, text, threadTs = null) {
    if (!config.enableWriteOps) {
      throw { ...ERROR_CODES.WRITE_OPS_DISABLED };
    }
    const channel = await this.slack.openDmChannel(userId);
    if (!channel || !channel.id) {
      throw { ...ERROR_CODES.USER_NOT_FOUND, details: { user: userId } };
    }
    logger.info(`Sending owner-approved direct message to ${userId} (${channel.id})`);
    const result = await this.slack.postMessage(channel.id, text, threadTs);
    return {
      ok: result.ok,
      channel: result.channel,
      ts: result.ts,
      message: result.message,
    };
  }

  async getUserName(userId) {
    if (!userId) return 'Unknown';

    const cacheKey = CACHE_PREFIXES.USER_NAME + userId;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const user = await this.slack.getUserInfo(userId);
      const name = user.profile?.display_name || user.name || 'Unknown';
      this.cache.set(cacheKey, name, config.cache.userTtl);
      return name;
    } catch (err) {
      logger.error(`Failed to get user ${userId}: ${err.message}`);
      return 'Unknown';
    }
  }
}

module.exports = MessageService;
