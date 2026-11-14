const { formatSuccessResponse, parseBoolean } = require('../utils/helpers');
const { compactThread } = require('../utils/compactThread');
const { resolveAccess, scopeSignature } = require('../services/keyAccess');
const { reuse } = require('../utils/responseReuse');
const config = require('../config');

async function getThreadsImIn(req, res, next) {
  try {
    const { activityService } = req.services;
    const count = parseInt(req.query.count, 10) || 20;
    const verbose = parseBoolean(req.query.verbose, false);

    const access = resolveAccess(req.apiKey);
    // The same question asked again within a short time gets the saved answer.
    const { value: result, reused, ageSeconds } = await reuse(
      req.services.cacheService,
      ['activity.threads', req.services.slackClient.currentUserId, count, scopeSignature(access)],
      config.cache.activityTtl,
      () => activityService.getThreadsImIn(count, access)
    );
    const threads = verbose ? result.threads : result.threads.map(compactThread);
    res.locals.requestNote = { reused, partial: result.partial };

    res.json(formatSuccessResponse(
      { threads },
      {
        total_threads: result.total_threads,
        threads_with_new_activity: result.threads_with_new_activity,
        api_calls_made: reused ? 0 : result.api_calls_made,
        partial: Boolean(result.partial),
        reused,
        age_seconds: ageSeconds,
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

    const access = resolveAccess(req.apiKey);
    const { value: result, reused, ageSeconds } = await reuse(
      req.services.cacheService,
      ['activity.my-threads', req.services.slackClient.currentUserId, count, includeReplies, scopeSignature(access)],
      config.cache.activityTtl,
      () => activityService.getMyThreads(count, includeReplies, access)
    );
    const threads = verbose ? result.threads : result.threads.map(compactThread);
    res.locals.requestNote = { reused, partial: result.partial };

    res.json(formatSuccessResponse(
      { threads },
      {
        total_threads: result.total_threads,
        api_calls_made: reused ? 0 : result.api_calls_made,
        partial: Boolean(result.partial),
        reused,
        age_seconds: ageSeconds,
      }
    ));
  } catch (err) {
    next(err);
  }
}

module.exports = { getThreadsImIn, getMyThreads };
