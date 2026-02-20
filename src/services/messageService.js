const config = require('../config');
const logger = require('../utils/logger');
const { CACHE_PREFIXES } = require('../utils/constants');

class MessageService {
  constructor(slackClient, cacheService, paginationService, whitelistService) {
    this.slack = slackClient;
    this.cache = cacheService;
    this.pagination = paginationService;
    this.whitelist = whitelistService;
  }

  async getRecentMessages(channelId, count = 5, includeThreads = true) {
    // Check whitelist
    const readCheck = this.whitelist.canReadChannel(channelId);
    if (!readCheck.allowed) {
      throw readCheck.error;
    }

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
    // Check whitelist
    const readCheck = this.whitelist.canReadChannel(channelId);
    if (!readCheck.allowed) {
      throw readCheck.error;
    }

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
