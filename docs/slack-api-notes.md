# Slack API Notes

Gotchas and workarounds discovered while building this proxy.

## search.messages

- **Does NOT return `thread_ts` or `reply_count`** in match results. Available fields: `ts`, `text`, `user`, `username`, `channel`, `permalink`, `score`, `attachments`, `blocks`, `files`.
- **Workaround**: Parse `thread_ts` from the permalink URL (e.g. `?thread_ts=1234.5678`). This is handled by `slackClient.enrichSearchMatches()`.
- For `reply_count`, call `conversations.history` with `latest=ts, inclusive=true, limit=1` to fetch the actual message which includes `reply_count`.
- Only available to **user tokens** (xoxc), not bot tokens (xoxb).

## search.messages modifiers

- `from:` takes `me` or a username — NOT `<@U12345>` mention syntax.
- `in:` takes a **channel name** — NOT a channel ID. If you only have an ID, resolve it via `conversations.info` first.

## conversations.history

- Returns **top-level channel messages only** — thread replies do not appear here.
- To get thread replies, use `conversations.replies` with the parent's `ts` as the `thread_ts`.

## conversations.replies

- First message in the response is always the **parent message** (same `ts` as the `thread_ts` param).
- Supports cursor-based pagination for long threads.

## Thread Enrichment Pattern

All search-based services (search, mentions, activity) follow the same pattern:

1. Call `search.messages` to find relevant messages
2. Call `slackClient.enrichSearchMatches()` to parse `thread_ts` from permalinks
3. Use `messageService.getCompleteThread()` to fetch full thread context
4. Activity endpoints search 100 results and filter client-side (thread replies are sparse in search results)

## Rate Limits

Slack Web API uses tiered rate limits. Cookie-based auth shares the user's personal rate limit. The proxy uses in-memory caching to reduce API calls.
