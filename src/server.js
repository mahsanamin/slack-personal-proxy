require('dotenv').config();

const fs = require('fs');
const https = require('https');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const { ERROR_CODES } = require('./utils/constants');
const { formatErrorResponse } = require('./utils/helpers');

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const ipWhitelist = require('./middleware/ipWhitelist');
const authMiddleware = require('./middleware/auth');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes');
const dashboardRoutes = require('./routes/dashboard');
const configStore = require('./services/configStore');

const SlackClient = require('./clients/slackClient');
const CacheService = require('./services/cacheService');
const PaginationService = require('./services/paginationService');
const WhitelistService = require('./services/whitelistService');
const ChannelService = require('./services/channelService');
const MessageService = require('./services/messageService');
const UserService = require('./services/userService');
const SearchService = require('./services/searchService');
const MentionService = require('./services/mentionService');
const ActivityService = require('./services/activityService');
const PersistentCacheService = require('./services/persistentCacheService');

const app = express();

// IP allowlist — first gate, before any processing
app.use(ipWhitelist);

// Security & parsing
// Helmet with relaxed CSP for Swagger UI (needs inline scripts/styles)
app.use((req, res, next) => {
  if (req.path.startsWith('/docs')) {
    return helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'", "data:"],
        },
      },
    })(req, res, next);
  }
  return helmet()(req, res, next);
});
app.use(cors());
app.use(express.json());
app.use(rateLimiter);

// Service instances (populated during init)
let services = null;

// Attach services to request
app.use((req, res, next) => {
  req.services = services;
  next();
});

// Swagger docs (no auth required, configurable)
if (config.enableSwagger) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Slack Personal Proxy - API Docs',
  }));
  app.get('/docs.json', (req, res) => res.json(swaggerSpec));
}

// Health endpoint (no auth required)
app.get('/health', async (req, res) => {
  const { cacheService, slackClient } = req.services;
  const { CACHE_PREFIXES } = require('./utils/constants');

  // Check cache first
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

  const healthData = {
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    slack_auth: slackAuth,
    slack_team: slackTeam,
    cache_status: config.enableCaching ? 'operational' : 'disabled',
    memory_usage_mb: Math.round(process.memoryUsage().rss / 1024 / 1024 * 10) / 10,
    timestamp: new Date().toISOString(),
  };

  cacheService.set(CACHE_PREFIXES.HEALTH, healthData, config.cache.healthTtl);
  res.json(healthData);
});

// Management dashboard (session-authed UI + endpoints; opt-out via ENABLE_DASHBOARD=false)
if (config.dashboard.enabled) {
  app.use('/dashboard', dashboardRoutes);
}

// API routes (auth required)
app.use('/api', authMiddleware, apiRoutes);

// MCP server (auth required, opt-in)
if (config.enableMcp) {
  const { mountMcp } = require('./mcp');
  app.use('/mcp', authMiddleware);
  mountMcp(app, () => services);
}

// 404 handler
app.use((req, res) => {
  res.status(ERROR_CODES.NOT_FOUND.status).json(
    formatErrorResponse(ERROR_CODES.NOT_FOUND, { path: req.path })
  );
});

// Global error handler
app.use(errorHandler);

// Initialize services and start server
async function start() {
  try {
    logger.info('Starting slack-personal-proxy...');

    // Create service instances
    const slackClient = new SlackClient();
    const cacheService = new CacheService();
    const paginationService = new PaginationService();
    const whitelistService = new WhitelistService(slackClient, paginationService);

    // Load the dashboard-managed state store (API keys, DM allowlist, encrypted secrets)
    await configStore.init();

    // Prefer credentials from the encrypted store; fall back to .env-derived config.
    let startupCreds = null;
    if (configStore.hasStoredSlackCreds() && configStore.hasMasterKey()) {
      try {
        startupCreds = configStore.getSlackCreds();
        logger.info('Using Slack credentials from encrypted store');
      } catch (err) {
        logger.error(`Could not decrypt stored Slack credentials (${err.message}); falling back to .env`);
      }
    }

    // Initialize Slack connection
    await slackClient.initialize(startupCreds || undefined);

    // Initialize whitelist (resolves channel/user names)
    await whitelistService.initialize();

    // Merge store DM-allowlist additions on top of the .env seed
    await whitelistService.reload(configStore.dmAllowlistEntries());

    // Hot-reload on dashboard changes — no restart needed
    configStore.on('slackCredsChanged', async () => {
      try {
        const creds = configStore.getSlackCreds();
        await slackClient.reinitialize(creds);
        cacheService.flush && cacheService.flush();
        logger.info('Slack client hot-reloaded after credential change');
      } catch (err) {
        logger.error(`Slack hot-reload failed: ${err.message}`);
      }
    });
    configStore.on('dmAllowlistChanged', async () => {
      try {
        await whitelistService.reload(configStore.dmAllowlistEntries());
      } catch (err) {
        logger.error(`DM allowlist hot-reload failed: ${err.message}`);
      }
    });

    // Initialize persistent cache if enabled
    let persistentCacheService = null;
    if (config.persistentCache.enabled) {
      persistentCacheService = new PersistentCacheService();
      await persistentCacheService.initialize();
    }

    // Build higher-level services
    const channelService = new ChannelService(slackClient, cacheService, paginationService, whitelistService);
    const messageService = new MessageService(slackClient, cacheService, paginationService, whitelistService, persistentCacheService);
    const userService = new UserService(slackClient, cacheService, paginationService);
    const searchService = new SearchService(slackClient, cacheService, messageService, whitelistService);
    const mentionService = new MentionService(slackClient, cacheService, messageService, whitelistService);
    const activityService = new ActivityService(slackClient, cacheService, messageService, whitelistService);

    services = {
      slackClient,
      cacheService,
      paginationService,
      whitelistService,
      channelService,
      messageService,
      userService,
      searchService,
      mentionService,
      activityService,
      persistentCacheService,
    };

    let server;
    if (config.enableHttps) {
      const key = fs.readFileSync(config.httpsKeyPath);
      const cert = fs.readFileSync(config.httpsCertPath);
      server = https.createServer({ key, cert }, app);
      server.listen(config.port, () => {
        logger.info(`Server listening on HTTPS port ${config.port} (${config.nodeEnv})`);
      });
    } else {
      server = app.listen(config.port, () => {
        logger.info(`Server listening on port ${config.port} (${config.nodeEnv})`);
      });
    }

    // Boot self-check: surface the effective network exposure and dashboard posture.
    const bindAddress = process.env.BIND_ADDRESS || '127.0.0.1';
    const exposed = bindAddress === '0.0.0.0' || config.allowedIps.includes('0.0.0.0');
    logger.info(
      `Exposure: bind=${bindAddress} onNetwork=${exposed} https=${config.enableHttps} ` +
      `allowlist=${config.allowedIps.length ? config.allowedIps.join('|') : 'localhost-only'}`
    );
    if (config.dashboard.enabled) {
      const dashReady = Boolean(config.dashboard.user && config.dashboard.passwordHash);
      logger.info(`Dashboard: /dashboard enabled=${dashReady ? 'yes' : 'NOT configured (set DASHBOARD_USER/PASSWORD_HASH)'} masterKey=${config.dashboard.masterKey ? 'set' : 'MISSING'}`);
      if (exposed && !config.enableHttps) {
        logger.warn('SECURITY: bound beyond localhost without HTTPS — use a trusted tunnel and strong secrets.');
      }
    }

    // Graceful shutdown
    const shutdown = (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(() => {
        logger.info('Server closed.');
        process.exit(0);
      });
      setTimeout(() => {
        logger.warn('Forced shutdown after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.error(`Failed to start: ${err.message}`);
    process.exit(1);
  }
}

// Only start if run directly (not imported for testing)
if (require.main === module) {
  start();
}

module.exports = { app, start };
