const rateLimit = require('express-rate-limit');
const config = require('../config');
const { formatErrorResponse } = require('../utils/helpers');

const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json(
      formatErrorResponse(
        { code: 'RATE_LIMIT_EXCEEDED', status: 429, message: 'Too many requests. Please try again later.' }
      )
    );
  },
});

module.exports = rateLimiter;
