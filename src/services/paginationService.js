const config = require('../config');
const logger = require('../utils/logger');

class PaginationService {
  /**
   * Generic paginated fetch
   * @param {Function} apiFn - async ({ cursor }) => { items/messages/users/channels, next_cursor }
   * @param {number} maxCalls - safety limit
   * @returns {{ items: Array, truncated: boolean, api_calls: number, total_count: number }}
   */
  async fetchAll(apiFn, maxCalls = null) {
    const limit = maxCalls || config.maxPaginationCalls;
    const allItems = [];
    let cursor = null;
    let callCount = 0;
    let truncated = false;

    do {
      if (callCount >= limit) {
        logger.warn(`Pagination limit reached (${limit} calls). Results may be incomplete.`);
        truncated = true;
        break;
      }

      callCount++;
      const response = await apiFn({ cursor });

      const items =
        response.items || response.messages || response.users || response.channels || [];
      allItems.push(...items);

      cursor = response.next_cursor || null;
      if (cursor === '') cursor = null;
    } while (cursor);

    return {
      items: allItems,
      truncated,
      api_calls: callCount,
      total_count: allItems.length,
    };
  }

  async fetchAllChannels(slackClient, maxCalls = null) {
    const apiFn = async ({ cursor }) => slackClient.listChannels(cursor);
    return this.fetchAll(apiFn, maxCalls);
  }

  async fetchAllUsers(slackClient, maxCalls = null) {
    const apiFn = async ({ cursor }) => slackClient.listUsers(cursor);
    return this.fetchAll(apiFn, maxCalls);
  }

  /**
   * Fetch all thread replies, removing the duplicated parent message
   */
  async fetchAllReplies(slackClient, channelId, threadTs, maxCalls = null) {
    const apiFn = async ({ cursor }) =>
      slackClient.getThreadReplies(channelId, threadTs, 100, cursor);

    const result = await this.fetchAll(apiFn, maxCalls);

    // Slack includes the parent as the first message in replies - remove it
    if (result.items.length > 0 && result.items[0].ts === threadTs) {
      result.items = result.items.slice(1);
      result.total_count = result.items.length;
    }

    return result;
  }
}

module.exports = PaginationService;
