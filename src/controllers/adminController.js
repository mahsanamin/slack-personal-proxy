const { formatSuccessResponse } = require('../utils/helpers');

async function getWhitelistStatus(req, res, next) {
  try {
    const { whitelistService } = req.services;
    const status = whitelistService.getStatus();

    res.json(formatSuccessResponse(status));
  } catch (err) {
    next(err);
  }
}

async function getCacheStats(req, res, next) {
  try {
    const { persistentCacheService, cacheService } = req.services;
    const stats = {
      memory_cache: cacheService.getStats ? cacheService.getStats() : { status: 'no stats method' },
      persistent_cache: persistentCacheService ? persistentCacheService.getStats() : { enabled: false },
    };

    res.json(formatSuccessResponse(stats));
  } catch (err) {
    next(err);
  }
}

module.exports = { getWhitelistStatus, getCacheStats };
