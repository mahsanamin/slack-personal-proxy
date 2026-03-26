# Slack Proxy — LLM API Reference

Base URL: `https://<host>:8282`. All `/api/*` routes require header `X-API-Key: <key>`. Responses are compact by default (cleaned text, no blocks/attachments). Add `?verbose=true` for full Slack objects.

## REST API

### Channels
- `GET /api/channels` — List all channels. `?type=public_channel,private_channel`
- `GET /api/channels/:channelId/info` — Channel details (name, topic, member count).
- `GET /api/channels/:channelId/recent-messages` — Recent messages with thread expansion. `?count=5&includeThreads=true&verbose=false`
- `GET /api/channels/:channelId/thread/:threadTs` — Thread parent + replies. `?count=50&oldest=<ts>&verbose=false`

### Conversations
- `GET /api/conversations/permalink` — Thread by Slack permalink URL. `?url=https://workspace.slack.com/archives/C.../p...&verbose=false`
- `GET /api/conversations/:channelId/thread/:threadTs` — Full thread (all replies, no count/oldest filtering). `?verbose=false`
- `GET /api/conversations/:channelId/context` — Messages around a target timestamp. `?messageTs=<ts>&before=5&after=5&verbose=false`

### Search
- `GET /api/search/messages` — Global message search. `?query=<text>&count=10&includeThreads=true&sortOrder=timestamp&verbose=false`. Supports Slack syntax: `from:username`, `in:channel-name`, `has:link`, date filters.

### Mentions
- `GET /api/mentions/all` — All @mentions of current user. `?count=20&includeThreads=true&verbose=false`
- `GET /api/mentions/threads` — Threads where you were mentioned. `?count=20&verbose=false`
- `GET /api/mentions/by-channel/:channelId` — Mentions in a specific channel. `?count=20&includeThreads=true&verbose=false`

### Activity
- `GET /api/activity/threads-im-in` — Threads you replied to, with new-reply tracking. `?count=20&verbose=false`
- `GET /api/activity/my-threads` — Threads you started. `?count=20&includeReplies=true&verbose=false`

### Messages
- `POST /api/messages/:channelId/send` — Send message (write-gated). Body: `{ "text": "...", "thread_ts": "..." }`

### Users
- `GET /api/users` — List workspace users. `?include_bots=false`
- `GET /api/users/:userId/profile` — User profile details.

### Admin
- `GET /api/admin/whitelist-status` — Current whitelist configuration.
- `GET /api/admin/cache-stats` — Memory and persistent cache statistics.

### Auth / System
- `GET /api/auth/test` — Validate credentials and show workspace info.
- `GET /health` — Health check (no auth).

## MCP Tools

Server name: `slack-proxy`. These tools call the service layer directly (not HTTP).

| Tool | Description | Key Params |
|------|-------------|------------|
| `slack_unread` | Catch up on everything: mentions, threads-im-in, my-threads. Best first call. | `count` (default 10) |
| `slack_summary` | Combined overview: recent mentions + threads with new replies. | `mention_count`, `thread_count` (default 10 each) |
| `slack_get_mentions` | Recent @mentions with optional thread context. | `count` (default 20), `include_threads` (default true) |
| `slack_get_thread_activity` | Threads you participated in with new replies since your last message. | `count` (default 20) |
| `slack_get_thread` | Complete thread (parent + all replies) by channel_id and thread_ts. | `channel_id`, `thread_ts` (required) |
| `slack_search` | Search messages. Supports Slack search syntax. | `query` (required), `count` (default 10), `include_threads` (default false) |
| `slack_send_message` | Send message to whitelisted channel/DM or reply in thread. | `channel_id`, `text` (required), `thread_ts` (optional) |

## Response Format

Success: `{ "success": true, "data": { ... }, "meta": { "timestamp": "...", "api_calls_made": N } }`
Error: `{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }`

## Quick Guide

- **What needs my attention?** Use `slack_unread` or `GET /api/activity/threads-im-in`
- **Read a specific thread?** Use `GET /api/channels/:channelId/thread/:threadTs` or `slack_get_thread`
- **Have a permalink?** Use `GET /api/conversations/permalink?url=...`
- **Search for something?** Use `GET /api/search/messages?query=...` or `slack_search`
- **Recent channel messages?** Use `GET /api/channels/:channelId/recent-messages`
- **Send a reply?** Use `POST /api/messages/:channelId/send` or `slack_send_message`
