# slackp command guide

Use `slackp --help` as the authoritative command list. Common operations:

```text
slackp status
slackp unread --count 10
slackp mentions --count 20
slackp mention-threads --count 20
slackp threads --count 20
slackp my-threads --count 20
slackp search 'from:alice in:engineering deployment' --count 10
slackp thread 'https://workspace.slack.com/archives/C.../p...'
slackp thread CHANNEL_ID TIMESTAMP
slackp context CHANNEL_ID TIMESTAMP --before 5 --after 5
slackp channels
slackp channel CHANNEL_ID
slackp recent CHANNEL_ID --count 5
slackp history CHANNEL_OR_DM_ID --count 50
slackp users
slackp user USER_ID
slackp user-by-email person@example.com
```

Writes require user authorization and CLI confirmation:

```text
slackp send CHANNEL_ID 'message' --yes
slackp send @username 'direct message' --yes
slackp send USER_ID 'direct message' --yes
slackp send CHANNEL_ID 'reply' --thread THREAD_TS --yes
slackp delete CHANNEL_ID MESSAGE_TS --yes
```

Profiles and authentication:

```text
slackp connect http://TAILSCALE-IP:8282
slackp profiles
slackp --profile laptop status
slackp use laptop
slackp disconnect
```

`connect` prompts for the key with hidden input. For controlled automation, it can read the first stdin line with `--key-stdin`; avoid this when command logs or process plumbing could expose the secret. The config is stored at `~/.config/slackp/config.json` with mode `0600`. `SLACKP_CONFIG` can select another config file and `SLACKP_PROFILE` another profile.

Advanced API access is available as `slackp request METHOD /api/path`. Non-GET requests require `--yes`. Prefer named commands because their argument validation and intent are clearer.
