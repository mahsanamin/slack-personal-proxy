const { resolveAccess, assertRead, assertWrite } = require('../services/keyAccess');

/**
 * Router param guard for :channelId routes. Attach with router.param('channelId', ...).
 * GET is a read. Every other method (send, delete) is a write and needs a
 * read_write key that is allowed to use the channel.
 */
function channelAccessParam(req, res, next, channelId) {
  try {
    const access = resolveAccess(req.apiKey);
    if (req.method === 'GET' || req.method === 'HEAD') {
      assertRead(access, channelId);
    } else {
      assertWrite(access, channelId);
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = channelAccessParam;
