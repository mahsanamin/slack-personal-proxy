require('dotenv').config();

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return value === 'true' || value === '1';
}

function parseInt_(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseList(value) {
  if (!value || value.trim() === '') return [];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

const config = Object.freeze({
  port: parseInt_(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Slack credentials
  slack: Object.freeze({
    botToken: process.env.SLACK_BOT_TOKEN || '',
    cookie: process.env.SLACK_COOKIE || '',
    token: process.env.SLACK_TOKEN || '',
  }),

  // API security
  apiKey: process.env.API_KEY || '',

  // Rate limiting
  rateLimit: Object.freeze({
    windowMs: parseInt_(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    maxRequests: parseInt_(process.env.RATE_LIMIT_MAX_REQUESTS, 200),
  }),

  // Slack API throttle (min ms between Slack API calls to avoid 429s)
  slackThrottleMs: parseInt_(process.env.SLACK_THROTTLE_MS, 100),

  // Caching
  enableCaching: parseBoolean(process.env.ENABLE_CACHING, true),
  cache: Object.freeze({
    channelTtl: parseInt_(process.env.CHANNEL_CACHE_TTL_SECONDS, 300),
    userTtl: parseInt_(process.env.USER_CACHE_TTL_SECONDS, 300),
    threadTtl: parseInt_(process.env.THREAD_CACHE_TTL_SECONDS, 120),
    healthTtl: parseInt_(process.env.HEALTH_CACHE_TTL_SECONDS, 300),
  }),

  // Pagination
  maxPaginationCalls: parseInt_(process.env.MAX_PAGINATION_CALLS, 10),

  // Whitelist
  whitelist: Object.freeze({
    writeChannels: parseList(process.env.ALLOWED_WRITE_CHANNELS),
    dmUsers: parseList(process.env.ALLOWED_DM_USERS),
  }),

  // IP allowlist (CIDR ranges and single IPs)
  allowedIps: parseList(process.env.ALLOWED_IPS),

  // Write operations
  enableWriteOps: parseBoolean(process.env.ENABLE_WRITE_OPS, false),

  // Swagger docs
  enableSwagger: parseBoolean(process.env.ENABLE_SWAGGER, true),

  // MCP server
  enableMcp: parseBoolean(process.env.ENABLE_MCP, false),

  // Persistent file-based cache
  persistentCache: Object.freeze({
    enabled: parseBoolean(process.env.ENABLE_PERSISTENT_CACHE, false),
    dataDir: process.env.PERSISTENT_CACHE_DIR || 'data',
    maxFetchOnSync: parseInt_(process.env.PERSISTENT_CACHE_MAX_FETCH, 200),
  }),

  // HTTPS
  enableHttps: parseBoolean(process.env.ENABLE_HTTPS, false),
  httpsKeyPath: process.env.HTTPS_KEY_PATH || '/app/certs/server.key',
  httpsCertPath: process.env.HTTPS_CERT_PATH || '/app/certs/server.cert',
});

module.exports = config;
