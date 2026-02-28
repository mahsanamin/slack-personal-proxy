# Slack Personal Proxy

Express proxy over Slack's Web API using cookie auth (xoxc/xoxd). Docker on port 8282, HTTPS.

## Quick Reference

- `npm test` — Jest (61 tests). `./proxy start|stop|restart|logs|status` to manage Docker.
- `docs/` — Full project docs (architecture, endpoints, config, Slack API notes)
- `docs/ai_rules/` — Code conventions, patterns, and rules for all code changes

## Slack API Gotchas

- `search.messages` does NOT return `thread_ts` or `reply_count` — parse from permalink URL
- `from:` takes `me` or username, NOT `<@U...>`. `in:` takes channel name, NOT channel ID
- `enrichSearchMatches()` in slackClient handles permalink parsing for all search-based services
- Activity endpoints search 100 results to compensate for client-side thread filtering

## Whitelist

Write-only. `ALLOWED_WRITE_CHANNELS` gates sends. `ALLOWED_DM_USERS` gates DMs. Reads unrestricted.
