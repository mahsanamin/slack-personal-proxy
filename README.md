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
ALLOWED_DM_CHANNELS=D12345
ENABLE_WRITE_OPS=true
```

When set, ALL endpoints (channels list, messages, search, threads, send) are filtered to only whitelisted channels. Leave empty to allow all (open mode).

### 3. HTTPS (recommended for network access)

```bash
./scripts/generate-cert.sh   # generates self-signed cert in certs/
```

Then in `.env`:
```bash
ENABLE_HTTPS=true
BIND_ADDRESS=0.0.0.0         # expose on network
```

Access via `https://<YOUR_IP>:8282/docs`. Browser will warn about self-signed cert — accept to proceed.

### 4. Run

```bash
# Docker (recommended)
docker compose up -d

# Or locally
npm install && npm start
```

### 5. Test

```bash
# HTTP (localhost)
curl http://localhost:8282/health

# HTTPS (if enabled, -k for self-signed cert)
curl -sk https://localhost:8282/health
curl -sk -H "X-API-Key: YOUR_KEY" https://localhost:8282/api/auth/test
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

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_COOKIE` + `SLACK_TOKEN` | — | Cookie auth (`xoxd-` + `xoxc-`) * |
| `SLACK_BOT_TOKEN` | — | Or bot auth (`xoxb-`) * |
| `API_KEY` | — | Proxy API key (required) |
| `ALLOWED_READ_CHANNELS` | empty | Comma-separated read whitelist (empty = all) |
| `ALLOWED_WRITE_CHANNELS` | empty | Comma-separated write whitelist (empty = all) |
| `ALLOWED_DM_CHANNELS` | empty | Comma-separated DM channel whitelist (empty = all) |
| `ENABLE_WRITE_OPS` | `false` | Must be `true` to send messages |
| `ENABLE_HTTPS` | `false` | Enable HTTPS with self-signed cert |
| `BIND_ADDRESS` | `127.0.0.1` | `0.0.0.0` to expose on network |
| `HOST_PORT` | `8282` | Port on the host machine |
| `ENABLE_SWAGGER` | `true` | Set `false` to disable `/docs` |
| `ENABLE_CACHING` | `true` | Toggle response caching |

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
- **Swagger not loading externally**: Make sure `ENABLE_HTTPS=true` and access via `https://`
- **Slack auth errors**: Cookies expire — re-run `npm run setup` to refresh
- **Empty results**: Bot token may lack required scopes (`channels:read`, `search:read`, etc.)
