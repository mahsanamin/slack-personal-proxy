# Project Structure

```
src/
  clients/
    slackClient.js            # Slack WebClient wrapper (auth, API methods, enrichment)
  config/
    index.js                  # Loads and validates all .env variables
    swagger.js                # OpenAPI/Swagger spec generation
  controllers/                # HTTP handlers — parse request, call service, return response
    activityController.js     # threads-im-in, my-threads
    adminController.js        # whitelist-status, cache-stats
    authController.js         # auth test
    channelController.js      # list channels, channel info, recent messages
    conversationController.js # thread fetch, message context
    mentionController.js      # all mentions, mention threads, by-channel
    messageController.js      # send message
    searchController.js       # search messages
    userController.js         # list users, user profile
  middleware/
    auth.js                   # X-API-Key validation (timing-safe)
    errorHandler.js           # Global error handler, Slack error mapping
    rateLimiter.js            # express-rate-limit
    validator.js              # express-validator rules for common params
  routes/                     # Express route definitions (all include Swagger JSDoc)
    index.js                  # Route aggregator
    activity.js, admin.js, auth.js, channels.js, conversations.js,
    mentions.js, messages.js, search.js, users.js
  services/                   # Business logic
    activityService.js        # Thread participation and authored threads
    cacheService.js           # node-cache wrapper (respects ENABLE_CACHING)
    channelService.js         # Channel listing, info, recent messages
    mentionService.js         # @mention search + thread enrichment
    messageService.js         # Message fetch, thread completion, send
    paginationService.js      # Generic cursor-based pagination with safety limits
    persistentCacheService.js # JSONL file-based message cache (delta sync)
    searchService.js          # Search with deduplication + thread context
    userService.js            # User listing and profiles
    whitelistService.js       # Write whitelist enforcement, name-to-ID resolution
  utils/
    constants.js              # Error codes (frozen objects) and cache key prefixes
    helpers.js                # Response formatters, token masking, parseBoolean
    logger.js                 # Winston logger (JSON in prod, colored in dev)
  server.js                   # Express app, service wiring, startup, graceful shutdown

tests/
  integration/api/
    health.test.js            # Health, auth, 404 tests via Supertest
  unit/
    middleware/auth.test.js   # Auth middleware
    services/
      cacheService.test.js
      paginationService.test.js
      whitelistService.test.js
    utils/helpers.test.js

scripts/
  generate-cert.sh            # Self-signed HTTPS cert generator
  grab-credentials.js         # Browser-based Slack credential extraction (Puppeteer)

data/                         # Persistent cache (JSONL files, git-ignored)
certs/                        # HTTPS certificates (git-ignored)
```
