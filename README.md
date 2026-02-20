# Slack Personal Proxy

Dockerized REST API proxy for Slack with automatic pagination, thread fetching, caching, and access control.

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
# Set SLACK_COOKIE, SLACK_TOKEN, and API_KEY
```

**Option C: Bot token** — if you have an approved Slack app:
```bash
# Just set SLACK_BOT_TOKEN=xoxb-... in .env (no cookie needed)
```

### 2. Run

```bash
# Docker (recommended)
docker compose up -d

# Or locally
npm install && npm start
```

### 3. Test

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
| GET | `/api/channels` | List all channels |
| GET | `/api/channels/:id/info` | Channel details |
| GET | `/api/channels/:id/recent-messages?count=5&includeThreads=true` | Messages with threads |
| GET | `/api/conversations/:channelId/thread/:threadTs` | Complete thread |
| GET | `/api/users` | List users |
| GET | `/api/users/:id/profile` | User profile |
| GET | `/api/search/messages?query=...&count=10` | Search messages |
| GET | `/api/admin/whitelist-status` | Whitelist config |

## Environment Variables

See [`.env.example`](.env.example) for all options. Key ones:

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_COOKIE` + `SLACK_TOKEN` | * | Cookie auth (`xoxd-` + `xoxc-`) |
| `SLACK_BOT_TOKEN` | * | Or bot auth (`xoxb-`) |
| `API_KEY` | Yes | Proxy API key |
| `PORT` | No | Default `3000` |
| `ENABLE_CACHING` | No | Default `true` |
| `ALLOWED_READ_CHANNELS` | No | Comma-separated whitelist |

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
- **Slack auth errors**: Cookies expire — re-run `npm run setup` to refresh
- **Empty results**: Bot token may lack required scopes (`channels:read`, `search:read`, etc.)
