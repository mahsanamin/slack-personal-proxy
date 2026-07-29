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

This is a personal, adhoc project. Work directly on `develop`: commit and push there,
no worktree and no feature branch needed. This overrides the global "use a worktree,
never branch in main" preference for THIS repo only.

`develop` is the deploy branch. The always-on instance tracks it (see Deployment
below), so anything pushed to `develop` is what actually runs. Keep it green: run
`npx jest` before pushing.

`main` is the settled line. Promote `develop` into it when a batch is worth
consolidating, either by PR (`gh pr create --base main --head develop`) or a direct
`git merge --no-ff develop`. Either is fine; no review step is required.

## Deployment

Two instances exist and only one serves traffic. `wslack.wp.mahsanamin.com` resolves
to this Mac, where nginx-proxy-manager terminates 443 and forwards to
**`100.100.50.2:8282`** (`backend-server-master`, the always-on Linux box) per
`/data/nginx/proxy_host/8.conf`. The container on this Mac at `100.100.75.1:8282` is
NOT routed to, so a local check proves nothing about what routines actually hit.

To deploy:

```bash
ssh 100.100.50.2
cd /home/ahsan/mahsanamin/repos/slack-personal-proxy
./proxy update        # = git pull --ff-only + restart; use this for a normal deploy
```

`./proxy restart` is safe for picking up code changes: `cmd_start` runs
`docker compose up -d --build`, so it rebuilds rather than reusing the old image.
Use `./proxy update` when you also want the pull.

Verify after deploying, and note the container binds the tailnet IP, NOT localhost,
so `curl localhost:8282` gives "connection refused" even when it is perfectly fine:

```bash
curl -s http://100.100.50.2:8282/health
```

Expect `status: healthy` and `slack_api: ok`. A missing `slack_api` field means the
rebuild did not take.

`/health` returns 503 with `status: degraded` when Slack is unreachable, so the
container correctly flips to `unhealthy` during a real outage. Nothing auto-restarts
on that (`restart: unless-stopped` ignores health).

## Slack API Gotchas

- `search.messages` does NOT return `thread_ts` or `reply_count` — parse from permalink URL
- `from:` takes `me` or username, NOT `<@U...>`. `in:` takes channel name, NOT channel ID
- `enrichSearchMatches()` in slackClient handles permalink parsing for all search-based services
- Activity endpoints search 100 results to compensate for client-side thread filtering

## Whitelist

Write-only. `ALLOWED_WRITE_CHANNELS` gates sends. `ALLOWED_DM_USERS` gates DMs. Reads unrestricted.
