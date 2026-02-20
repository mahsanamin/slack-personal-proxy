const logger = require('../utils/logger');

class MentionService {
  constructor(slackClient, cacheService, messageService, whitelistService) {
    this.slack = slackClient;
    this.cache = cacheService;
    this.messageService = messageService;
    this.whitelist = whitelistService;
  }

  async getAllMentions(count = 20, includeThreads = true) {
    const userId = this.slack.currentUserId;
    const query = `<@${userId}>`;

    logger.info(`Fetching mentions for ${userId} (count=${count}, threads=${includeThreads})`);

    const searchResult = await this.slack.searchMessages(query, count, 1, 'timestamp', 'desc');
    let apiCalls = 1;

    const mentions = [];
    const channelCounts = {};

    for (const match of searchResult.messages) {
      const channelId = match.channel?.id;
      if (channelId && !this.whitelist.canReadChannel(channelId).allowed) continue;

      const isThreadReply = !!(match.thread_ts && match.thread_ts !== match.ts);
      const channelName = match.channel?.name || 'unknown';

      channelCounts[channelName] = (channelCounts[channelName] || 0) + 1;

      const mention = {
        message_ts: match.ts,
        channel_id: channelId,
        channel_name: channelName,
        text: match.text,
        user_id: match.user || match.username,
        user_name: match.username || '',
        is_thread_reply: isThreadReply,
        thread_ts: isThreadReply ? match.thread_ts : null,
        permalink: match.permalink || null,
        created_at: match.ts ? new Date(parseFloat(match.ts) * 1000).toISOString() : null,
      };

      if (includeThreads && isThreadReply && channelId && match.thread_ts) {
        try {
          const threadData = await this.messageService.getCompleteThread(channelId, match.thread_ts);
          apiCalls += threadData.api_calls_made || 0;

          const replyIndex = threadData.replies?.findIndex(r => r.ts === match.ts);
          mention.thread_context = {
            parent_message: threadData.parent?.text || '',
            reply_count: threadData.reply_count || 0,
            mention_at_reply_number: replyIndex >= 0 ? replyIndex + 1 : 0,
          };
          mention.complete_thread = {
            parent: threadData.parent,
            replies: threadData.replies,
          };
        } catch (err) {
          logger.warn(`Failed to fetch thread for mention ${match.thread_ts}: ${err.message}`);
        }
      }

      mentions.push(mention);
    }

    return {
      mentions,
      grouped_by_channel: channelCounts,
      total_mentions: searchResult.total,
      api_calls_made: apiCalls,
    };
  }

  async getMentionThreads(count = 20) {
    const userId = this.slack.currentUserId;
    const query = `<@${userId}>`;

    logger.info(`Fetching mention threads for ${userId} (count=${count})`);

    const searchResult = await this.slack.searchMessages(query, count, 1, 'timestamp', 'desc');
    let apiCalls = 1;

    const seenThreads = new Map();

    for (const match of searchResult.messages) {
      const channelId = match.channel?.id;
      if (channelId && !this.whitelist.canReadChannel(channelId).allowed) continue;

      const threadTs = match.thread_ts || match.ts;
      const threadKey = `${channelId}:${threadTs}`;

      if (!seenThreads.has(threadKey)) {
        seenThreads.set(threadKey, {
          thread_ts: threadTs,
          channel_id: channelId,
          channel_name: match.channel?.name || 'unknown',
          your_mentions: [],
        });
      }

      seenThreads.get(threadKey).your_mentions.push({
        ts: match.ts,
        text: match.text,
        user_id: match.user || match.username,
        user_name: match.username || '',
      });
    }

    const threads = [];
    for (const [, thread] of seenThreads) {
      try {
        const threadData = await this.messageService.getCompleteThread(
          thread.channel_id, thread.thread_ts
        );
        apiCalls += threadData.api_calls_made || 0;

        // Find reply numbers for each mention
        thread.your_mentions = thread.your_mentions.map(m => {
          const idx = threadData.replies?.findIndex(r => r.ts === m.ts);
          return { ...m, reply_number: idx >= 0 ? idx + 1 : 0 };
        });

        const participants = threadData.participants || [];
        threads.push({
          ...thread,
          parent_message: threadData.parent ? {
            ts: threadData.parent.ts,
            user_id: threadData.parent.user,
            user_name: threadData.parent.user_name || '',
            text: threadData.parent.text,
          } : null,
          complete_thread: {
            parent: threadData.parent,
            replies: threadData.replies,
          },
          thread_stats: {
            total_replies: threadData.reply_count || 0,
            participants,
            last_reply_ts: threadData.replies?.length
              ? threadData.replies[threadData.replies.length - 1].ts : null,
            you_participated: participants.includes(userId),
          },
        });
      } catch (err) {
        logger.warn(`Failed to fetch thread ${thread.thread_ts}: ${err.message}`);
      }
    }

    return {
      threads,
      total_threads: threads.length,
      api_calls_made: apiCalls,
    };
  }

  async getMentionsByChannel(channelId, count = 20, includeThreads = true) {
    const readCheck = this.whitelist.canReadChannel(channelId);
    if (!readCheck.allowed) throw readCheck.error;

    const userId = this.slack.currentUserId;
    const query = `<@${userId}> in:${this.whitelist.channelIdToName.get(channelId) || channelId}`;

    logger.info(`Fetching mentions in ${channelId} for ${userId}`);

    const searchResult = await this.slack.searchMessages(query, count, 1, 'timestamp', 'desc');
    let apiCalls = 1;

    const mentions = [];
    for (const match of searchResult.messages) {
      const isThreadReply = !!(match.thread_ts && match.thread_ts !== match.ts);

      const mention = {
        message_ts: match.ts,
        channel_id: match.channel?.id,
        channel_name: match.channel?.name || '',
        text: match.text,
        user_id: match.user || match.username,
        user_name: match.username || '',
        is_thread_reply: isThreadReply,
        thread_ts: isThreadReply ? match.thread_ts : null,
        permalink: match.permalink || null,
        created_at: match.ts ? new Date(parseFloat(match.ts) * 1000).toISOString() : null,
      };

      if (includeThreads && isThreadReply && match.channel?.id && match.thread_ts) {
        try {
          const threadData = await this.messageService.getCompleteThread(
            match.channel.id, match.thread_ts
          );
          apiCalls += threadData.api_calls_made || 0;
          mention.complete_thread = {
            parent: threadData.parent,
            replies: threadData.replies,
          };
        } catch (err) {
          logger.warn(`Failed to fetch thread ${match.thread_ts}: ${err.message}`);
        }
      }

      mentions.push(mention);
    }

    return {
      mentions,
      total_mentions: searchResult.total,
      api_calls_made: apiCalls,
    };
  }
}

module.exports = MentionService;
