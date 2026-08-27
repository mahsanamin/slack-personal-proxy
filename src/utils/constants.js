const ERROR_CODES = Object.freeze({
  // Auth errors
  MISSING_API_KEY: { code: 'MISSING_API_KEY', status: 401, message: 'API key is required. Provide X-API-Key header.' },
  INVALID_API_KEY: { code: 'INVALID_API_KEY', status: 401, message: 'Invalid API key.' },

  // Validation errors
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', status: 400, message: 'Validation error.' },
  INVALID_CHANNEL_ID: { code: 'INVALID_CHANNEL_ID', status: 400, message: 'Invalid channel ID format.' },
  INVALID_COUNT: { code: 'INVALID_COUNT', status: 400, message: 'Count must be between 1 and the maximum allowed value.' },
  INVALID_TIMESTAMP: { code: 'INVALID_TIMESTAMP', status: 400, message: 'Invalid Slack message timestamp format.' },
  INVALID_PERMALINK: { code: 'INVALID_PERMALINK', status: 400, message: 'Invalid Slack permalink URL. Expected format: https://<workspace>.slack.com/archives/<channelId>/p<timestamp>' },

  // Authorization errors
  IP_NOT_ALLOWED: { code: 'IP_NOT_ALLOWED', status: 403, message: 'Access denied. Your IP is not in the allowlist.' },
  WRITE_CHANNEL_NOT_WHITELISTED: { code: 'WRITE_CHANNEL_NOT_WHITELISTED', status: 403, message: 'Channel is not in the write whitelist.' },
  USER_NOT_WHITELISTED: { code: 'USER_NOT_WHITELISTED', status: 403, message: 'User is not in the DM whitelist.' },
  WRITE_OPS_DISABLED: { code: 'WRITE_OPS_DISABLED', status: 403, message: 'Write operations are disabled.' },
  DM_APPROVALS_DISABLED: { code: 'DM_APPROVALS_DISABLED', status: 403, message: 'DM approval requests are disabled.' },
  DM_APPROVAL_STORAGE_UNAVAILABLE: { code: 'DM_APPROVAL_STORAGE_UNAVAILABLE', status: 503, message: 'DM approvals require DASHBOARD_MASTER_KEY so pending messages can be encrypted.' },
  APPROVAL_NOT_PENDING: { code: 'APPROVAL_NOT_PENDING', status: 409, message: 'This approval request is no longer pending.' },

  // Not found
  CHANNEL_NOT_FOUND: { code: 'CHANNEL_NOT_FOUND', status: 404, message: 'Channel not found.' },
  USER_NOT_FOUND: { code: 'USER_NOT_FOUND', status: 404, message: 'User not found.' },
  THREAD_NOT_FOUND: { code: 'THREAD_NOT_FOUND', status: 404, message: 'Thread not found.' },

  // Slack API errors
  SLACK_API_ERROR: { code: 'SLACK_API_ERROR', status: 502, message: 'Slack API error.' },

  // Server errors
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500, message: 'Internal server error.' },
  NOT_FOUND: { code: 'NOT_FOUND', status: 404, message: 'Endpoint not found.' },
});

const CACHE_PREFIXES = Object.freeze({
  CHANNEL_LIST: 'channels:list',
  CHANNEL_INFO: 'channels:info:',
  USER_LIST: 'users:list',
  USER_PROFILE: 'users:profile:',
  USER_NAME: 'users:name:',
  THREAD: 'thread:',
  USER_BY_EMAIL: 'users:by-email:',
  HEALTH: 'health:status',
});

module.exports = { ERROR_CODES, CACHE_PREFIXES };
