const { z } = require('zod');
const logger = require('../../utils/logger');

function register(server, services) {
  server.tool(
    'slack_get_thread_activity',
    'Get threads you participated in that have new replies since your last message. Shows what conversations need your attention.',
    {
      count: z.number().min(1).max(50).default(20)
        .describe('Number of threads to fetch'),
    },
    async ({ count }) => {
      try {
        const { activityService } = services();
        const result = await activityService.getThreadsImIn(count);

        const lines = [];
        lines.push(`# Thread Activity (${result.threads_with_new_activity} with new replies)\n`);

        if (result.threads.length === 0) {
          lines.push('No recent thread activity.');
          return { content: [{ type: 'text', text: lines.join('\n') }] };
        }

        for (const t of result.threads) {
          const channel = t.channel_name || t.channel_id;
          const newReplies = t.new_reply_count || 0;
          const totalReplies = t.reply_count || 0;
          const marker = newReplies > 0 ? ` **[${newReplies} new]**` : '';

          lines.push(`### #${channel}${marker}`);
          lines.push(`${t.parent_text || t.text || '(no text)'}`);
          lines.push(`_${totalReplies} total replies | Thread: ${t.channel_id}/${t.thread_ts}_`);

          // Show recent new replies if available
          if (t.new_replies && t.new_replies.length > 0) {
            lines.push('');
            for (const r of t.new_replies.slice(-3)) {
              const user = r.user_name || r.user_id || 'unknown';
              lines.push(`> ${user}: ${r.text || '(no text)'}`);
            }
            if (t.new_replies.length > 3) {
              lines.push(`> _(${t.new_replies.length - 3} more new replies)_`);
            }
          }
          lines.push('');
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        logger.error('MCP slack_get_thread_activity failed', { error: err.message });
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}

module.exports = { register };
