# Slack Personal Proxy

A Dockerized REST API proxy that wraps Slack's API with smart features: automatic pagination, thread fetching, caching, and whitelist-based access control.

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env with your Slack credentials and API key

# 2. Run with Docker
./deploy.sh

# 3. Or run locally
npm install
npm start
```

## Getting Slack Credentials

### Method A: Cookie-Based (Personal Use)

1. Open Slack in Chrome and log in
2. Open DevTools (F12) → Application → Cookies → `https://app.slack.com`
3. Find cookie named `d` → copy value → set as `SLACK_COOKIE`
4. Go to Network tab → refresh → find any `api.slack.com` request
5. Copy `Authorization: Bearer xoxc-...` header value → set as `SLACK_TOKEN`

### Method B: Bot Token (Approved App)

1. Go to https://api.slack.com/apps → select your app
2. OAuth & Permissions → copy "Bot User OAuth Token" → set as `SLACK_BOT_TOKEN`

## API Endpoints

All `/api/*` endpoints require the `X-API-Key` header.

### Health & Auth

```bash
# Health check (no auth needed)
curl http://localhost:3000/health

# Test auth
curl -H "X-API-Key: YOUR_KEY" http://localhost:3000/api/auth/test
```

### Channels

```bash
# List all channels (auto-paginated, cached 5min)
curl -H "X-API-Key: YOUR_KEY" http://localhost:3000/api/channels

# Channel info
curl -H "X-API-Key: YOUR_KEY" http://localhost:3000/api/channels/C12345/info

# Recent messages with threads (count: 1-10, default 5)
curl -H "X-API-Key: YOUR_KEY" \
  "http://localhost:3000/api/channels/C12345/recent-messages?count=5&includeThreads=true"
```

### Users

```bash
# List users (auto-paginated, filters bots/deleted by default)
curl -H "X-API-Key: YOUR_KEY" \
  "http://localhost:3000/api/users?includeDeleted=false&includeBots=false"

# User profile
curl -H "X-API-Key: YOUR_KEY" http://localhost:3000/api/users/U12345/profile
```

### Search

```bash
# Search messages (count: 1-20, sortOrder: timestamp|score)
curl -H "X-API-Key: YOUR_KEY" \
  "http://localhost:3000/api/search/messages?query=bug+fix&count=10&includeThreads=true"
```

### Conversations

```bash
# Get complete thread
curl -H "X-API-Key: YOUR_KEY" \
  http://localhost:3000/api/conversations/C12345/thread/1708340000.123456
```

### Admin

```bash
# Whitelist status
curl -H "X-API-Key: YOUR_KEY" http://localhost:3000/api/admin/whitelist-status
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_BOT_TOKEN` | | Bot token (`xoxb-...`) |
| `SLACK_COOKIE` | | Session cookie (`xoxd-...`) |
| `SLACK_TOKEN` | | Session token (`xoxc-...`) |
| `API_KEY` | | API key for proxy auth |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment |
| `LOG_LEVEL` | `info` | Log level |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | `30` | Max requests per window |
| `ENABLE_CACHING` | `true` | Enable/disable caching |
| `CHANNEL_CACHE_TTL_SECONDS` | `300` | Channel cache TTL |
| `USER_CACHE_TTL_SECONDS` | `300` | User cache TTL |
| `THREAD_CACHE_TTL_SECONDS` | `120` | Thread cache TTL |
| `HEALTH_CACHE_TTL_SECONDS` | `300` | Health check cache TTL |
| `MAX_PAGINATION_CALLS` | `10` | Max API calls per pagination |
| `ALLOWED_READ_CHANNELS` | | Comma-separated read whitelist |
| `ALLOWED_WRITE_CHANNELS` | | Comma-separated write whitelist |
| `ALLOWED_DM_USERS` | | Comma-separated DM whitelist |
| `ENABLE_WRITE_OPS` | `false` | Enable write operations |

## Architecture

```
Routes → Controllers → Services → SlackClient → Slack API
                          ↕
                    CacheService
                    PaginationService
                    WhitelistService
```

- **SlackClient**: Thin wrapper around `@slack/web-api` with auto-detect auth
- **PaginationService**: Generic cursor-based pagination with safety limits
- **CacheService**: `node-cache` wrapper with cloning enabled, respects `ENABLE_CACHING`
- **WhitelistService**: Resolves channel/user names to IDs, enforces access control
- **MessageService**: Fetches messages with automatic thread resolution and username enrichment
- **ChannelService/UserService/SearchService**: Business logic with caching

## Docker

```bash
# Build and run
docker compose build
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

The container runs as non-root with a read-only filesystem, `no-new-privileges`, and localhost-only port binding.

## Testing

```bash
npm test              # All tests with coverage
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only
```

## Troubleshooting

- **401 on all requests**: Check `API_KEY` in `.env` matches your `X-API-Key` header
- **Slack auth errors**: Cookies expire — re-extract from browser if using cookie auth
- **Empty channel list**: Bot token may lack `channels:read` scope
- **Rate limited**: Increase `RATE_LIMIT_MAX_REQUESTS` or `RATE_LIMIT_WINDOW_MS`
- **Health check failing**: Verify Slack credentials are valid with `/api/auth/test`
