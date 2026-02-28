const { z } = require('zod');
const logger = require('../../utils/logger');

function register(server, services) {
  server.tool(
    'slack_unread',
    'Catch up on everything: @mentions, threads you\'re in with new replies, and threads you started with new activity. Runs all 3 queries in parallel and deduplicates. Best single call to see what needs your attention.',
    {
      count: z.number().min(1).max(30).default(10)
        .describe('Number of items to fetch per category (mentions, threads-im-in, my-threads)'),
    },
    async ({ count }) => {
      try {
        const { mentionService, activityService } = services();

        // All three in parallel — no thread context to keep it fast
        const [mentions, threadsImIn, myThreads] = await Promise.all([
          mentionService.getAllMentions(count, false),
          activityService.getThreadsImIn(count),
          activityService.getMyThreads(count, false),
        ]);

        // Deduplicate threads across threadsImIn and myThreads
        const seenThreadKeys = new Set();
        const tagThread = (t, source) => {
          const key = `${t.channel_id}:${t.thread_ts}`;
          if (seenThreadKeys.has(key)) return null;
          seenThreadKeys.add(key);
          return { ...t, _source: source };
        };

        // Also track which threads are already covered by mentions
        const mentionThreadKeys = new Set();
        for (const m of mentions.mentions) {
          if (m.thread_ts) {
            mentionThreadKeys.add(`${m.channel_id}:${m.thread_ts}`);
          }
        }

        // Prioritize threads with new activity
        const activeThreadsImIn = threadsImIn.threads
          .filter(t => (t.new_reply_count || 0) > 0)
          .map(t => tagThread(t, 'threads-im-in'))
          .filter(Boolean);

        const activeMyThreads = myThreads.threads
          .map(t => tagThread(t, 'my-threads'))
          .filter(Boolean);

        const lines = [];
        lines.push('# Slack Unread Catch-Up\n');

        // 1. Mentions — highest priority
        lines.push(`## @Mentions (${mentions.total_mentions})\n`);
        if (mentions.mentions.length === 0) {
          lines.push('No recent mentions.\n');
        } else {
          for (const m of mentions.mentions) {
            const channel = m.channel_name || m.channel_id;
            const user = m.user_name || m.user_id || 'unknown';
            const time = m.time || '';
            lines.push(`- **#${channel}** | ${user} ${time ? `(${time})` : ''}`);
            lines.push(`  ${truncate(m.text)}`);
            if (m.thread_ts) {
              lines.push(`  _Thread: ${m.channel_id}/${m.thread_ts}_`);
            }
          }
          lines.push('');
        }

        // 2. Threads I'm in with new replies (excluding ones already in mentions)
        const filteredThreadsImIn = activeThreadsImIn
          .filter(t => !mentionThreadKeys.has(`${t.channel_id}:${t.thread_ts}`));

        lines.push(`## Threads With New Replies (${filteredThreadsImIn.length})\n`);
        if (filteredThreadsImIn.length === 0) {
          lines.push('No new thread replies.\n');
        } else {
          for (const t of filteredThreadsImIn) {
            const channel = t.channel_name || t.channel_id;
            const newReplies = t.new_reply_count || 0;
            lines.push(`- **#${channel}** [${newReplies} new]`);
            lines.push(`  ${truncate(t.parent_text || t.text)}`);
            lines.push(`  _Thread: ${t.channel_id}/${t.thread_ts}_`);
          }
          lines.push('');
        }

        // 3. My threads with activity
        lines.push(`## Your Threads (${activeMyThreads.length})\n`);
        if (activeMyThreads.length === 0) {
          lines.push('No active threads you started.\n');
        } else {
          for (const t of activeMyThreads) {
            const channel = t.channel_name || t.channel_id;
            const replies = t.reply_count || 0;
            lines.push(`- **#${channel}** (${replies} replies)`);
            lines.push(`  ${truncate(t.parent_text || t.text)}`);
            lines.push(`  _Thread: ${t.channel_id}/${t.thread_ts}_`);
          }
          lines.push('');
        }

        // Quick stats
        const totalItems = mentions.total_mentions + filteredThreadsImIn.length + activeMyThreads.length;
        lines.push(`---\n_${totalItems} items needing attention | Use slack_get_thread to dive into any thread_`);

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        logger.error('MCP slack_unread failed', { error: err.message });
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}

function truncate(text, max = 200) {
  if (!text) return '(no text)';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

module.exports = { register };
