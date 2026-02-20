function formatSuccessResponse(data, meta = {}) {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

function formatErrorResponse(errorCode, details = null) {
  const response = {
    success: false,
    error: {
      code: errorCode.code,
      message: errorCode.message,
    },
  };
  if (details) {
    response.error.details = details;
  }
  return response;
}

function maskToken(token) {
  if (!token || typeof token !== 'string') return '***';
  if (token.length <= 8) return '***';
  return token.substring(0, 4) + '...' + token.substring(token.length - 4);
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const str = String(value).toLowerCase();
  if (str === 'true' || str === '1' || str === 'yes') return true;
  if (str === 'false' || str === '0' || str === 'no') return false;
  return defaultValue;
}

module.exports = {
  formatSuccessResponse,
  formatErrorResponse,
  maskToken,
  parseBoolean,
};
