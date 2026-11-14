const { AsyncLocalStorage } = require('async_hooks');

/**
 * Per-request bookkeeping. The request log middleware opens a context for each API
 * request, and the Slack client adds to it every time it calls Slack. That lets one
 * log line say how many Slack calls a single request caused, without passing a
 * counter through every service.
 */
const storage = new AsyncLocalStorage();

function runWithContext(fn) {
  return storage.run({ slackCalls: 0, byMethod: {} }, fn);
}

function noteSlackCall(method) {
  const ctx = storage.getStore();
  if (!ctx) return;
  ctx.slackCalls += 1;
  ctx.byMethod[method] = (ctx.byMethod[method] || 0) + 1;
}

function currentContext() {
  return storage.getStore() || null;
}

module.exports = { runWithContext, noteSlackCall, currentContext };
