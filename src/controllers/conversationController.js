const { formatSuccessResponse } = require('../utils/helpers');

async function getThread(req, res, next) {
  try {
    const { messageService } = req.services;
    const { channelId, threadTs } = req.params;

    const result = await messageService.getCompleteThread(channelId, threadTs);

    res.json(formatSuccessResponse(
      {
        parent: result.parent,
        replies: result.replies,
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

module.exports = { getThread };
