# API Endpoints

All `/api/*` routes require `X-API-Key` header. `/health` and `/docs` are public.

## Channels

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/channels` | List all channels | `?type=public_channel,private_channel` |
| GET | `/api/channels/:channelId/info` | Channel details | — |
| GET | `/api/channels/:channelId/recent-messages` | Recent messages with optional thread expansion | `?count=5&includeThreads=true&verbose=false` |
| GET | `/api/channels/:channelId/thread/:threadTs` | Thread replies by channel and timestamp | `?count=50&oldest=...&verbose=false` |

## Messages

| Method | Path | Description | Body |
|--------|------|-------------|------|
| POST | `/api/messages/:channelId/send` | Send message (write-gated) | `{ "text": "...", "thread_ts": "..." }` |
| GET | `/api/messages/:channelId/history` | Message history from channel/DM | `?count=100&oldest=...&latest=...&verbose=false` |
| DELETE | `/api/messages/:channelId/:messageTs` | Delete a message (write-gated) | — |

## Conversations

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/conversations/permalink` | Thread by Slack permalink URL | `?url=https://...slack.com/archives/C.../p...&verbose=false` |
| GET | `/api/conversations/:channelId/thread/:threadTs` | Full thread (parent + all replies) | `?verbose=false` |
| GET | `/api/conversations/:channelId/context` | Messages around a target timestamp | `?messageTs=...&before=5&after=5&verbose=false` |

## Search

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/search/messages` | Global message search with thread context | `?query=...&count=10&includeThreads=true&sortOrder=timestamp&verbose=false` |

## Mentions

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/mentions/all` | All @mentions of current user | `?count=20&includeThreads=true&verbose=false` |
| GET | `/api/mentions/threads` | Mentions with full thread context | `?count=20&verbose=false` |
| GET | `/api/mentions/by-channel/:channelId` | Mentions in a specific channel | `?count=20&includeThreads=true&verbose=false` |

## Activity

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/activity/threads-im-in` | Threads you replied to (with new-reply tracking) | `?count=20&verbose=false` |
| GET | `/api/activity/my-threads` | Threads you started | `?count=20&includeReplies=true&verbose=false` |

## Users

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/users` | List workspace users | `?includeDeleted=false&includeBots=false` |
| GET | `/api/users/by-email` | Look up a user by email, returns DM channel ID | `?email=alice@example.com` |
| GET | `/api/users/:userId/profile` | User profile details | — |

## Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/whitelist-status` | Current whitelist configuration |
| GET | `/api/admin/cache-stats` | Memory and persistent cache statistics |

## Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/test` | Validate credentials and show workspace info |

## Dashboard

Web console at `/dashboard` (static SPA). Auth is a **session cookie** (username + password
login), NOT the `X-API-Key` header. Enable with `ENABLE_DASHBOARD=true` and set
`DASHBOARD_USER` / `DASHBOARD_PASSWORD_HASH` (via `npm run set-dashboard-password`).
All routes are still behind the global IP allowlist.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/dashboard/` | none | SPA shell (HTML/JS/CSS) |
| GET | `/dashboard/api/bootstrap` | none | Whether dashboard login is configured |
| POST | `/dashboard/login` | none | Log in, sets session cookie |
| POST | `/dashboard/logout` | session | Clear session |
| GET | `/dashboard/api/status` | session | First-run flag + security/exposure panel |
| POST | `/dashboard/api/setup/test` | session | `auth.test` provided Slack creds (no save) |
| POST | `/dashboard/api/setup/slack` | session | Test then store Slack creds (encrypted), hot-reload |
| GET | `/dashboard/api/keys` | session | List API keys (metadata only) |
| POST | `/dashboard/api/keys` | session | Create a key (secret shown once) |
| DELETE | `/dashboard/api/keys/:id` | session | Revoke a key |
| GET | `/dashboard/api/dm-allowlist` | session | List DM-allowed users |
| POST | `/dashboard/api/dm-allowlist` | session | Add a user (by @name / email / U-id), hot-reload |
| DELETE | `/dashboard/api/dm-allowlist/:id` | session | Remove a user |
| GET | `/dashboard/api/summary` | session | Aggregated mentions + threads for the landing view |

## System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
| GET | `/docs` | Swagger UI (no auth, toggleable via `ENABLE_SWAGGER`) |
| GET | `/docs.json` | Raw OpenAPI spec |

## Response Format

All success responses:
```json
{
  "success": true,
  "data": { },
  "meta": { "timestamp": "...", "api_calls_made": 3, "cached": false }
}
```

All error responses:
```json
{
  "success": false,
  "error": { "code": "ERROR_CODE", "message": "...", "details": {} }
}
```
