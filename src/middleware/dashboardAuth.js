const { COOKIE, read, readCookie } = require('../utils/dashboardSession');
const { formatErrorResponse } = require('../utils/helpers');

const UNAUTHENTICATED = { code: 'DASHBOARD_UNAUTHENTICATED', status: 401, message: 'Dashboard login required.' };

/**
 * Session guard for /dashboard/api/* (data + management endpoints).
 * The login and public status routes mount this AFTER themselves, so they stay open.
 */
function dashboardAuth(req, res, next) {
  const token = readCookie(req, COOKIE);
  const session = token ? read(token) : null;
  if (!session) {
    return res.status(UNAUTHENTICATED.status).json(formatErrorResponse(UNAUTHENTICATED));
  }
  req.dashboardUser = session.u;
  next();
}

module.exports = dashboardAuth;
