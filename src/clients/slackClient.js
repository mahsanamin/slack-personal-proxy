const { WebClient } = require('@slack/web-api');
const config = require('../config');
const logger = require('../utils/logger');
const { maskToken } = require('../utils/helpers');

class SlackClient {
  constructor() {
    this.client = null;
    this.authMethod = null;
    this.currentUserId = null;
    this.currentUserName = null;
    this.teamId = null;
    this.teamName = null;
  }

  async initialize() {
    if (config.slack.botToken) {
      this.client = new WebClient(config.slack.botToken);
      this.authMethod = 'bot_token';
      logger.info(`Using bot token auth (${maskToken(config.slack.botToken)})`);
    } else if (config.slack.cookie && config.slack.token) {
      this.client = new WebClient(config.slack.token, {
        headers: {
          'Cookie': `d=${config.slack.cookie}`,
        },
      });
      this.authMethod = 'cookie';
      logger.info(`Using cookie-based auth (${maskToken(config.slack.token)})`);
    } else {
      throw new Error(
        'No valid Slack credentials provided. Set either SLACK_BOT_TOKEN or both SLACK_COOKIE and SLACK_TOKEN'
      );
    }

    const authTest = await this.client.auth.test();
    this.currentUserId = authTest.user_id;
    this.currentUserName = authTest.user;
    this.teamId = authTest.team_id;
    this.teamName = authTest.team;

    logger.info(`Authenticated as ${this.currentUserName} (${this.currentUserId}) via ${this.authMethod}`);
    logger.info(`Connected to workspace: ${this.teamName} (${this.teamId})`);
  }

  async authTest() {
    const result = await this.client.auth.test();
    return result;
  }

  async getConversationHistory(channelId, limit = 100, cursor = null) {
    const params = { channel: channelId, limit };
    if (cursor) params.cursor = cursor;

    const result = await this.client.conversations.history(params);
    return {
      messages: result.messages || [],
      has_more: result.has_more || false,
      next_cursor: result.response_metadata?.next_cursor || null,
    };
  }

  async getThreadReplies(channelId, threadTs, limit = 100, cursor = null) {
    const params = { channel: channelId, ts: threadTs, limit };
    if (cursor) params.cursor = cursor;

    const result = await this.client.conversations.replies(params);
    return {
      messages: result.messages || [],
      has_more: result.has_more || false,
      next_cursor: result.response_metadata?.next_cursor || null,
    };
  }

  async searchMessages(query, count = 20, page = 1, sort = 'timestamp', sortDir = 'desc') {
    const result = await this.client.search.messages({
      query,
      count,
      page,
      sort,
      sort_dir: sortDir,
    });

    return {
      messages: result.messages?.matches || [],
      total: result.messages?.total || 0,
      page: result.messages?.pagination?.page || 1,
      page_count: result.messages?.pagination?.page_count || 1,
    };
  }

  async getUserInfo(userId) {
    const result = await this.client.users.info({ user: userId });
    return result.user;
  }

  async listChannels(cursor = null, types = 'public_channel,private_channel') {
    const params = { types, exclude_archived: true, limit: 200 };
    if (cursor) params.cursor = cursor;

    const result = await this.client.conversations.list(params);
    return {
      channels: result.channels || [],
      next_cursor: result.response_metadata?.next_cursor || null,
    };
  }

  async listUsers(cursor = null) {
    const params = { limit: 200 };
    if (cursor) params.cursor = cursor;

    const result = await this.client.users.list(params);
    return {
      users: result.members || [],
      next_cursor: result.response_metadata?.next_cursor || null,
    };
  }

  async getChannelInfo(channelId) {
    const result = await this.client.conversations.info({ channel: channelId });
    return result.channel;
  }

  async postMessage(channel, text, threadTs = null) {
    const params = { channel, text };
    if (threadTs) params.thread_ts = threadTs;

    const result = await this.client.chat.postMessage(params);
    return result;
  }
}

module.exports = SlackClient;
