require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const { ERROR_CODES } = require('./utils/constants');
const { formatErrorResponse } = require('./utils/helpers');

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const authMiddleware = require('./middleware/auth');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

const SlackClient = require('./clients/slackClient');
const CacheService = require('./services/cacheService');
const PaginationService = require('./services/paginationService');
const WhitelistService = require('./services/whitelistService');
const ChannelService = require('./services/channelService');
const MessageService = require('./services/messageService');
const UserService = require('./services/userService');
const SearchService = require('./services/searchService');

const app = express();

// Security & parsing
app.use(helmet());
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

// Swagger docs (no auth required)
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Slack Personal Proxy - API Docs',
}));
app.get('/docs.json', (req, res) => res.json(swaggerSpec));

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

// API routes (auth required)
app.use('/api', authMiddleware, apiRoutes);

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

    // Initialize Slack connection
    await slackClient.initialize();

    // Initialize whitelist (resolves channel/user names)
    await whitelistService.initialize();

    // Build higher-level services
    const channelService = new ChannelService(slackClient, cacheService, paginationService, whitelistService);
    const messageService = new MessageService(slackClient, cacheService, paginationService, whitelistService);
    const userService = new UserService(slackClient, cacheService, paginationService);
    const searchService = new SearchService(slackClient, cacheService, messageService, whitelistService);

    services = {
      slackClient,
      cacheService,
      paginationService,
      whitelistService,
      channelService,
      messageService,
      userService,
      searchService,
    };

    const server = app.listen(config.port, () => {
      logger.info(`Server listening on port ${config.port} (${config.nodeEnv})`);
    });

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
