const configStore = require('../services/configStore');
const { ERROR_CODES } = require('../utils/constants');
const { formatErrorResponse } = require('../utils/helpers');

/**
 * API-key auth for /api/* (and /mcp).
 *
 * Verification is synchronous and in-memory: the legacy .env API_KEY plus any active
 * dashboard-minted keys (matched by SHA-256 fingerprint via configStore.verifyApiKey).
 * Backward compatible — every existing X-API-Key caller keeps working.
 */
function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(ERROR_CODES.MISSING_API_KEY.status).json(
      formatErrorResponse(ERROR_CODES.MISSING_API_KEY)
    );
  }

  const match = configStore.verifyApiKey(apiKey);
  if (!match) {
    return res.status(ERROR_CODES.INVALID_API_KEY.status).json(
      formatErrorResponse(ERROR_CODES.INVALID_API_KEY)
    );
  }

  req.apiKey = match;
  next();
}

module.exports = authMiddleware;
