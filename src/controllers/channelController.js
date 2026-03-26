const { formatSuccessResponse, parseBoolean } = require('../utils/helpers');
const { compactRecentMessage, compactMessage } = require('../utils/compactThread');

async function listChannels(req, res, next) {
  try {
    const { channelService } = req.services;
    const result = await channelService.listChannels();

    res.json(formatSuccessResponse(
      { channels: result.channels, total_count: result.total_count },
      { cached: result.cached, api_calls_made: result.api_calls_made }
    ));
  } catch (err) {
    next(err);
  }
}

async function getChannelInfo(req, res, next) {
  try {
    const { channelService } = req.services;
    const { channelId } = req.params;
    const result = await channelService.getChannelInfo(channelId);

    res.json(formatSuccessResponse(result, {
      cached: result.cached,
      cache_ttl_seconds: 300,
    }));
  } catch (err) {
    next(err);
  }
}

async function getRecentMessages(req, res, next) {
  try {
    const { messageService, channelService } = req.services;
    const { channelId } = req.params;
    const count = parseInt(req.query.count, 10) || 5;
    const includeThreads = parseBoolean(req.query.includeThreads, true);

    const verbose = parseBoolean(req.query.verbose, false);
    const result = await messageService.getRecentMessages(channelId, count, includeThreads);
    const messages = verbose ? result.messages : result.messages.map(compactRecentMessage);

    // Try to get channel name
    let channelName;
    try {
      const info = await channelService.getChannelInfo(channelId);
      channelName = info.name;
    } catch (_) {
      channelName = channelId;
    }

    res.json(formatSuccessResponse(
      {
        messages,
        channel_id: channelId,
        channel_name: channelName,
      },
      {
        parent_message_count: result.parent_count,
        threads_fetched: result.threads_fetched,
        total_thread_replies: result.total_thread_replies,
        cached: result.cached,
        api_calls_made: result.api_calls_made,
      }
    ));
  } catch (err) {
    next(err);
  }
}

async function getThreadReplies(req, res, next) {
  try {
    const { messageService } = req.services;
    const { channelId, threadTs } = req.params;
    const count = parseInt(req.query.count, 10) || 50;
    const oldest = req.query.oldest || null;
    const verbose = parseBoolean(req.query.verbose, false);

    const result = await messageService.getThreadReplies(channelId, threadTs, count, oldest);

    const parentMessage = verbose ? result.parent_message : compactMessage(result.parent_message);
    const replies = verbose ? result.replies : result.replies.map(compactMessage).filter(Boolean);

    res.json(formatSuccessResponse(
      {
        channel_id: result.channel_id,
        thread_ts: result.thread_ts,
        parent_message: parentMessage,
        replies,
        reply_count: result.reply_count,
      },
      {
        cached: result.cached,
        api_calls_made: result.api_calls_made,
      }
    ));
  } catch (err) {
    next(err);
  }
}

module.exports = { listChannels, getChannelInfo, getRecentMessages, getThreadReplies };
