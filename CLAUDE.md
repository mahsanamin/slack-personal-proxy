# Slack Personal Proxy

Express proxy over Slack's Web API using cookie auth (xoxc/xoxd). Docker on port 8282, HTTPS.

## Endpoints
- `GET /api/channels` — list/info
- `GET /api/messages/:channelId` — recent messages + threads
- `GET /api/conversations/:channelId/thread/:threadTs` — full thread
- `GET /api/conversations/:channelId/context` — messages around a target
- `GET /api/search/messages` — global search
- `GET /api/mentions/all|threads|:channelId` — @mentions
- `GET /api/activity/threads-im-in|my-threads` — thread activity
- `POST /api/messages/:channelId` — send message (write-gated)
- `GET /api/users/profile/:userId` — user info
- `GET /health` — health check (no /api prefix)

## Whitelist (write-only)
- `ALLOWED_WRITE_CHANNELS` — gates POST/send for channels
- `ALLOWED_DM_USERS` — gates DM sends by user
- Reads are unrestricted (Slack gates access by membership)

## Slack search.messages API gotchas
- Does NOT return `thread_ts` or `reply_count` — parse `thread_ts` from permalink URL instead
- `conversations.history` does NOT return thread replies, only top-level messages
- `from:` modifier takes `me` or username, NOT `<@U...>` mention syntax
- `in:` modifier takes channel name, NOT channel ID
- Enrichment: `slackClient.enrichSearchMatches()` handles permalink parsing for all search-based services
- Activity endpoints search 100 results to compensate for client-side thread filtering

## Stack
Node 20, Express, `@slack/web-api`, Jest. In-memory cache + optional JSONL persistent cache.

## Testing
`npm test` — Jest unit/integration. `docker compose up -d --build` to rebuild.
