const { formatSuccessResponse, parseBoolean } = require('../utils/helpers');
const { compactMention, compactThread } = require('../utils/compactThread');

async function getAllMentions(req, res, next) {
  try {
    const { mentionService } = req.services;
    const count = parseInt(req.query.count, 10) || 20;
    const includeThreads = parseBoolean(req.query.includeThreads, true);
    const verbose = parseBoolean(req.query.verbose, false);

    const result = await mentionService.getAllMentions(count, includeThreads);
    const mentions = verbose ? result.mentions : result.mentions.map(compactMention);

    res.json(formatSuccessResponse(
      { mentions, grouped_by_channel: result.grouped_by_channel },
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
    const verbose = parseBoolean(req.query.verbose, false);

    const result = await mentionService.getMentionThreads(count);
    const threads = verbose ? result.threads : result.threads.map(compactThread);

    res.json(formatSuccessResponse(
      { threads },
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
    const verbose = parseBoolean(req.query.verbose, false);

    const result = await mentionService.getMentionsByChannel(channelId, count, includeThreads);
    const mentions = verbose ? result.mentions : result.mentions.map(compactMention);

    res.json(formatSuccessResponse(
      { mentions },
      { total_mentions: result.total_mentions, api_calls_made: result.api_calls_made }
    ));
  } catch (err) {
    next(err);
  }
}

module.exports = { getAllMentions, getMentionThreads, getMentionsByChannel };
