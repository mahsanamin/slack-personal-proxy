const { query, param, validationResult } = require('express-validator');
const { formatErrorResponse } = require('../utils/helpers');
const { ERROR_CODES } = require('../utils/constants');

const CHANNEL_ID_REGEX = /^[CDGW][A-Z0-9]+$/;
const TIMESTAMP_REGEX = /^\d+\.\d+$/;

const validateChannelId = param('channelId')
  .matches(CHANNEL_ID_REGEX)
  .withMessage('Invalid channel ID format. Must start with C, D, G, or W followed by alphanumeric characters.');

const validateCount = (min = 1, max = 10, defaultValue = 5) =>
  query('count')
    .optional()
    .isInt({ min, max })
    .withMessage(`Count must be between ${min} and ${max}.`)
    .toInt();

const validateBoolean = (field, defaultValue = 'true') =>
  query(field)
    .optional()
    .isIn(['true', 'false', '1', '0'])
    .withMessage(`${field} must be a boolean value (true/false).`);

const validateTimestamp = param('threadTs')
  .matches(TIMESTAMP_REGEX)
  .withMessage('Invalid timestamp format. Expected format: 1234567890.123456');

const validateSearchQuery = query('query')
  .notEmpty()
  .withMessage('Search query is required.')
  .isLength({ min: 1, max: 500 })
  .withMessage('Search query must be between 1 and 500 characters.');

const validateSortOrder = query('sortOrder')
  .optional()
  .isIn(['timestamp', 'score'])
  .withMessage('sortOrder must be "timestamp" or "score".');

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(ERROR_CODES.VALIDATION_ERROR.status).json(
      formatErrorResponse(ERROR_CODES.VALIDATION_ERROR, {
        errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
      })
    );
  }
  next();
}

module.exports = {
  validateChannelId,
  validateCount,
  validateBoolean,
  validateTimestamp,
  validateSearchQuery,
  validateSortOrder,
  handleValidationErrors,
};
