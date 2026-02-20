const { formatSuccessResponse, parseBoolean } = require('../utils/helpers');

async function getThreadsImIn(req, res, next) {
  try {
    const { activityService } = req.services;
    const count = parseInt(req.query.count, 10) || 20;

    const result = await activityService.getThreadsImIn(count);

    res.json(formatSuccessResponse(
      { threads: result.threads },
      {
        total_threads: result.total_threads,
        threads_with_new_activity: result.threads_with_new_activity,
        api_calls_made: result.api_calls_made,
      }
    ));
  } catch (err) {
    next(err);
  }
}

async function getMyThreads(req, res, next) {
  try {
    const { activityService } = req.services;
    const count = parseInt(req.query.count, 10) || 20;
    const includeReplies = parseBoolean(req.query.includeReplies, true);

    const result = await activityService.getMyThreads(count, includeReplies);

    res.json(formatSuccessResponse(
      { threads: result.threads },
      { total_threads: result.total_threads, api_calls_made: result.api_calls_made }
    ));
  } catch (err) {
    next(err);
  }
}

module.exports = { getThreadsImIn, getMyThreads };
