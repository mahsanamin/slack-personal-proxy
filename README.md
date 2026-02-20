# Slack Personal Proxy

Dockerized REST API proxy for Slack with automatic pagination, thread fetching, caching, and **whitelist-based access control**.

Only whitelisted channels are accessible — this is the core feature of the proxy.

**Swagger playground** at `/docs` when running.

## Setup

### 1. Get Slack Credentials

**Option A: Automated** — launches a browser, you log in, credentials extracted automatically:
```bash
npm run setup    # choose option 2
```

**Option B: Manual** — grab from DevTools on https://app.slack.com:

| What | Where | Looks like |
|------|-------|------------|
| **Cookie** | DevTools → Application → Cookies → `d` | `xoxd-...` |
| **Token** | DevTools → Console → run: `copy(Object.values(JSON.parse(localStorage.localConfig_v2).teams)[0].token)` | `xoxc-...` |

Then put them in `.env`:
```bash
cp .env.example .env
# Set SLACK_COOKIE, SLACK_TOKEN, API_KEY, and ALLOWED_READ_CHANNELS
```

**Option C: Bot token** — if you have an approved Slack app:
```bash
# Just set SLACK_BOT_TOKEN=xoxb-... in .env (no cookie needed)
```

### 2. Configure Whitelist

Set which channels can be read/written via the proxy:
```bash
# In .env — comma-separated channel IDs or names
ALLOWED_READ_CHANNELS=C12345,C67890
ALLOWED_WRITE_CHANNELS=C12345
ENABLE_WRITE_OPS=true
```

When set, ALL endpoints (channels list, messages, search, threads, send) are filtered to only whitelisted channels. Leave empty to allow all (open mode).

### 3. Run

```bash
# Docker (recommended)
docker compose up -d

# Or locally
npm install && npm start
```

### 4. Test

```bash
curl http://localhost:3000/health
curl -H "X-API-Key: YOUR_KEY" http://localhost:3000/api/auth/test
```

## API Endpoints

All `/api/*` endpoints require `X-API-Key` header. `API_KEY` is set in your `.env`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
| GET | `/api/auth/test` | Test auth |
| GET | `/api/channels` | List whitelisted channels |
| GET | `/api/channels/:id/info` | Channel details (whitelisted only) |
| GET | `/api/channels/:id/recent-messages?count=5&includeThreads=true` | Messages with threads |
| GET | `/api/conversations/:channelId/thread/:threadTs` | Complete thread |
| GET | `/api/users` | List users |
| GET | `/api/users/:id/profile` | User profile |
| GET | `/api/search/messages?query=...&count=10` | Search (whitelisted channels only) |
| POST | `/api/messages/:channelId/send` | Send message (write-whitelisted only) |
| GET | `/api/admin/whitelist-status` | Whitelist config |

## Environment Variables

See [`.env.example`](.env.example) for all options. Key ones:

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_COOKIE` + `SLACK_TOKEN` | * | Cookie auth (`xoxd-` + `xoxc-`) |
| `SLACK_BOT_TOKEN` | * | Or bot auth (`xoxb-`) |
| `API_KEY` | Yes | Proxy API key |
| `ALLOWED_READ_CHANNELS` | No | Comma-separated read whitelist (empty = all) |
| `ALLOWED_WRITE_CHANNELS` | No | Comma-separated write whitelist (empty = all) |
| `ENABLE_WRITE_OPS` | No | Default `false` — must be `true` to send messages |
| `PORT` | No | Default `3000` |
| `ENABLE_CACHING` | No | Default `true` |

\* One of cookie pair or bot token required.

## Architecture

```
Routes → Controllers → Services → SlackClient → Slack API
                          ↕
                  Cache / Pagination / Whitelist
```

## Testing

```bash
npm test                  # all tests
npm run test:unit         # unit only
npm run test:integration  # integration only
```

## Troubleshooting

- **401**: Check `API_KEY` in `.env` matches your `X-API-Key` header
- **403 CHANNEL_NOT_WHITELISTED**: Channel is not in `ALLOWED_READ_CHANNELS`
- **403 WRITE_OPS_DISABLED**: Set `ENABLE_WRITE_OPS=true` in `.env`
- **Slack auth errors**: Cookies expire — re-run `npm run setup` to refresh
- **Empty results**: Bot token may lack required scopes (`channels:read`, `search:read`, etc.)
