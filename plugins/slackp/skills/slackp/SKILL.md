---
name: slackp
description: Use the slackp CLI to search, read, summarize, or safely send messages through a private Slack Personal Proxy. Apply when a request concerns the user's Slack messages, mentions, threads, channels, people, or Slack follow-up actions. Do not use for generic Slack app development.
---

# Slackp

`slackp` is the agent-friendly command for the user's private Slack Personal Proxy. It returns JSON on stdout and structured errors on stderr.

## Start

1. Run `command -v slackp`. If absent, tell the user to copy the system-wide install command from Slack Personal Proxy Dashboard → API Keys; do not improvise direct Slack credentials.
2. Run `slackp status` before the first Slack operation in a task. If it reports `NOT_CONNECTED`, ask the user to create a per-machine key at Dashboard → API Keys and personally run `slackp connect <server-url>`. Never ask them to paste the key into chat or place it in a command argument.
3. Use `slackp --help` or a subcommand's `--help` when parameters are uncertain.

## Work with Slack

- Begin catch-up requests with `slackp unread --count 10`.
- Search before broad enumeration: `slackp search '<Slack query>' --count 10`. Slack modifiers such as `from:`, `in:`, `after:`, and `has:` can narrow results.
- Read a shared Slack link with `slackp thread '<permalink>'`.
- Use compact default output first. Add `--verbose` only when blocks, attachments, or full Slack objects are necessary.
- Preserve IDs and timestamps from command results for follow-up reads or replies. Do not guess them.
- Parse the JSON result rather than relying on presentation text. A successful command has `success: true`; failures are nonzero and contain `error.code`.

## Writes

Sending or deleting changes external Slack state. Draft the exact message and confirm the channel/person/thread with the user unless their current request already explicitly authorizes that exact write. Only then run `slackp send ... --yes` or `slackp delete ... --yes`. Never treat permission to read Slack as permission to write.

For DMs, prefer `slackp send @username 'message' --yes` or `slackp send USER_ID 'message' --yes`; the server resolves the D-channel while enforcing its DM allowlist.

For message text with shell-sensitive characters or multiple lines, prefer stdin:

```bash
printf '%s' "$MESSAGE_TEXT" | slackp send CHANNEL_ID --text-stdin --yes
```

Do not expose API keys, xoxc tokens, or xoxd cookies in output, logs, commands, or summaries. `slackp profiles` intentionally shows only masked local key prefixes.

Read [references/commands.md](references/commands.md) when choosing among less common commands or profile operations.
