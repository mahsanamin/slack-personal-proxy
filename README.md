# Slack Personal Proxy

Give your computers and AI agents useful Slack access without giving them your Slack
password, browser cookies, or unlimited permission to message people.

Slack Personal Proxy runs on your own machine, stays private behind Tailscale, and gives
each client a separate key you can revoke at any time. Humans use a simple dashboard;
agents use the `slackp` command and receive predictable JSON.

## Why this exists

AI agents are good at searching conversations, catching up on mentions, and drafting
replies. Directly handing an agent your Slack session is not a good security model.

This project puts a small control plane between the agent and Slack:

- One Slack connection stays encrypted on your server.
- Every computer or agent gets its own revocable API key.
- The server is reachable through your tailnet, not your local LAN or the public internet.
- Reads are convenient: search, threads, mentions, history, users, and unread activity.
- Writes stay controlled with channel and DM allowlists.
- An agent can request an occasional DM, but only you can approve it.

## What you can do

```bash
slackp unread --count 10
slackp search 'from:alice in:engineering deployment'
slackp thread 'https://workspace.slack.com/archives/C.../p...'
slackp recent C01234567
slackp send @alice 'The deployment is complete.' --yes
```

For someone who is not permanently allowed:

```bash
slackp send @new.person 'Can we schedule 15 minutes?' --request-approval --yes
```

Nothing is sent yet. You review the exact person and exact message in **Dashboard →
Approvals**, then choose:

- **Send once** — sends only that reviewed message.
- **Send + allow 15 min** — sends it and gives only that requesting key temporary access.
- **Always allow** — sends it and adds the person to the permanent DM allowlist.
- **Reject** — sends nothing.

The CLI cannot approve itself and cannot edit the DM allowlist.

## Security at a glance

| Control | What it protects |
|---|---|
| Tailscale/IP allowlist | Who can reach the server |
| Dashboard password | Who can manage keys, Slack credentials, people, and approvals |
| Per-machine API keys | Which clients can use Slack operations |
| Channel/DM allowlists | Where clients can send |
| One-time approvals | Occasional messages without permanent access |
| Encrypted storage | Slack credentials, pending messages, and temporary grants at rest |

API keys never work as dashboard logins. Revoking a key immediately cancels its pending
requests and temporary DM access.

## Five-minute setup

Requirements: Docker, Docker Compose, and Tailscale on the server. CLI machines only
need Python 3.9+ and Tailscale.

### 1. Prepare the server

```bash
git clone https://github.com/mahsanamin/slack-personal-proxy.git
cd slack-personal-proxy
cp .env.example .env
./proxy hash-password
```

Copy the printed password hash into `.env`. Set these values:

```dotenv
DASHBOARD_USER=admin
DASHBOARD_PASSWORD_HASH=<paste the generated scrypt hash>
DASHBOARD_MASTER_KEY=<a long random secret; openssl rand -hex 32 can generate one>

# Bind only to this server's Tailscale address.
BIND_ADDRESS=<SERVER_TAILSCALE_IP>
ALLOWED_IPS=100.64.0.0/10
HOST_PORT=8282

# Required for any send operation. Allowlists and approvals still apply.
ENABLE_WRITE_OPS=true
```

Keep `.env` private. It is ignored by Git.

### 2. Start it

```bash
./proxy start
```

Open `http://SERVER_TAILSCALE_IP:8282/dashboard`. The service binds to the Tailscale IP,
so the machine's normal LAN IP does not expose it.

### 3. Connect Slack

Sign into the dashboard and open **Slack Setup**. The page gives exact browser steps for
either:

- a personal Slack session using your `xoxd` cookie and `xoxc` token; or
- an approved Slack app using an `xoxb` bot token.

Select **Test connection**, then **Save & connect**. Credentials entered in the dashboard
are encrypted with `DASHBOARD_MASTER_KEY` before being written to disk.

### 4. Connect another machine or agent

Open **Dashboard → API Keys** and follow the three numbered steps shown there:

1. Copy the generated `slackp` install command to the other machine.
2. Create one labeled key for that machine and copy it once.
3. Run the displayed `slackp connect ...` command and paste the key at the hidden prompt.

Verify it:

```bash
slackp status
slackp --help
```

Create a separate key for every machine or agent. If one is lost or retired, delete only
that key in the dashboard.

## Everyday commands

### Read Slack

```bash
slackp unread --count 10
slackp mentions --count 20
slackp threads --count 20
slackp my-threads --count 20
slackp search 'from:alice after:2026-08-01 launch'
slackp channels
slackp recent C01234567 --count 5
slackp history D01234567 --count 50
slackp users
```

### Send safely

```bash
# An allowlisted person; @username and U... user IDs both work.
slackp send @alice 'Hello' --yes

# A channel allowed by ALLOWED_WRITE_CHANNELS.
slackp send C01234567 'Deployment finished' --yes

# A reply in a thread.
slackp send C01234567 'Fixed in production' --thread 1700000000.123456 --yes

# Ask the owner to review an occasional DM.
slackp send @new.person 'Can we talk?' --request-approval --yes

# Check the request returned by the previous command.
slackp approval REQUEST_ID
```

Without `--yes`, `slackp` asks for confirmation interactively. Agents should use `--yes`
only when the user has authorized the exact write.

## Dashboard guide

- **Overview** — recent mentions and active threads.
- **API Keys** — install the CLI and create/revoke one key per client.
- **DM Allowlist** — permanently control who can receive direct messages.
- **Approvals** — review occasional DM requests and temporary access.
- **Slack Setup** — connect or replace Slack credentials.
- **Security** — confirm network exposure and enabled services.

## Configuration that matters

All options are documented in [`.env.example`](.env.example). These are the important
ones:

| Variable | Default | Meaning |
|---|---:|---|
| `BIND_ADDRESS` | `127.0.0.1` | Use the server's Tailscale IP for tailnet-only access |
| `ALLOWED_IPS` | localhost | Use `100.64.0.0/10` to accept tailnet clients |
| `HOST_PORT` | `8282` | Port exposed on the server |
| `ENABLE_WRITE_OPS` | `false` | Master switch for sending/deleting |
| `ALLOWED_WRITE_CHANNELS` | empty | Allowed channel IDs; empty means every channel |
| `ALLOWED_DM_USERS` | empty | Optional `.env` seed; dashboard entries are easier |
| `ENABLE_DM_APPROVALS` | `true` | Allow agents to queue exact DMs for owner review |
| `DM_APPROVAL_TTL_MINUTES` | `60` | How long a pending request waits |
| `DM_TEMP_GRANT_MINUTES` | `15` | Default temporary DM access window |
| `ENABLE_MCP` | `false` | Enable the optional MCP endpoint |

## Codex plugin

The included plugin teaches Codex what `slackp` means, which read command to choose, and
when to request owner approval instead of asking for broader access.

From this repository checkout:

```bash
codex plugin marketplace add .
codex plugin add slackp@slackp-project
```

Start a new Codex conversation after installation. See [the CLI guide](docs/cli.md) for
profiles, JSON behavior, and the complete command list.

## Operations

```bash
./proxy start
./proxy stop
./proxy restart
./proxy logs
./proxy status
./proxy update       # pull, rebuild, and restart
./proxy install      # install the slack-proxy helper command
```

The dashboard is the normal interface. REST documentation is available at `/docs` when
`ENABLE_SWAGGER=true`; the concise endpoint list is in [docs/endpoints.md](docs/endpoints.md).

## Optional MCP access

Set `ENABLE_MCP=true` and restart to expose `POST /mcp` through the same Tailscale gate,
API-key authentication, rate limits, and write controls. The `slackp` CLI is usually the
simpler choice because any shell-capable agent can use it without MCP configuration.

## Testing

```bash
npm test
python3 -m unittest discover -s tests/cli -p 'test_*.py'
```

## Troubleshooting

- **Dashboard does not open:** confirm Tailscale is connected and use the server's
  Tailscale IP, not its LAN IP.
- **`WRITE_OPS_DISABLED`:** set `ENABLE_WRITE_OPS=true`, then restart.
- **`USER_NOT_WHITELISTED`:** add the person in Dashboard → DM Allowlist or use
  `--request-approval` for the exact message.
- **`not_allowed_token_type`:** some Slack methods do not accept personal session tokens;
  one failed method no longer blocks later supported commands.
- **Slack login expired:** replace the cookie/token pair in Dashboard → Slack Setup.

This is a personal, self-hosted bridge. Use it only with accounts and workspaces you are
authorized to access, and follow your organization's Slack and security policies.
