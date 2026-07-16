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
    this._lastRequestTime = 0;
    this._requestQueue = Promise.resolve();
    this._throttleMs = config.slackThrottleMs || 100;
  }

  /**
   * Throttle Slack API calls to avoid hitting rate limits.
   * Serializes requests with a minimum delay between each call.
   */
  _throttle(fn) {
    this._requestQueue = this._requestQueue.then(async () => {
      const now = Date.now();
      const elapsed = now - this._lastRequestTime;
      if (elapsed < this._throttleMs) {
        await new Promise(r => setTimeout(r, this._throttleMs - elapsed));
      }
      this._lastRequestTime = Date.now();
      return fn();
    });
    return this._requestQueue;
  }

  /**
   * Build the Slack WebClient and validate it via auth.test.
   * @param {object|null} creds Optional { cookie, token, botToken } override (from the
   *   encrypted store). When omitted, falls back to the .env-derived config.slack values.
   */
  async initialize(creds = null) {
    const source = creds || config.slack;
    const botToken = source.botToken || '';
    const cookie = source.cookie || '';
    const token = source.token || '';

    const clientOptions = {
      retryConfig: {
        retries: 3,
        factor: 2,
        randomize: true,
      },
    };

    if (botToken) {
      this.client = new WebClient(botToken, clientOptions);
      this.authMethod = 'bot_token';
      logger.info(`Using bot token auth (${maskToken(botToken)})`);
    } else if (cookie && token) {
      this.client = new WebClient(token, {
        ...clientOptions,
        headers: {
          'Cookie': `d=${cookie}`,
        },
      });
      this.authMethod = 'cookie';
      logger.info(`Using cookie-based auth (${maskToken(token)})`);
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

    // Resolve the connected user's display name + avatar for the dashboard header.
    // Non-fatal: a failure here must not stop the server from starting.
    this.currentUserRealName = null;
    this.currentUserAvatar = null;
    try {
      const info = await this.client.users.info({ user: this.currentUserId });
      const p = info.user?.profile || {};
      this.currentUserRealName = p.display_name || p.real_name || info.user?.real_name || null;
      this.currentUserAvatar = p.image_72 || p.image_48 || p.image_192 || null;
    } catch (err) {
      logger.warn(`Could not resolve own profile for header: ${err.message}`);
    }

    logger.info(`Authenticated as ${this.currentUserName} (${this.currentUserId}) via ${this.authMethod}`);
    logger.info(`Connected to workspace: ${this.teamName} (${this.teamId})`);
  }

  /** Rebuild the client with new credentials (used by the dashboard hot-reload). */
  async reinitialize(creds) {
    return this.initialize(creds);
  }

  /** Validate arbitrary creds without mutating this client (for the setup wizard's test). */
  async testCredentials(creds) {
    const source = creds || config.slack;
    const clientOptions = { retryConfig: { retries: 1 } };
    let probe;
    if (source.botToken) {
      probe = new WebClient(source.botToken, clientOptions);
    } else if (source.cookie && source.token) {
      probe = new WebClient(source.token, { ...clientOptions, headers: { Cookie: `d=${source.cookie}` } });
    } else {
      throw new Error('No valid Slack credentials provided');
    }
    return probe.auth.test();
  }

  async authTest() {
    const result = await this.client.auth.test();
    return result;
  }

  async getConversationHistory(channelId, limit = 100, cursor = null, oldest = null, latest = null) {
    return this._throttle(async () => {
      const params = { channel: channelId, limit };
      if (cursor) params.cursor = cursor;
      if (oldest) params.oldest = oldest;
      if (latest) params.latest = latest;

      const result = await this.client.conversations.history(params);
      return {
        messages: result.messages || [],
        has_more: result.has_more || false,
        next_cursor: result.response_metadata?.next_cursor || null,
      };
    });
  }

  async getMessage(channelId, ts) {
    return this._throttle(async () => {
      const result = await this.client.conversations.history({
        channel: channelId,
        latest: ts,
        inclusive: true,
        limit: 1,
      });
      return result.messages?.[0] || null;
    });
  }

  async getThreadReplies(channelId, threadTs, limit = 100, cursor = null, oldest = null) {
    return this._throttle(async () => {
      const params = { channel: channelId, ts: threadTs, limit };
      if (cursor) params.cursor = cursor;
      if (oldest) params.oldest = oldest;

      const result = await this.client.conversations.replies(params);
      return {
        messages: result.messages || [],
        has_more: result.has_more || false,
        next_cursor: result.response_metadata?.next_cursor || null,
      };
    });
  }

  /**
   * Enrich search matches with thread_ts (parsed from permalink — no API calls)
   * and optionally reply_count (requires API call per thread parent).
   * The Slack search API omits these fields from results.
   * Returns { matches, apiCalls }.
   */
  async enrichSearchMatches(matches, { fetchReplyCounts = false } = {}) {
    let apiCalls = 0;
    const enriched = await Promise.all(
      matches.map(async (match) => {
        // Extract thread_ts from permalink (e.g. ?thread_ts=1234.5678)
        const threadTsMatch = match.permalink?.match(/thread_ts=([0-9.]+)/);
        const threadTs = threadTsMatch ? threadTsMatch[1] : null;
        const enrichedMatch = { ...match, thread_ts: threadTs, reply_count: 0 };

        // For thread parents, optionally fetch reply_count via API
        if (fetchReplyCounts && threadTs && threadTs === match.ts) {
          const channelId = match.channel?.id;
          if (channelId) {
            try {
              const msg = await this.getMessage(channelId, match.ts);
              apiCalls++;
              if (msg && msg.ts === match.ts) {
                enrichedMatch.reply_count = msg.reply_count || 0;
              }
            } catch (err) {
              // Skip — reply_count stays 0
            }
          }
        }

        return enrichedMatch;
      })
    );
    return { matches: enriched, apiCalls };
  }

  async searchMessages(query, count = 20, page = 1, sort = 'timestamp', sortDir = 'desc') {
    return this._throttle(async () => {
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
    });
  }

  async getUserInfo(userId) {
    return this._throttle(async () => {
      const result = await this.client.users.info({ user: userId });
      return result.user;
    });
  }

  async listChannels(cursor = null, types = 'public_channel,private_channel') {
    return this._throttle(async () => {
      const params = { types, exclude_archived: true, limit: 200 };
      if (cursor) params.cursor = cursor;

      const result = await this.client.conversations.list(params);
      return {
        channels: result.channels || [],
        next_cursor: result.response_metadata?.next_cursor || null,
      };
    });
  }

  async listUsers(cursor = null) {
    return this._throttle(async () => {
      const params = { limit: 200 };
      if (cursor) params.cursor = cursor;

      const result = await this.client.users.list(params);
      return {
        users: result.members || [],
        next_cursor: result.response_metadata?.next_cursor || null,
      };
    });
  }

  async getChannelInfo(channelId) {
    return this._throttle(async () => {
      const result = await this.client.conversations.info({ channel: channelId });
      return result.channel;
    });
  }

  async lookupUserByEmail(email) {
    return this._throttle(async () => {
      const result = await this.client.users.lookupByEmail({ email });
      return result.user;
    });
  }

  async openDmChannel(userId) {
    return this._throttle(async () => {
      const result = await this.client.conversations.open({ users: userId });
      return result.channel;
    });
  }

  async deleteMessage(channelId, ts) {
    return this._throttle(async () => {
      const result = await this.client.chat.delete({ channel: channelId, ts });
      return { ok: result.ok, channel: result.channel, ts: result.ts };
    });
  }

  async postMessage(channel, text, threadTs = null) {
    return this._throttle(async () => {
      const params = { channel, text };
      if (threadTs) params.thread_ts = threadTs;

      const result = await this.client.chat.postMessage(params);
      return result;
    });
  }
}

module.exports = SlackClient;
