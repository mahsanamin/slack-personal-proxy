# Code Conventions

Rules for all code changes in this project. AI agents and contributors must follow these.

## Language & Runtime

- Node.js 20+, CommonJS (`require`/`module.exports`), no TypeScript, no ESM.
- No transpilation. Code runs directly on Node.

## File Organization

- One class or logical unit per file.
- **Controllers**: Named function exports, not a class. e.g. `async function listChannels(req, res, next)`.
- **Services**: Class with constructor injection. e.g. `class ChannelService { constructor(slackClient, cacheService, ...) }`.
- **Routes**: Express Router with Swagger JSDoc comments inline.
- **Middleware**: Single default export function.

## Naming

- Files: `camelCase.js` (e.g. `messageService.js`, `errorHandler.js`)
- Classes: `PascalCase` (e.g. `MessageService`)
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` inside `Object.freeze()` blocks
- Error codes: `UPPER_SNAKE_CASE` strings (e.g. `WRITE_CHANNEL_NOT_WHITELISTED`)
- Cache prefixes: `lowercase:colon:separated` (e.g. `channels:info:`)
- Config keys: `camelCase` (e.g. `config.enableCaching`, `config.cache.channelTtl`)

## Patterns

### Controller Pattern
```js
const { formatSuccessResponse } = require('../utils/helpers');

async function doSomething(req, res, next) {
  try {
    const result = await req.services.someService.method(params);
    res.json(formatSuccessResponse(result));
  } catch (err) {
    next(err);
  }
}
module.exports = { doSomething };
```

### Service Pattern
```js
class SomeService {
  constructor(slackClient, cacheService) {
    this.slack = slackClient;
    this.cache = cacheService;
  }
  async doWork() { /* ... */ }
}
module.exports = SomeService;
```

### Error Throwing
Throw structured errors from `constants.js`:
```js
const { ERROR_CODES } = require('../utils/constants');
const err = { ...ERROR_CODES.WRITE_CHANNEL_NOT_WHITELISTED };
err.details = { channelId };
throw err;
```
Do NOT throw plain strings. The global `errorHandler` middleware catches and formats all errors.

### Response Format
Always use `formatSuccessResponse(data, meta)` and `formatErrorResponse(errorCode, details)` from `utils/helpers.js`. Never construct response JSON manually.

## Dependencies

- Add new dependencies only when clearly necessary. Prefer Node built-ins.
- Keep `@slack/web-api` as the sole Slack interface — no direct HTTP calls to Slack.
- All validation through `express-validator` (defined in `middleware/validator.js`).

## Configuration

- All configurable values go through `src/config/index.js` loaded from `.env`.
- Never read `process.env` directly in service/controller code.
- Use `parseBoolean()` from helpers for boolean env vars.
- Add new env vars to both `config/index.js` and `.env.example`.

## Caching

- Always go through `CacheService` — never use `node-cache` directly.
- Define cache key prefixes in `constants.js` under `CACHE_PREFIXES`.
- TTLs come from config, not hardcoded values.

## Logging

- Use `const logger = require('../utils/logger')` — never `console.log`.
- Log at appropriate levels: `error` for failures, `warn` for degraded paths, `info` for operations, `debug` for details.
- Include context objects: `logger.info('Fetching thread', { channelId, threadTs })`.
- Never log tokens, cookies, or API keys. Use `maskToken()` if referencing credentials.

## Routes & Swagger

- Every route must have Swagger JSDoc comments.
- Route files only define routing — no business logic.
- All `/api/*` routes are behind `authMiddleware`.
- Validation middleware goes on individual routes, not globally.
