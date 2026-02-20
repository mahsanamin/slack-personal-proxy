const NodeCache = require('node-cache');
const config = require('../config');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.enabled = config.enableCaching;
    this.cache = new NodeCache({
      useClones: true,
      stdTTL: 300,
      checkperiod: 60,
    });

    if (!this.enabled) {
      logger.info('Caching is disabled');
    }
  }

  get(key) {
    if (!this.enabled) return undefined;
    return this.cache.get(key);
  }

  set(key, value, ttl = undefined) {
    if (!this.enabled) return false;
    return this.cache.set(key, value, ttl);
  }

  del(key) {
    if (!this.enabled) return 0;
    return this.cache.del(key);
  }

  flush() {
    this.cache.flushAll();
  }

  getStats() {
    return this.cache.getStats();
  }

  has(key) {
    if (!this.enabled) return false;
    return this.cache.has(key);
  }
}

module.exports = CacheService;
