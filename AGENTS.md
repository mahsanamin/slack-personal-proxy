# Agent guidance

`slackp` is the supported CLI for this project's running Slack Personal Proxy. It is
intended for both humans and LLM agents, returns JSON by default, and can be used from
any directory after installing it with the command shown in Dashboard → API Keys.

Before Slack work, run `slackp status`. Use `slackp --help` for the current command
surface and prefer named read commands such as `unread`, `search`, `thread`,
`mentions`, and `history` over manually constructed REST requests.

Slack writes change external state. Do not run `slackp send ... --yes`, `slackp delete
... --yes`, or a mutating `slackp request` unless the user has authorized the exact
write. Never print, request in chat, or pass Slack/API credentials as command-line
arguments. When connection is required, direct the user to Dashboard → API Keys and
the hidden prompt from `slackp connect SERVER_URL`.

When an explicitly authorized DM recipient is not allowlisted, use `slackp send
@username 'exact draft' --request-approval --yes`. This only queues the exact message;
the owner must approve it in Dashboard → Approvals before anything is sent.
