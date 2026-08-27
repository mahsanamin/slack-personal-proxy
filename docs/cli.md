# slackp CLI

`slackp` is a dependency-free Python CLI for humans and agents using Slack Personal
Proxy over Tailscale. It writes JSON to stdout, structured errors to stderr, and exits
nonzero on failure.

## Install and connect

Python 3.9 or newer is required. On any Tailscale machine, copy the install command
shown under **Dashboard → API Keys**, or run:

```bash
sudo mkdir -p /usr/local/bin && sudo curl -fsSL http://100.100.50.30:8282/dashboard/slackp -o /usr/local/bin/slackp && sudo chmod 755 /usr/local/bin/slackp && slackp --help
```

This installs system-wide, so every later command is simply `slackp`. From a repository
checkout, use `sudo ./slackp install --path /usr/local/bin/slackp` for the same result.

In the dashboard, open **API Keys**, create one key for this machine or agent, and copy
it. Then connect; the prompt hides the key:

```bash
slackp connect http://TAILSCALE-IP:8282
```

The connection is tested before it is saved. Profiles and keys are stored in
`~/.config/slackp/config.json` with mode `0600`. Create a separate dashboard key for
each machine so access can be revoked independently.

Named profiles support more than one proxy or identity:

```bash
slackp connect http://100.100.50.30:8282 --name work
slackp profiles
slackp use work
slackp --profile work status
```

## Common operations

```bash
slackp unread --count 10
slackp mentions --count 20
slackp threads --count 20
slackp my-threads --count 20
slackp search 'from:alice in:engineering deployment'
slackp thread 'https://workspace.slack.com/archives/C.../p...'
slackp channels
slackp recent C01234567 --count 5
slackp history D01234567 --count 50
slackp users
slackp user-by-email alice@example.com
```

Use `--pretty` before the subcommand for indented JSON. Use `--verbose` on supported
read commands only when full Slack objects are needed.

## Writes

Writes are protected twice: the server must enable and allow the destination, and the
CLI requires interactive confirmation or `--yes`.

```bash
slackp send C01234567 'Hello'
slackp send @alice 'Hello in a DM'
slackp send U01234567 'Hello in a DM'
slackp send @new.person 'Can we talk?' --request-approval
slackp approval REQUEST_ID
slackp send C01234567 'Thread reply' --thread 1700000000.123456
slackp delete C01234567 1700000000.123456
```

Agents should use `--yes` only after the user has authorized the exact Slack write.
For multiline or shell-sensitive text, use `--text-stdin`.

If a person is not permanently allowlisted, add `--request-approval`. Nothing is sent
until the owner reviews the exact recipient and message in **Dashboard → Approvals**.
The owner can send once, allow that API key temporarily, always allow the person, or
reject the request. The CLI cannot approve its own request.

## Codex plugin

This repository includes a companion plugin that teaches Codex what `slackp` means,
which read command to choose, and when Slack writes need confirmation:

```bash
codex plugin marketplace add .
codex plugin add slackp@slackp-project
```

Start a new Codex conversation after installation so the new skill is discovered.
