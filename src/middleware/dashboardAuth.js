const { COOKIE, read, readCookie, issue, cookieOptions } = require('../utils/dashboardSession');
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
  // "Remember this machine" sessions slide: each request renews the cookie, so an
  // active user stays signed in and only idle users are logged out.
  if (session.r) {
    res.cookie(COOKIE, issue(session.u, { remember: true }), cookieOptions(true));
  }
  next();
}

module.exports = dashboardAuth;
