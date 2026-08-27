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
| **Token** | Dashboard → Slack Setup → **Copy command**, then run it in Slack DevTools Console | `xoxc-...` |

Exact browser steps:

1. Open `https://app.slack.com/client`, sign in, and open the intended workspace.
2. Open Developer Tools (`F12` on Windows/Linux, `Cmd+Option+I` on macOS).
3. In Chrome/Edge, select **Application → Cookies → https://app.slack.com**. In
   Firefox, select **Storage → Cookies → https://app.slack.com**. Copy the complete
   value of the cookie named `d`; it should begin with `xoxd-`.
4. Open the dashboard's **Slack Setup** tab and click **Copy command**. Return to
   Slack's **Console**, paste the command, and press Enter. The command automatically
   detects the open workspace, copies its token, and reports `COPIED xoxc token for …`.
   Return to the dashboard and paste it into `SLACK_TOKEN`.
5. In the proxy dashboard's **Slack Setup** tab, paste the two values, select
   **Test connection**, then **Save & connect**.

Treat both values as passwords: they grant access as your signed-in Slack user. If
you use multiple workspaces and the test identifies the wrong one, open the intended
workspace immediately before copying, or temporarily sign out of the others.

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

Everything runs through Docker via the `./proxy` script (no host Node needed). Install it
once as a global command, then use it from anywhere:

```bash
# 0. (optional, once) install the global command
./proxy install                 # then use `slack-proxy ...` from any directory

# 1. Create the login hash (runs inside Docker, prints a line for .env)
slack-proxy hash-password 'your-password'

# 2. Add to .env
ENABLE_DASHBOARD=true
DASHBOARD_USER=you
DASHBOARD_PASSWORD_HASH=scrypt$...         # from step 1
DASHBOARD_MASTER_KEY=<32+ char passphrase> # encrypts Slack tokens at rest

# 3. Rebuild + restart, then open it (localhost by default; behind the IP allowlist)
slack-proxy restart
open http://localhost:8282/dashboard
```

To pull a new version and restart in one step: `slack-proxy update`.

Notes:
- **Login is a session cookie**, separate from the `X-API-Key` used by programmatic clients.
- **Secrets are never viewable**: Slack tokens are AES-256-GCM encrypted in `data/secrets.enc`
  (master key lives only in the env); API keys are stored as SHA-256 hashes and shown once.
- **Backward compatible**: the legacy `.env` `API_KEY` and all existing `X-API-Key` calls keep working.
- Not network-exposed by default (`BIND_ADDRESS=127.0.0.1` + localhost-only allowlist).

## `slackp` CLI

Install the agent-friendly CLI from any machine on the tailnet (Python 3.9+, no
packages required):

```bash
sudo mkdir -p /usr/local/bin && sudo curl -fsSL http://100.100.50.30:8282/dashboard/slackp -o /usr/local/bin/slackp && sudo chmod 755 /usr/local/bin/slackp && slackp --help
```

The same command is available with a **Copy command** button under **Dashboard → API
Keys**. This system-wide install makes `slackp` directly available from every shell.
From a repository checkout, use
`sudo ./slackp install --path /usr/local/bin/slackp` for the same result.

Create a separate key for the machine at **Dashboard → API Keys**, then connect through
the hidden key prompt:

```bash
slackp connect http://100.100.50.30:8282
slackp status
```

Typical commands:

```bash
slackp unread --count 10
slackp mentions --count 20
slackp search 'from:alice deployment'
slackp thread 'https://workspace.slack.com/archives/C.../p...'
slackp channels
slackp recent C01234567
slackp send @alice 'Hello in a DM'      # resolves the D-channel automatically
slackp send C01234567 'Hello'       # confirms before sending
```

Output is JSON by default for reliable LLM use. Named profiles allow multiple servers
or identities, while dashboard keys allow each machine/agent to be revoked separately.
See [`docs/cli.md`](docs/cli.md) for all usage and the included Codex plugin.

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
| POST | `/api/messages/dm/send` | Send DM by allowlisted `@username` or user ID |
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
