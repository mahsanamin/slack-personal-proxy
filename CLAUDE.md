# Slack Personal Proxy

Express proxy over Slack's Web API using cookie auth (xoxc/xoxd). Docker on port 8282, HTTPS.

## Quick Reference

- `npm test` — Jest. `./proxy start|stop|restart|logs|status` to manage Docker.
- `docs/` — Full project docs (architecture, endpoints, config, Slack API notes)
- `docs/ai_rules/` — Code conventions, patterns, and rules for all code changes

## Management Dashboard

Password-protected web console at `/dashboard` (static SPA in `src/dashboard/public/`, served
by Express). Mutable state lives in `./data` via the `configStore` singleton
(`src/services/configStore.js`): API keys as SHA-256 hashes (`apikeys.json`), Slack tokens
AES-256-GCM encrypted (`secrets.enc`, key from `DASHBOARD_MASTER_KEY`), DM allowlist
(`dm-allowlist.json`). Changes hot-reload the Slack client + whitelist via configStore events
(no restart). Dashboard login is a session cookie (`DASHBOARD_USER`/`DASHBOARD_PASSWORD_HASH`),
separate from `X-API-Key`. Crypto helpers: `src/utils/secureCrypto.js`. The API-key middleware
(`src/middleware/auth.js`) verifies synchronously against store hashes + the legacy `.env` `API_KEY`.

## Workflow (adhoc project — no PR friction)

This is a personal, adhoc project. Skip worktrees and PRs: commit and push changes
directly to `main`. No feature branches, no PR review step required. This overrides the
global "use a worktree, never branch in main" preference for THIS repo only.

## Slack API Gotchas

- `search.messages` does NOT return `thread_ts` or `reply_count` — parse from permalink URL
- `from:` takes `me` or username, NOT `<@U...>`. `in:` takes channel name, NOT channel ID
- `enrichSearchMatches()` in slackClient handles permalink parsing for all search-based services
- Activity endpoints search 100 results to compensate for client-side thread filtering

## Whitelist

Global, not per key: `ALLOWED_WRITE_CHANNELS` gates sends. `ALLOWED_DM_USERS` gates DMs.

## Per-key channel scope

Each API key has `access` (`read` | `read_write`) and `readChannels` (`null` = all channels,
or a list of channel IDs). Enforced by `src/services/keyAccess.js`. Route `:channelId` params are
checked in `src/middleware/channelAccess.js` (GET = read, other methods = write). Search, mentions
and activity filter Slack results by channel before enrichment. Selected-channel keys cannot send
DMs. Keys created before scopes existed have full access. Do not add a route that reads channel
data without checking the key's access.
