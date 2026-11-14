const { WebClient } = require('@slack/web-api');
const config = require('../config');
const logger = require('../utils/logger');
const { maskToken } = require('../utils/helpers');
const { noteSlackCall } = require('../utils/requestContext');

class SlackClient {
  constructor() {
    this.client = null;
    this.authMethod = null;
    this.currentUserId = null;
    this.currentUserName = null;
    this.teamId = null;
    this.teamName = null;
    this.ready = false;
    // One queue per Slack method. Slack rate limits each method on its own, so a wait on
    // conversations.replies must not hold up search.messages or anything else.
    this._queues = new Map();
    this._throttleMs = config.slackThrottleMs || 100;
  }

  /**
   * Run a Slack call through its method's queue: one at a time per method, with a minimum
   * gap between calls. When Slack answers 429 the Slack library waits out Retry-After
   * inside fn, which holds up that one method only.
   */
  _throttle(fn, method = 'default') {
    let q = this._queues.get(method);
    if (!q) {
      q = { tail: Promise.resolve(), last: 0 };
      this._queues.set(method, q);
    }
    // A failed Slack request must reject only its own caller. Keep the queue itself
    // fulfilled so one unsupported/expired API call does not poison every later call.
    const request = q.tail.catch(() => undefined).then(async () => {
      const elapsed = Date.now() - q.last;
      if (elapsed < this._throttleMs) {
        await new Promise(r => setTimeout(r, this._throttleMs - elapsed));
      }
      q.last = Date.now();
      noteSlackCall(method);
      return fn();
    });
    q.tail = request.catch(() => undefined);
    return request;
  }

  /**
   * Build the Slack WebClient and validate it via auth.test.
   * @param {object|null} creds Optional { cookie, token, botToken } override (from the
   *   encrypted store). When omitted, falls back to the .env-derived config.slack values.
   */
  async initialize(creds = null) {
    this.ready = false;
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
    this.ready = true;
  }

  isReady() {
    return this.ready;
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
    if (!this.client) {
      const err = new Error('Slack is not configured. Add credentials in the dashboard.');
      err.code = 'SLACK_NOT_CONFIGURED';
      throw err;
    }
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
    }, 'conversations.history');
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
    }, 'conversations.history');
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
    }, 'conversations.replies');
  }

  /**
   * Enrich search matches with thread_ts (parsed from permalink — no API calls)
   * and optionally reply_count (requires API call per thread parent).
   * The Slack search API omits these fields from results.
   * Returns { matches, apiCalls }.
   */
  async enrichSearchMatches(matches, { fetchReplyCounts = false, deadline = null } = {}) {
    let apiCalls = 0;
    let partial = false;
    const enriched = matches.map((match) => {
      // Extract thread_ts from permalink (e.g. ?thread_ts=1234.5678)
      const threadTsMatch = match.permalink?.match(/thread_ts=([0-9.]+)/);
      const threadTs = threadTsMatch ? threadTsMatch[1] : null;
      return { ...match, thread_ts: threadTs, reply_count: 0 };
    });

    // For thread parents, optionally fetch reply_count via API. Done one at a time (the
    // calls share one Slack queue anyway) so the time limit can stop it part way.
    if (fetchReplyCounts) {
      for (const match of enriched) {
        if (!(match.thread_ts && match.thread_ts === match.ts)) continue;
        const channelId = match.channel?.id;
        if (!channelId) continue;
        if (deadline && Date.now() >= deadline) { partial = true; break; }
        try {
          const msg = await this.getMessage(channelId, match.ts);
          apiCalls++;
          if (msg && msg.ts === match.ts) {
            match.reply_count = msg.reply_count || 0;
          }
        } catch (err) {
          // Skip — reply_count stays 0
        }
      }
    }

    return { matches: enriched, apiCalls, partial };
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
    }, 'search.messages');
  }

  async getUserInfo(userId) {
    return this._throttle(async () => {
      const result = await this.client.users.info({ user: userId });
      return result.user;
    }, 'users.info');
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
    }, 'conversations.list');
  }

  // users.conversations: only the channels the signed-in account is in. Its Slack limit is
  // higher than conversations.list, and the result is far smaller.
  async listMemberChannels(cursor = null, types = 'public_channel,private_channel') {
    return this._throttle(async () => {
      const params = { types, exclude_archived: true, limit: 200 };
      if (cursor) params.cursor = cursor;

      const result = await this.client.users.conversations(params);
      return {
        channels: result.channels || [],
        next_cursor: result.response_metadata?.next_cursor || null,
      };
    }, 'users.conversations');
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
    }, 'users.list');
  }

  async getChannelInfo(channelId) {
    return this._throttle(async () => {
      const result = await this.client.conversations.info({ channel: channelId });
      return result.channel;
    }, 'conversations.info');
  }

  async lookupUserByEmail(email) {
    return this._throttle(async () => {
      const result = await this.client.users.lookupByEmail({ email });
      return result.user;
    }, 'users.lookupByEmail');
  }

  async openDmChannel(userId) {
    return this._throttle(async () => {
      const result = await this.client.conversations.open({ users: userId });
      return result.channel;
    }, 'conversations.open');
  }

  async deleteMessage(channelId, ts) {
    return this._throttle(async () => {
      const result = await this.client.chat.delete({ channel: channelId, ts });
      return { ok: result.ok, channel: result.channel, ts: result.ts };
    }, 'chat.delete');
  }

  async postMessage(channel, text, threadTs = null) {
    return this._throttle(async () => {
      const params = { channel, text };
      if (threadTs) params.thread_ts = threadTs;

      const result = await this.client.chat.postMessage(params);
      return result;
    }, 'chat.postMessage');
  }
}

module.exports = SlackClient;
