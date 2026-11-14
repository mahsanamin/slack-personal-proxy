const crypto = require('crypto');

/**
 * Reuse a recent result for the same question instead of asking Slack again.
 *
 * Consumers poll the same endpoints with the same parameters over and over. Each poll
 * re-ran a Slack search and then fetched every thread, which is what Slack rate limits.
 * Here the first caller does the work and keeps the result for ttlSeconds. Callers that
 * ask the same thing in that time get the saved result. Callers that arrive while the
 * work is still running wait for it instead of starting their own copy.
 *
 * A result marked partial (the time limit cut it short) is shared with the callers
 * already waiting, but is not kept, so the next poll gets a chance to finish it.
 */
const inflight = new Map();

function makeKey(parts) {
  return crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex');
}

async function reuse(cache, parts, ttlSeconds, compute) {
  const key = 'reuse:' + makeKey(parts);

  if (ttlSeconds > 0) {
    const hit = cache.get(key);
    if (hit) {
      return { value: hit.value, reused: true, ageSeconds: Math.round((Date.now() - hit.at) / 1000) };
    }
  }

  if (!inflight.has(key)) {
    const work = (async () => {
      const value = await compute();
      if (ttlSeconds > 0 && !(value && value.partial)) {
        cache.set(key, { value, at: Date.now() }, ttlSeconds);
      }
      return value;
    })().finally(() => inflight.delete(key));
    inflight.set(key, work);
    return { value: await work, reused: false, ageSeconds: 0 };
  }

  return { value: await inflight.get(key), reused: true, ageSeconds: 0 };
}

module.exports = { reuse };
