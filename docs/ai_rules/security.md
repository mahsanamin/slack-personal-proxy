# Security Rules

## Credentials

- **Never log** tokens, cookies, or API keys. Use `maskToken()` when referencing them.
- **Never commit** `.env` to git. Only `.env.example` (with placeholder values) is tracked.
- **Never hardcode** credentials in source files.
- Tokens in config are read once at startup and stored in `SlackClient` — no re-reads from env.

## Authentication

- All `/api/*` routes require `X-API-Key` header.
- Auth check uses **timing-safe comparison** (`crypto.timingSafeEqual`) to prevent timing attacks.
- `/health` and `/docs` are intentionally unauthenticated.

## Whitelist

- Whitelist only gates **write operations** (sending messages).
- If `ALLOWED_WRITE_CHANNELS` is empty, all channels are writable.
- If `ALLOWED_DM_USERS` is empty, all DM users are allowed.
- Read operations are not blocked by the global whitelist. Slack's own channel membership still applies.
- **Per-key scope** (`src/services/keyAccess.js`): each key has `access` (`read` or `read_write`) and
  `readChannels` (`null` for all channels, or a list of channel IDs). A selected-channel key reads only
  those IDs, so it never sees DMs unless one is listed. Read-only keys cannot send, delete, or request DMs.
  Keys created before scopes existed keep full access; revoke and recreate them to restrict them.

## HTTP Security

- **Helmet.js** sets security headers on all responses (CSP, HSTS, etc.).
- Swagger UI gets relaxed CSP (needs inline scripts/styles).
- **CORS** is enabled (configurable if needed).
- **Rate limiting** per IP address.
- **HTTPS** with self-signed certs in Docker (optional but recommended).

## Docker

- Runs as non-root user (`appuser`, uid 1001).
- Filesystem is read-only except `/tmp` and `/app/data`.
- `dumb-init` for proper signal handling.
- Only port 3000 exposed internally.

## Input Validation

- All user inputs validated via `express-validator` before reaching controllers.
- Channel IDs must match `[CDGW][A-Z0-9]+`.
- User IDs must match `[UW][A-Z0-9]+`.
- Timestamps must match `\d+\.\d+`.
- Count parameters have min/max bounds.
