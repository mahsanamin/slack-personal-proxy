const crypto = require('crypto');
const config = require('../config');
const { ERROR_CODES } = require('../utils/constants');
const { formatErrorResponse } = require('../utils/helpers');

function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(ERROR_CODES.MISSING_API_KEY.status).json(
      formatErrorResponse(ERROR_CODES.MISSING_API_KEY)
    );
  }

  // Use timing-safe comparison to prevent timing attacks
  const expected = Buffer.from(config.apiKey);
  const provided = Buffer.from(apiKey);

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return res.status(ERROR_CODES.INVALID_API_KEY.status).json(
      formatErrorResponse(ERROR_CODES.INVALID_API_KEY)
    );
  }

  next();
}

module.exports = authMiddleware;
