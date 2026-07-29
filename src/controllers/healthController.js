const config = require('../config');
const logger = require('../utils/logger');
const { CACHE_PREFIXES } = require('../utils/constants');

/**
 * Health check. This must report what actually works, not what we intended.
 *
 * Two traps this deliberately avoids:
 *   1. `status` used to be hardcoded 'healthy', so a completely dead proxy still
 *      looked fine to anything polling it.
 *   2. Only auth.test was probed. auth.test bypasses the throttle queue, so it
 *      kept succeeding while every real endpoint failed, and health reported
 *      "valid" for days while nothing worked.
 *
 * So: probe a real throttled data call as well, report degraded, answer 503 when
 * degraded, and never cache a failure (a bad result must clear on the next poll).
 */
async function healthCheck(req, res) {
  const { cacheService, slackClient } = req.services;

  // Only successful results are cached, so a cache hit is always healthy.
  const cached = cacheService.get(CACHE_PREFIXES.HEALTH);
  if (cached) {
    return res.json({ ...cached, uptime: Math.floor(process.uptime()) });
  }

  let slackAuth = 'unknown';
  let slackTeam = 'unknown';
  try {
    const authResult = await slackClient.authTest();
    slackAuth = 'valid';
    slackTeam = authResult.team;
  } catch (err) {
    slackAuth = 'error';
    logger.warn(`Health check: Slack auth failed - ${err.message}`);
  }

  // End-to-end probe: goes through _throttle, i.e. the same path every real
  // endpoint uses. This is what catches "auth fine, everything else broken".
  let slackApi = 'unknown';
  let slackApiError;
  try {
    await slackClient.healthProbe();
    slackApi = 'ok';
  } catch (err) {
    slackApi = 'error';
    slackApiError = (err.data && err.data.error) || err.message;
    logger.warn(`Health check: Slack data call failed - ${slackApiError}`);
  }

  const degraded = slackAuth !== 'valid' || slackApi !== 'ok';

  const healthData = {
    status: degraded ? 'degraded' : 'healthy',
    uptime: Math.floor(process.uptime()),
    slack_auth: slackAuth,
    slack_team: slackTeam,
    slack_api: slackApi,
    ...(slackApiError ? { slack_api_error: slackApiError } : {}),
    cache_status: config.enableCaching ? 'operational' : 'disabled',
    memory_usage_mb: Math.round(process.memoryUsage().rss / 1024 / 1024 * 10) / 10,
    timestamp: new Date().toISOString(),
  };

  if (degraded) {
    return res.status(503).json(healthData);
  }

  cacheService.set(CACHE_PREFIXES.HEALTH, healthData, config.cache.healthTtl);
  return res.json(healthData);
}

module.exports = { healthCheck };
