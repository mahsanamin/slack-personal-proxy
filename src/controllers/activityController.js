const { formatSuccessResponse, parseBoolean } = require('../utils/helpers');
const { compactThread } = require('../utils/compactThread');

async function getThreadsImIn(req, res, next) {
  try {
    const { activityService } = req.services;
    const count = parseInt(req.query.count, 10) || 20;
    const verbose = parseBoolean(req.query.verbose, false);

    const result = await activityService.getThreadsImIn(count);
    const threads = verbose ? result.threads : result.threads.map(compactThread);

    res.json(formatSuccessResponse(
      { threads },
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
    const verbose = parseBoolean(req.query.verbose, false);

    const result = await activityService.getMyThreads(count, includeReplies);
    const threads = verbose ? result.threads : result.threads.map(compactThread);

    res.json(formatSuccessResponse(
      { threads },
      { total_threads: result.total_threads, api_calls_made: result.api_calls_made }
    ));
  } catch (err) {
    next(err);
  }
}

module.exports = { getThreadsImIn, getMyThreads };
