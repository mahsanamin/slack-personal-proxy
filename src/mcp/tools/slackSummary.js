const { z } = require('zod');
const logger = require('../../utils/logger');

function register(server, services) {
  server.tool(
    'slack_summary',
    'Get a combined overview of your Slack activity: recent @mentions and threads with new replies. Best first call to understand what needs attention.',
    {
      mention_count: z.number().min(1).max(50).default(10)
        .describe('Number of recent mentions to fetch'),
      thread_count: z.number().min(1).max(50).default(10)
        .describe('Number of recent threads to fetch'),
    },
    async ({ mention_count, thread_count }) => {
      try {
        const { mentionService, activityService } = services();

        const [mentions, threads] = await Promise.all([
          mentionService.getAllMentions(mention_count, false),
          activityService.getThreadsImIn(thread_count),
        ]);

        const lines = [];

        lines.push('# Slack Summary\n');

        // Mentions section
        lines.push(`## Mentions (${mentions.total_mentions} total)\n`);
        if (mentions.mentions.length === 0) {
          lines.push('No recent mentions.\n');
        } else {
          for (const m of mentions.mentions) {
            const channel = m.channel_name || m.channel_id;
            const user = m.user_name || m.user_id || 'unknown';
            const time = m.time || '';
            lines.push(`- **#${channel}** | ${user} ${time ? `(${time})` : ''}`);
            lines.push(`  ${m.text || '(no text)'}`);
            if (m.thread_ts) {
              lines.push(`  _Thread: ${m.channel_id}/${m.thread_ts}_`);
            }
          }
          lines.push('');
        }

        // Thread activity section
        lines.push(`## Thread Activity (${threads.threads_with_new_activity} with new replies)\n`);
        if (threads.threads.length === 0) {
          lines.push('No recent thread activity.\n');
        } else {
          for (const t of threads.threads) {
            const channel = t.channel_name || t.channel_id;
            const newReplies = t.new_reply_count || 0;
            const marker = newReplies > 0 ? ` [${newReplies} new]` : '';
            lines.push(`- **#${channel}**${marker}`);
            lines.push(`  ${t.parent_text || t.text || '(no text)'}`);
            lines.push(`  _Thread: ${t.channel_id}/${t.thread_ts}_`);
          }
          lines.push('');
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        logger.error('MCP slack_summary failed', { error: err.message });
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}

module.exports = { register };
