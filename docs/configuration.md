# Configuration

All config is loaded from environment variables (`.env` file). See `.env.example` for the template.

## Required

| Variable | Description |
|----------|-------------|
| `SLACK_COOKIE` + `SLACK_TOKEN` | Cookie auth (xoxd + xoxc) — OR use `SLACK_BOT_TOKEN` |
| `SLACK_BOT_TOKEN` | Bot token auth (xoxb) — alternative to cookie auth |
| `API_KEY` | API key for all `/api/*` requests (sent as `X-API-Key` header) |

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Internal server port |
| `NODE_ENV` | `development` | `production`, `development`, or `test` |
| `LOG_LEVEL` | `info` | Winston log level |
| `BIND_ADDRESS` | `127.0.0.1` | Network bind (`0.0.0.0` to expose) |
| `HOST_PORT` | `8282` | Docker host-mapped port |

## Security

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in ms |
| `RATE_LIMIT_MAX_REQUESTS` | `200` | Max requests per window |
| `SLACK_THROTTLE_MS` | `100` | Min ms between Slack API calls (avoids 429s) |
| `ALLOWED_IPS` | _(empty = localhost only)_ | Comma-separated IPs/CIDR ranges allowed to connect |

## Whitelist (write-only)

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_WRITE_CHANNELS` | _(empty = allow all)_ | Comma-separated channel IDs or names |
| `ALLOWED_DM_USERS` | _(empty = allow all)_ | Comma-separated user/DM-channel IDs |

## Caching

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_CACHING` | `true` | Toggle in-memory cache |
| `CHANNEL_CACHE_TTL_SECONDS` | `300` | Channel list/info TTL |
| `USER_CACHE_TTL_SECONDS` | `300` | User list/profile TTL |
| `THREAD_CACHE_TTL_SECONDS` | `120` | Thread data TTL |
| `HEALTH_CACHE_TTL_SECONDS` | `300` | Health check TTL |

## Persistent Cache

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_PERSISTENT_CACHE` | `false` | Toggle JSONL disk cache |
| `PERSISTENT_CACHE_DIR` | `data` | Cache directory path |
| `PERSISTENT_CACHE_MAX_FETCH` | `200` | Max messages per delta fetch |

## HTTPS

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_HTTPS` | `false` | Toggle HTTPS |
| `HTTPS_KEY_PATH` | `/app/certs/server.key` | Private key path |
| `HTTPS_CERT_PATH` | `/app/certs/server.cert` | Certificate path |

## Other

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_WRITE_OPS` | `false` | Toggle message sending |
| `ENABLE_SWAGGER` | `true` | Toggle `/docs` endpoint |
| `ENABLE_MCP` | `false` | Toggle MCP server at `/mcp` |
| `MAX_PAGINATION_CALLS` | `10` | Safety limit for auto-pagination |
