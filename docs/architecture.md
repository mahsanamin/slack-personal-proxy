# Architecture

## Overview

Express REST API that proxies Slack's Web API. Authenticates via cookie-based personal tokens (xoxc/xoxd) or bot tokens. Runs in Docker with optional HTTPS.

## Layer Diagram

```
HTTP Request
  -> Middleware (auth, rate-limit, validation)
    -> Controller (parse params, call service, format response)
      -> Service (business logic, caching, enrichment)
        -> SlackClient (thin wrapper around @slack/web-api)
```

## Service Initialization

All services are constructed in `src/server.js` at startup and attached to `req.services` via middleware. Services receive dependencies through constructor injection.

```
SlackClient -> initialize() -> auth.test()
WhitelistService(slackClient, paginationService) -> initialize() -> resolve names to IDs
MessageService(slackClient, cache, pagination, whitelist, persistentCache)
ChannelService(slackClient, cache, pagination, whitelist)
UserService(slackClient, cache, pagination)
SearchService(slackClient, cache, messageService, whitelist)
MentionService(slackClient, cache, messageService, whitelist)
ActivityService(slackClient, cache, messageService, whitelist)
```

## Request Flow

1. **Helmet** + **CORS** + **JSON parsing** + **rate limiter** (all requests)
2. `/health` and `/docs` bypass auth
3. `/api/*` routes go through `authMiddleware` (X-API-Key, timing-safe compare)
4. **Validator middleware** on individual routes (express-validator)
5. **Controller** reads params, calls service, wraps in `formatSuccessResponse()`
6. **Error handler** catches thrown errors, maps Slack API errors to HTTP codes

## Caching

Two layers:

- **In-memory** (`node-cache`): TTL-based, configurable per resource type. Controlled by `CacheService` which no-ops when `ENABLE_CACHING=false`.
- **Persistent** (JSONL files in `data/`): Optional disk-based message cache. Stores channel messages and thread replies. Supports delta-sync (fetch only newer messages). Controlled by `PersistentCacheService`.

## Whitelist

Write-only enforcement:
- `ALLOWED_WRITE_CHANNELS` gates `POST /api/messages/:channelId/send` for channel messages
- `ALLOWED_DM_USERS` gates DM sends by user ID
- All read operations are unrestricted (Slack itself gates access by membership)

On startup, `WhitelistService` fetches all channels/users to resolve names to IDs.

## Auth Methods

| Method | Tokens | Use Case |
|--------|--------|----------|
| Cookie | `SLACK_COOKIE` (xoxd) + `SLACK_TOKEN` (xoxc) | Personal account, full access including search |
| Bot | `SLACK_BOT_TOKEN` (xoxb) | App integration, limited to bot scopes |

Cookie auth is required for `search.messages` (not available to bot tokens).
