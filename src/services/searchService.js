const logger = require('../utils/logger');

class SearchService {
  constructor(slackClient, cacheService, messageService, whitelistService) {
    this.slack = slackClient;
    this.cache = cacheService;
    this.messageService = messageService;
    this.whitelist = whitelistService;
  }

  async searchMessages(query, count = 10, includeThreads = true, sortOrder = 'timestamp') {
    logger.info(`Searching messages: "${query}" (count=${count}, threads=${includeThreads}, sort=${sortOrder})`);

    const sortDir = sortOrder === 'score' ? 'desc' : 'desc';
    const sort = sortOrder === 'score' ? 'score' : 'timestamp';

    const searchResult = await this.slack.searchMessages(query, count, 1, sort, sortDir);

    let apiCalls = 1;

    // Enrich with thread metadata that search API doesn't provide
    const enrichResult = await this.slack.enrichSearchMatches(searchResult.messages);
    apiCalls += enrichResult.apiCalls;

    const seenThreads = new Set();
    const results = [];

    for (const match of enrichResult.matches) {
      const channelId = match.channel?.id;
      const isInThread = !!(match.thread_ts && match.thread_ts !== match.ts);
      const threadKey = `${channelId}:${match.thread_ts || match.ts}`;

      // Deduplicate: if multiple replies from the same thread matched, only include once
      if (isInThread && seenThreads.has(threadKey)) {
        continue;
      }
      if (isInThread) {
        seenThreads.add(threadKey);
      }

      const resultItem = {
        message: {
          ts: match.ts,
          user: match.user || match.username,
          user_name: match.username || '',
          text: match.text,
          channel_id: channelId,
          channel_name: match.channel?.name,
          permalink: match.permalink,
        },
        is_in_thread: isInThread,
        match_score: match.score || null,
      };

      // Fetch thread context if requested and message is in a thread
      if (includeThreads && isInThread && channelId && match.thread_ts) {
        try {
          const threadData = await this.messageService.getCompleteThread(
            channelId, match.thread_ts
          );
          apiCalls += threadData.api_calls_made || 0;

          resultItem.thread_context = {
            parent_ts: match.thread_ts,
            parent_text: threadData.parent?.text || '',
            reply_number: threadData.replies?.findIndex(r => r.ts === match.ts) + 1 || 0,
          };
          resultItem.complete_thread = {
            parent: threadData.parent,
            replies: threadData.replies,
          };
        } catch (err) {
          logger.warn(`Failed to fetch thread context for ${match.thread_ts}: ${err.message}`);
        }
      }

      results.push(resultItem);
    }

    return {
      results,
      total_matches: searchResult.total,
      query,
      api_calls_made: apiCalls,
    };
  }
}

module.exports = SearchService;
