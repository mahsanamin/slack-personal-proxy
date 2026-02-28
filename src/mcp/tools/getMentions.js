const { z } = require('zod');
const logger = require('../../utils/logger');

function register(server, services) {
  server.tool(
    'slack_get_mentions',
    'Get all your recent @mentions across Slack. Optionally includes full thread context for each mention.',
    {
      count: z.number().min(1).max(50).default(20)
        .describe('Number of mentions to fetch'),
      include_threads: z.boolean().default(true)
        .describe('Include full thread context for each mention'),
    },
    async ({ count, include_threads }) => {
      try {
        const { mentionService } = services();
        const result = await mentionService.getAllMentions(count, include_threads);

        const lines = [];
        lines.push(`# Mentions (${result.total_mentions} total)\n`);

        if (result.mentions.length === 0) {
          lines.push('No recent mentions.');
          return { content: [{ type: 'text', text: lines.join('\n') }] };
        }

        // Channel grouping summary
        const grouped = result.grouped_by_channel;
        if (grouped && Object.keys(grouped).length > 0) {
          lines.push('**By channel:** ' + Object.entries(grouped)
            .map(([ch, n]) => `#${ch} (${n})`)
            .join(', '));
          lines.push('');
        }

        for (const m of result.mentions) {
          const channel = m.channel_name || m.channel_id;
          const user = m.user_name || m.user_id || 'unknown';
          const time = m.time || '';
          lines.push(`### #${channel} — ${user} ${time ? `(${time})` : ''}`);
          lines.push(m.text || '(no text)');

          if (include_threads && m.thread_context) {
            const tc = m.thread_context;
            lines.push(`\n**Thread** (${tc.reply_count || 0} replies):`);
            if (tc.parent) {
              const pUser = tc.parent.user_name || tc.parent.user_id || 'unknown';
              lines.push(`> **${pUser}:** ${tc.parent.text || '(no text)'}`);
            }
            if (tc.replies) {
              for (const r of tc.replies.slice(-5)) {
                const rUser = r.user_name || r.user_id || 'unknown';
                lines.push(`> ${rUser}: ${r.text || '(no text)'}`);
              }
              if (tc.replies.length > 5) {
                lines.push(`> _(${tc.replies.length - 5} earlier replies omitted)_`);
              }
            }
          } else if (m.thread_ts) {
            lines.push(`_Thread: ${m.channel_id}/${m.thread_ts}_`);
          }
          lines.push('');
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        logger.error('MCP slack_get_mentions failed', { error: err.message });
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}

module.exports = { register };
