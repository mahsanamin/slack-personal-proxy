const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../utils/logger');
const { formatErrorResponse } = require('../utils/helpers');

// This is a personal tool behind an IP allowlist + auth, so the limiter is lenient:
//   - the dashboard UI and its data calls, plus /health, are never limited (the browser
//     fires many calls per view: status, four Overview panels, background refreshes),
//   - RATE_LIMIT_MAX_REQUESTS<=0 disables limiting entirely,
//   - otherwise only /api/* (programmatic clients) is limited, generously.
let rateLimiter;

if (config.rateLimit.maxRequests <= 0) {
  logger.info('Rate limiter disabled (RATE_LIMIT_MAX_REQUESTS <= 0)');
  rateLimiter = (req, res, next) => next();
} else {
  rateLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health' || req.path.startsWith('/dashboard'),
    handler: (req, res) => {
      res.status(429).json(
        formatErrorResponse(
          { code: 'RATE_LIMIT_EXCEEDED', status: 429, message: 'Too many requests. Please try again later.' }
        )
      );
    },
  });
}

module.exports = rateLimiter;
