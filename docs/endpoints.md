# API Endpoints

All `/api/*` routes require `X-API-Key` header. `/health` and `/docs` are public.

## Channels

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/channels` | List all channels | `?type=public_channel,private_channel` |
| GET | `/api/channels/:channelId/info` | Channel details | — |
| GET | `/api/channels/:channelId/recent-messages` | Recent messages with optional thread expansion | `?count=20&include_threads=true&verbose=false` |
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
| GET | `/api/conversations/:channelId/context` | Messages around a target timestamp | `?message_ts=...&before=5&after=5&verbose=false` |

## Search

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/search/messages` | Global message search with thread context | `?query=...&count=10&include_threads=true&sort=timestamp&verbose=false` |

## Mentions

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/mentions/all` | All @mentions of current user | `?count=20&verbose=false` |
| GET | `/api/mentions/threads` | Mentions with full thread context | `?count=10&verbose=false` |
| GET | `/api/mentions/:channelId` | Mentions in a specific channel | `?count=20&verbose=false` |

## Activity

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/activity/threads-im-in` | Threads you replied to (with new-reply tracking) | `?count=20&verbose=false` |
| GET | `/api/activity/my-threads` | Threads you started | `?count=20&include_replies=true&verbose=false` |

## Users

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/users` | List workspace users | `?include_bots=false` |
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
