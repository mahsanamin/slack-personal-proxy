const logger = require('../utils/logger');

class ActivityService {
  constructor(slackClient, cacheService, messageService, whitelistService) {
    this.slack = slackClient;
    this.cache = cacheService;
    this.messageService = messageService;
    this.whitelist = whitelistService;
  }

  async getThreadsImIn(count = 20) {
    const userId = this.slack.currentUserId;
    const query = 'from:me';

    logger.info(`Fetching threads participated in by ${userId} (count=${count})`);

    // Fetch generously — most results are non-thread messages that get filtered out
    const searchCount = 100;
    const searchResult = await this.slack.searchMessages(query, searchCount, 1, 'timestamp', 'desc');
    let apiCalls = 1;

    // Enrich with thread metadata (parsed from permalinks, no API calls)
    const enrichResult = await this.slack.enrichSearchMatches(searchResult.messages);
    apiCalls += enrichResult.apiCalls;

    const seenThreads = new Map();

    for (const match of enrichResult.matches) {
      const channelId = match.channel?.id;

      // Only include thread replies (not top-level messages)
      if (!match.thread_ts || match.thread_ts === match.ts) continue;

      const threadKey = `${channelId}:${match.thread_ts}`;
      if (!seenThreads.has(threadKey)) {
        seenThreads.set(threadKey, {
          thread_ts: match.thread_ts,
          channel_id: channelId,
          channel_name: match.channel?.name || 'unknown',
          your_messages: [],
        });
      }

      seenThreads.get(threadKey).your_messages.push({
        ts: match.ts,
        text: match.text,
      });

      if (seenThreads.size >= count) break;
    }

    const threads = [];
    for (const [, thread] of seenThreads) {
      try {
        const threadData = await this.messageService.getCompleteThread(
          thread.channel_id, thread.thread_ts
        );
        apiCalls += threadData.api_calls_made || 0;

        // Find reply numbers
        thread.your_messages = thread.your_messages.map(m => {
          const idx = threadData.replies?.findIndex(r => r.ts === m.ts);
          return { ...m, reply_number: idx >= 0 ? idx + 1 : 0 };
        });

        const lastReply = threadData.replies?.length
          ? threadData.replies[threadData.replies.length - 1] : null;
        const yourLastTs = thread.your_messages[thread.your_messages.length - 1]?.ts || '0';
        const newRepliesSince = threadData.replies?.filter(r => r.ts > yourLastTs).length || 0;

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
            your_reply_count: thread.your_messages.length,
            new_replies_since_your_last: newRepliesSince,
            last_activity_ts: lastReply?.ts || null,
          },
        });
      } catch (err) {
        logger.warn(`Failed to fetch thread ${thread.thread_ts}: ${err.message}`);
      }
    }

    return {
      threads,
      total_threads: threads.length,
      threads_with_new_activity: threads.filter(t => t.thread_stats.new_replies_since_your_last > 0).length,
      api_calls_made: apiCalls,
    };
  }

  async getMyThreads(count = 20, includeReplies = true) {
    const userId = this.slack.currentUserId;
    const query = 'from:me';

    logger.info(`Fetching threads started by ${userId} (count=${count})`);

    // Fetch generously — most results are non-thread messages that get filtered out
    const searchCount = 100;
    const searchResult = await this.slack.searchMessages(query, searchCount, 1, 'timestamp', 'desc');
    let apiCalls = 1;

    // Enrich with thread metadata; fetch reply_count for thread parents
    const enrichResult = await this.slack.enrichSearchMatches(searchResult.messages, { fetchReplyCounts: true });
    apiCalls += enrichResult.apiCalls;

    const seenThreads = new Map();

    for (const match of enrichResult.matches) {
      const channelId = match.channel?.id;

      // Only include parent messages (threads you started)
      if (match.thread_ts && match.thread_ts !== match.ts) continue;
      if (!match.reply_count || match.reply_count === 0) continue;

      const threadKey = `${channelId}:${match.ts}`;
      if (seenThreads.has(threadKey)) continue;

      seenThreads.set(threadKey, {
        thread_ts: match.ts,
        channel_id: channelId,
        channel_name: match.channel?.name || 'unknown',
        parent_text: match.text,
        reply_count: match.reply_count,
      });

      if (seenThreads.size >= count) break;
    }

    const threads = [];
    for (const [, thread] of seenThreads) {
      if (includeReplies) {
        try {
          const threadData = await this.messageService.getCompleteThread(
            thread.channel_id, thread.thread_ts
          );
          apiCalls += threadData.api_calls_made || 0;

          threads.push({
            ...thread,
            complete_thread: {
              parent: threadData.parent,
              replies: threadData.replies,
            },
            thread_stats: {
              total_replies: threadData.reply_count || 0,
              participants: threadData.participants || [],
            },
          });
        } catch (err) {
          logger.warn(`Failed to fetch thread ${thread.thread_ts}: ${err.message}`);
          threads.push(thread);
        }
      } else {
        threads.push(thread);
      }
    }

    return {
      threads,
      total_threads: threads.length,
      api_calls_made: apiCalls,
    };
  }
}

module.exports = ActivityService;
