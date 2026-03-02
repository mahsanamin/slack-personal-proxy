const { formatSuccessResponse, parseBoolean } = require('../utils/helpers');
const { compactMessage, compactContextResult } = require('../utils/compactThread');
const { ERROR_CODES } = require('../utils/constants');

function parsePermalink(url) {
  const match = url.match(/\/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/);
  if (!match) return null;
  return { channelId: match[1], threadTs: `${match[2]}.${match[3]}` };
}

async function getThreadByPermalink(req, res, next) {
  try {
    const { url } = req.query;
    const parsed = parsePermalink(url || '');
    if (!parsed) {
      throw { ...ERROR_CODES.INVALID_PERMALINK };
    }

    const { messageService } = req.services;
    const verbose = parseBoolean(req.query.verbose, false);

    const result = await messageService.getCompleteThread(parsed.channelId, parsed.threadTs);

    const parent = verbose ? result.parent : compactMessage(result.parent);
    const replies = verbose ? result.replies : result.replies.map(compactMessage).filter(Boolean);

    res.json(formatSuccessResponse(
      {
        parent,
        replies,
        participants: result.participants,
        reply_count: result.reply_count,
        channel_id: parsed.channelId,
        thread_ts: parsed.threadTs,
      },
      {
        cached: result.cached,
        api_calls_made: result.api_calls_made,
        complete: !result.truncated,
      }
    ));
  } catch (err) {
    next(err);
  }
}

async function getThread(req, res, next) {
  try {
    const { messageService } = req.services;
    const { channelId, threadTs } = req.params;
    const verbose = parseBoolean(req.query.verbose, false);

    const result = await messageService.getCompleteThread(channelId, threadTs);

    const parent = verbose ? result.parent : compactMessage(result.parent);
    const replies = verbose ? result.replies : result.replies.map(compactMessage).filter(Boolean);

    res.json(formatSuccessResponse(
      {
        parent,
        replies,
        participants: result.participants,
        reply_count: result.reply_count,
      },
      {
        cached: result.cached,
        api_calls_made: result.api_calls_made,
        complete: !result.truncated,
      }
    ));
  } catch (err) {
    next(err);
  }
}

async function getContext(req, res, next) {
  try {
    const { messageService } = req.services;
    const { channelId } = req.params;
    const { messageTs } = req.query;
    const before = Math.min(parseInt(req.query.before, 10) || 5, 10);
    const after = Math.min(parseInt(req.query.after, 10) || 5, 10);

    const slackClient = req.services.slackClient;
    let apiCalls = 0;

    // Fetch messages around the target
    // "latest" = messageTs gives us the target + messages before it
    const beforeResult = await slackClient.getConversationHistory(channelId, before + 1, null);
    apiCalls++;

    // We need to use the Slack API with oldest/latest params for precise context
    // Fetch messages before target
    const beforeMessages = await slackClient.client.conversations.history({
      channel: channelId,
      latest: messageTs,
      inclusive: true,
      limit: before + 1,
    });
    apiCalls++;

    // Fetch messages after target
    const afterMessages = await slackClient.client.conversations.history({
      channel: channelId,
      oldest: messageTs,
      inclusive: true,
      limit: after + 1,
    });
    apiCalls++;

    const beforeMsgs = (beforeMessages.messages || []).reverse();
    const afterMsgs = (afterMessages.messages || []);

    // Find the target message
    const targetMsg = beforeMsgs.find(m => m.ts === messageTs)
      || afterMsgs.find(m => m.ts === messageTs);

    if (!targetMsg) {
      const { ERROR_CODES } = require('../utils/constants');
      throw ERROR_CODES.NOT_FOUND;
    }

    const isInThread = !!(targetMsg.thread_ts && targetMsg.thread_ts !== targetMsg.ts);

    const result = {
      target_message: {
        ts: targetMsg.ts,
        user: targetMsg.user,
        text: targetMsg.text,
        is_in_thread: isInThread,
        thread_ts: isInThread ? targetMsg.thread_ts : null,
      },
      context_type: isInThread ? 'thread' : 'channel',
      messages: {
        before: beforeMsgs.filter(m => m.ts < messageTs).slice(-before),
        after: afterMsgs.filter(m => m.ts > messageTs).slice(0, after),
      },
    };

    // If target is in a thread, also fetch the complete thread
    if (isInThread) {
      try {
        const threadData = await messageService.getCompleteThread(channelId, targetMsg.thread_ts);
        apiCalls += threadData.api_calls_made || 0;
        const targetPos = threadData.replies?.findIndex(r => r.ts === messageTs);
        result.thread_context = {
          parent: threadData.parent,
          all_replies: threadData.replies,
          target_position: targetPos >= 0 ? targetPos + 1 : 0,
        };
      } catch (err) {
        // Thread fetch failed, continue with channel context
      }
    }

    const verbose = parseBoolean(req.query.verbose, false);
    const data = verbose ? result : compactContextResult(result);

    res.json(formatSuccessResponse(data, { api_calls_made: apiCalls }));
  } catch (err) {
    next(err);
  }
}

module.exports = { getThread, getContext, getThreadByPermalink, parsePermalink };
