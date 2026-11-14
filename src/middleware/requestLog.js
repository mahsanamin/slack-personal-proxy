const logger = require('../utils/logger');
const { runWithContext, currentContext } = require('../utils/requestContext');

const SLOW_MS = 15000;

/**
 * One log line per API request: who called (key label), what, the status, how long it
 * took, and how many Slack calls it caused. Without this there is no way to tell which
 * consumer is generating the Slack load.
 *
 * Never logged: the API key itself, query values (a search query is private content) and
 * request bodies. Only the query parameter names are kept, plus count, which is the
 * number that drives how much work a request does.
 */
function requestLog(req, res, next) {
  const started = Date.now();

  runWithContext(() => {
    const ctx = currentContext();

    res.on('finish', () => {
      const ms = Date.now() - started;
      const label = req.apiKey ? (req.apiKey.label || req.apiKey.id || 'key') : 'none';
      const keys = Object.keys(req.query || {});
      const count = req.query && req.query.count ? ` count=${String(req.query.count).slice(0, 6)}` : '';
      const note = res.locals.requestNote || {};
      const methods = Object.entries(ctx.byMethod).map(([m, n]) => `${m}:${n}`).join(',');

      const line = `req ${req.method} ${req.baseUrl}${req.path} ${res.statusCode} ${ms}ms` +
        ` key="${label}" ip=${req.ip} slack_calls=${ctx.slackCalls}${methods ? ` (${methods})` : ''}` +
        `${count}${keys.length ? ` params=${keys.join('+')}` : ''}` +
        `${note.reused ? ' reused=true' : ''}${note.partial ? ' partial=true' : ''}`;

      if (ms >= SLOW_MS || res.statusCode >= 500) logger.warn(line);
      else logger.info(line);
    });

    next();
  });
}

module.exports = requestLog;
