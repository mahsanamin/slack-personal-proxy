const { formatSuccessResponse } = require('../utils/helpers');
const { parseBoolean } = require('../utils/helpers');

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

    const result = await messageService.getRecentMessages(channelId, count, includeThreads);

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
        messages: result.messages,
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

module.exports = { listChannels, getChannelInfo, getRecentMessages };
