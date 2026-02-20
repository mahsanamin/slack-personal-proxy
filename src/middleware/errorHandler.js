const logger = require('../utils/logger');
const { ERROR_CODES } = require('../utils/constants');
const { formatErrorResponse } = require('../utils/helpers');

function errorHandler(err, req, res, _next) {
  // If it's already a structured error from our code
  if (err.code && err.status) {
    return res.status(err.status).json(formatErrorResponse(err, err.details));
  }

  // Slack API errors
  if (err.code === 'slack_webapi_platform_error' || err.data?.error) {
    const slackError = err.data?.error || err.message;
    logger.error(`Slack API error: ${slackError}`, { path: req.path });

    if (slackError === 'channel_not_found') {
      return res.status(ERROR_CODES.CHANNEL_NOT_FOUND.status).json(
        formatErrorResponse(ERROR_CODES.CHANNEL_NOT_FOUND)
      );
    }
    if (slackError === 'user_not_found') {
      return res.status(ERROR_CODES.USER_NOT_FOUND.status).json(
        formatErrorResponse(ERROR_CODES.USER_NOT_FOUND)
      );
    }
    if (slackError === 'thread_not_found') {
      return res.status(ERROR_CODES.THREAD_NOT_FOUND.status).json(
        formatErrorResponse(ERROR_CODES.THREAD_NOT_FOUND)
      );
    }
    if (slackError === 'not_in_channel' || slackError === 'channel_not_found') {
      return res.status(403).json(
        formatErrorResponse({ code: 'NO_CHANNEL_ACCESS', status: 403, message: 'No access to this channel.' })
      );
    }

    return res.status(ERROR_CODES.SLACK_API_ERROR.status).json(
      formatErrorResponse(ERROR_CODES.SLACK_API_ERROR, { slack_error: slackError })
    );
  }

  // Generic errors
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack, path: req.path });

  res.status(ERROR_CODES.INTERNAL_ERROR.status).json(
    formatErrorResponse(ERROR_CODES.INTERNAL_ERROR)
  );
}

module.exports = errorHandler;
