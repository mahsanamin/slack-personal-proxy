# Using the Slack proxy without getting it rate limited

This guide is for anything that calls the proxy: agents, scripts, `slackp`, MCP clients.
Read it once before you start polling.

You can fetch it any time from the proxy: `slackp guide`, or `GET /guide` on the proxy
address (no key needed).

## Why this matters

All consumers share one Slack login, so they share one set of Slack limits. Slack limits
each method separately and answers `429` with a wait time when a method is used too much.
We have seen this on `conversations.replies` (wait 10 seconds) and on `conversations.list`
(wait 30 seconds). Slack documents `conversations.list` as a Tier 2 method, about 20 calls
a minute.

While the proxy waits for Slack on one method, requests that need that method wait too.
So one consumer that polls too hard slows down every other consumer. In the proxy logs we
saw about 1,200 thread fetches an hour, around the clock, and that was enough to cause
slow and failing calls.

## The rules

1. **Do not poll faster than once a minute.** For "tell me when something new arrives",
   every 2 to 5 minutes is plenty. The proxy keeps answers for about 45 seconds, so asking
   more often only returns the same answer.
2. **Ask for as little as you need.** Use `count=5` to `10`, not `50`. Skip the thread
   bodies when you only need to know something is new.
3. **Use a watermark.** Remember the timestamp of the newest message you saw and ask only
   for messages after it (`oldest=<ts>`). Do not re-read the same messages every time.
4. **Do not repeat a request that failed.** On a `429` or a `partial` answer, wait at
   least 30 seconds, then continue. Do not retry in a loop.
5. **One consumer, one key.** Create a separate key per agent or machine in the dashboard.
   The proxy logs which key made each request, which is how we find a noisy caller.
6. **Do not list all channels or users on a schedule.** Those lists are saved for 12 hours.
   They are expensive to rebuild, and Slack limits them tightly.
7. **Use the narrowest key you can.** A key limited to the channels it needs cannot cause
   load anywhere else.

## Which call to use

Cost is the number of Slack calls one request can cause. "Up to" figures are the worst
case for the default settings.

| You want | Use | Roughly what it costs | Notes |
|---|---|---|---|
| New messages in one channel | `GET /api/messages/:channelId/history?oldest=<ts>` or `slackp history` | 1 Slack call per 100 messages | Cheapest way to watch a channel. Always pass `oldest`. |
| Latest few messages in a channel | `GET /api/channels/:channelId/recent-messages?count=5&includeThreads=false` | 1 call. With `includeThreads=true`, 1 more call per message that has replies | Leave `includeThreads` off unless you read the replies. |
| One known thread | `GET /api/conversations/:channelId/thread/:threadTs` | 1 call, saved for 2 minutes | Best way to follow a thread you already know about. |
| A thread from a link | `GET /api/conversations/permalink?url=...` | 1 call | Same cost as above. |
| Were you mentioned | `GET /api/mentions/all?count=10&includeThreads=false` | 1 search call | Cheap when `includeThreads=false`. |
| Mentions with the full thread | `GET /api/mentions/threads` | 1 search call plus 1 call per thread | Heavy. Do not poll it. |
| Threads you are in | `GET /api/activity/threads-im-in` | 1 search call plus 1 call per thread | Heavy. Do not poll it. |
| Threads you started | `GET /api/activity/my-threads?includeReplies=false` | 1 search call plus 1 call per thread parent | Heavy, even with replies off. Do not poll it. |
| Search | `GET /api/search/messages?count=10&includeThreads=false` | 1 call, more with `includeThreads=true` | Keep `includeThreads` off. |
| Everything unread in one go | `slackp unread` | 3 heavy requests at once | A convenience for a person asking once. **Never run it on a timer.** |

The heavy calls are fine to run when a person asks a question. They are the wrong tool for
a timer.

## A good way to watch for new activity

1. Once at start, read the channels you care about with `history` and keep the newest `ts`
   for each one.
2. Every 2 to 5 minutes, call `history?oldest=<that ts>` for each channel. One cheap call
   each, and usually an empty answer.
3. When something new appears, read just that thread or message.
4. Do the heavy calls (`threads-im-in`, `my-threads`, `mentions/threads`) only when a
   person asks, never on a timer.

For mentions, one `mentions/all?count=10&includeThreads=false` every few minutes is enough
to know that someone mentioned you. Open the thread only for new mentions.

## What the proxy does for you, and what it does not

- It keeps recent answers for mentions and activity requests for about 45 seconds. A
  repeat of the same request in that window is free. The answer says `"reused": true` and
  `"age_seconds"`.
- It stops starting new work on a mention or activity request after about 20 seconds and
  returns what it has, with `"partial": true`. A partial answer is missing some threads. It
  is not an error. Wait, then ask again later. A call already waiting on Slack can still
  take longer.
- It does not hide a Slack limit. If Slack says wait, the proxy waits, and so does
  everyone who needs the same Slack method.
- Data from the 45-second window can be that old. If you just sent a message and need to
  see it right away, read it with `history` or the thread call, which are not held back.

## What to do when something looks stuck

| What you see | What it means | What to do |
|---|---|---|
| `meta.partial: true` | The request hit the 20 second limit. | Use what you got. Ask again in a minute or more. Ask for a smaller `count`. |
| HTTP 429 or `RATE_LIMIT_EXCEEDED` | Too many requests to the proxy. | Wait 30 seconds or more. |
| A call that takes many seconds | The proxy is waiting on Slack for that method. | Do not send more of the same call. |
| `INVALID_API_KEY` (401) | The key was revoked or mistyped. | Ask the owner for a new key. Do not retry. |
| `CHANNEL_NOT_IN_KEY_SCOPE` | The channel is not in this key's list. | Ask the owner to add the channel (or group DM) to this key. The key itself does not change, so keep using it. |
| `KEY_READ_ONLY` | The key cannot send or delete. | Use a read and write key if that is intended. |

## For the owner

- Each request is logged as one line with the key name, route, status, duration and the
  number of Slack calls it caused. Run `./proxy logs` and look for `slack_calls=`.
- To find a noisy consumer, look for a key that appears many times a minute, or lines with
  a high `slack_calls`.
- `ACTIVITY_CACHE_TTL_SECONDS` (default 45) and `REQUEST_BUDGET_SECONDS` (default 20)
  change the reuse window and the time limit. See `docs/configuration.md`.
