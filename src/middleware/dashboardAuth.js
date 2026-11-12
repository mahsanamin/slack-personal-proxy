const { COOKIE, read, readCookie, issue, cookieOptions, needsRenewal } = require('../utils/dashboardSession');
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
  // "Remember this machine" sessions renew once past half their lifetime. Renewal keeps
  // the original sign-in time, so the absolute cap still applies.
  if (session.r && needsRenewal(session)) {
    res.cookie(COOKIE, issue(session.u, { remember: true, iat: session.iat }), cookieOptions(true));
  }
  next();
}

module.exports = dashboardAuth;
