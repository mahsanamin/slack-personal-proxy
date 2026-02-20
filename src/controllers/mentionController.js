const { formatSuccessResponse, parseBoolean } = require('../utils/helpers');

async function getAllMentions(req, res, next) {
  try {
    const { mentionService } = req.services;
    const count = parseInt(req.query.count, 10) || 20;
    const includeThreads = parseBoolean(req.query.includeThreads, true);

    const result = await mentionService.getAllMentions(count, includeThreads);

    res.json(formatSuccessResponse(
      { mentions: result.mentions, grouped_by_channel: result.grouped_by_channel },
      { total_mentions: result.total_mentions, api_calls_made: result.api_calls_made }
    ));
  } catch (err) {
    next(err);
  }
}

async function getMentionThreads(req, res, next) {
  try {
    const { mentionService } = req.services;
    const count = parseInt(req.query.count, 10) || 20;

    const result = await mentionService.getMentionThreads(count);

    res.json(formatSuccessResponse(
      { threads: result.threads },
      { total_threads: result.total_threads, api_calls_made: result.api_calls_made }
    ));
  } catch (err) {
    next(err);
  }
}

async function getMentionsByChannel(req, res, next) {
  try {
    const { mentionService } = req.services;
    const { channelId } = req.params;
    const count = parseInt(req.query.count, 10) || 20;
    const includeThreads = parseBoolean(req.query.includeThreads, true);

    const result = await mentionService.getMentionsByChannel(channelId, count, includeThreads);

    res.json(formatSuccessResponse(
      { mentions: result.mentions },
      { total_mentions: result.total_mentions, api_calls_made: result.api_calls_made }
    ));
  } catch (err) {
    next(err);
  }
}

module.exports = { getAllMentions, getMentionThreads, getMentionsByChannel };
