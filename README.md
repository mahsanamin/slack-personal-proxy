# Slack Personal Proxy

Dockerized REST API proxy for Slack with automatic pagination, thread fetching, caching, and **whitelist-based access control**.

Write operations are gated by channel/user whitelists. Reads are unrestricted.

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

### 2. Configure Whitelists

**Write whitelist** — gates send/post operations (reads are always unrestricted):
```bash
# In .env — comma-separated channel IDs or names
ALLOWED_WRITE_CHANNELS=C12345,C67890
# Accepts user IDs (U...), usernames, or DM channel IDs (D...)
ALLOWED_DM_USERS=D020BE909FV,U12345
ENABLE_WRITE_OPS=true
```

**IP allowlist** — restricts which IPs can reach the proxy at all:
```bash
# Empty (default) = localhost only — most secure
# 0.0.0.0         = allow everyone (use behind a trusted reverse proxy)
# Supports single IPs and CIDR ranges, comma-separated
ALLOWED_IPS=100.64.0.0/10,192.168.64.1,100.91.173.92
```

Loopback (`127.0.0.1`, `::1`) always passes so Docker healthchecks keep working.

### 3. HTTPS (recommended for network access)

In `.env`:
```bash
ENABLE_HTTPS=true
BIND_ADDRESS=0.0.0.0         # expose on network (IP allowlist handles security)
```

`./proxy start` auto-generates self-signed certs if missing and fixes permissions.

Access via `https://<YOUR_IP>:8282/docs`. Browser will warn about self-signed cert — accept to proceed.

### 4. Run

```bash
./proxy start       # build, start, wait for healthy
./proxy stop        # stop container
./proxy restart     # stop + start
./proxy logs        # tail logs
./proxy status      # check if running

# Or locally without Docker
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

## Management Dashboard

A password-protected web console at **`/dashboard`** to run the proxy without editing
`.env` by hand: view your recent mentions and tagged threads, create & revoke API keys,
manage the DM allowlist (add more people, applied live), set up Slack tokens securely, and
check your network-exposure/security status at a glance.

```bash
# 1. Create the login (writes a scrypt hash to paste into .env)
npm run set-dashboard-password

# 2. In .env
ENABLE_DASHBOARD=true
DASHBOARD_USER=you
DASHBOARD_PASSWORD_HASH=scrypt$...        # from step 1
DASHBOARD_MASTER_KEY=<32+ char passphrase># encrypts Slack tokens at rest

# 3. Open it (localhost by default; still behind the IP allowlist)
open http://localhost:8282/dashboard
```

Notes:
- **Login is a session cookie**, separate from the `X-API-Key` used by programmatic clients.
- **Secrets are never viewable**: Slack tokens are AES-256-GCM encrypted in `data/secrets.enc`
  (master key lives only in the env); API keys are stored as SHA-256 hashes and shown once.
- **Backward compatible**: the legacy `.env` `API_KEY` and all existing `X-API-Key` calls keep working.
- Not network-exposed by default (`BIND_ADDRESS=127.0.0.1` + localhost-only allowlist).

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
| GET | `/api/conversations/:channelId/context?messageTs=...&before=5&after=5` | Context around a message |
| GET | `/api/users` | List users |
| GET | `/api/users/:id/profile` | User profile |
| GET | `/api/users/by-email?email=...` | Look up user by email, get DM channel ID |
| GET | `/api/search/messages?query=...&count=10` | Search (whitelisted channels only) |
| GET | `/api/mentions/all?count=20&includeThreads=true` | All your mentions |
| GET | `/api/mentions/threads?count=20` | Threads where you're mentioned |
| GET | `/api/mentions/by-channel/:channelId?count=20` | Mentions in a specific channel |
| GET | `/api/activity/threads-im-in?count=20` | Threads you participated in |
| GET | `/api/activity/my-threads?count=20&includeReplies=true` | Threads you started |
| POST | `/api/messages/:channelId/send` | Send message (write-whitelisted only) |
| GET | `/api/admin/whitelist-status` | Whitelist config |

## Environment Variables

See [`.env.example`](.env.example) for all options. Key ones:

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_COOKIE` + `SLACK_TOKEN` | — | Cookie auth (`xoxd-` + `xoxc-`) * |
| `SLACK_BOT_TOKEN` | — | Or bot auth (`xoxb-`) * |
| `API_KEY` | — | Proxy API key (required) |
| `ALLOWED_WRITE_CHANNELS` | empty | Comma-separated write whitelist (empty = all writes allowed) |
| `ALLOWED_DM_USERS` | empty | DM whitelist: user IDs (`U...`), names, or DM channel IDs (`D...`) |
| `ALLOWED_IPS` | empty | IP allowlist — empty = localhost only, `0.0.0.0` = everyone |
| `ENABLE_WRITE_OPS` | `false` | Must be `true` to send messages |
| `ENABLE_HTTPS` | `false` | Enable HTTPS with self-signed cert |
| `BIND_ADDRESS` | `127.0.0.1` | `0.0.0.0` to expose on network |
| `HOST_PORT` | `8282` | Port on the host machine |
| `ENABLE_MCP` | `false` | Enable MCP server at `/mcp` for LLM tool use |
| `ENABLE_SWAGGER` | `true` | Set `false` to disable `/docs` |
| `ENABLE_CACHING` | `true` | Toggle response caching |

\* One of cookie pair or bot token required.

## MCP Server (LLM Tool Use)

The proxy includes an optional [Model Context Protocol](https://modelcontextprotocol.io/) server that lets LLM clients (Claude Code, Cursor, etc.) call Slack tools directly — no extra process, same container, same security stack.

### Enable

```bash
# In .env
ENABLE_MCP=true
```

Then `./proxy restart`. The MCP endpoint is at `POST /mcp`, protected by the same auth (`X-API-Key`), IP allowlist, and rate limits as `/api/*`.

### Tools

| Tool | Description |
|------|-------------|
| `slack_unread` | Full catch-up: mentions + threads you're in + threads you started, deduplicated |
| `slack_summary` | Lighter overview: mentions + threads with new activity |
| `slack_get_mentions` | All your @mentions with optional thread context |
| `slack_get_thread_activity` | Threads you're in with new replies since your last message |
| `slack_send_message` | Send/reply to whitelisted channels (requires `ENABLE_WRITE_OPS=true`) |
| `slack_search` | Full-text search with Slack query syntax (`from:`, `in:`, `has:`, etc.) |
| `slack_get_thread` | Get complete thread — parent message + all replies |

### Client Configuration

**Claude Code** — add to `~/.claude/.mcp.json`:
```json
{
  "mcpServers": {
    "slack-proxy": {
      "type": "url",
      "url": "https://YOUR_IP:8282/mcp",
      "headers": { "X-API-Key": "YOUR_KEY" }
    }
  }
}
```

**Other MCP clients** — point any Streamable HTTP client at `POST https://YOUR_IP:8282/mcp` with the `X-API-Key` header. The server is stateless (no session management needed).

### Verify

```bash
# Should return tool list
curl -sk -X POST https://localhost:8282/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

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
- **403 IP_NOT_ALLOWED**: Your IP isn't in `ALLOWED_IPS` (empty = localhost only)
- **403 WRITE_CHANNEL_NOT_WHITELISTED**: Channel is not in `ALLOWED_WRITE_CHANNELS`
- **403 WRITE_OPS_DISABLED**: Set `ENABLE_WRITE_OPS=true` in `.env`
- **Swagger not loading externally**: Make sure `ENABLE_HTTPS=true` and access via `https://`
- **Slack auth errors**: Cookies expire — re-run `npm run setup` to refresh
- **Empty results**: Bot token may lack required scopes (`channels:read`, `search:read`, etc.)
