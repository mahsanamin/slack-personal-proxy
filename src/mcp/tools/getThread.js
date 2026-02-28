const { z } = require('zod');
const logger = require('../../utils/logger');

function register(server, services) {
  server.tool(
    'slack_get_thread',
    'Get the complete thread (parent message + all replies) for a specific conversation. Use channel_id and thread_ts from other tools.',
    {
      channel_id: z.string().min(1)
        .describe('Channel ID (C...) where the thread is'),
      thread_ts: z.string().min(1)
        .describe('Thread timestamp (parent message ts)'),
    },
    async ({ channel_id, thread_ts }) => {
      try {
        const { messageService } = services();
        const result = await messageService.getCompleteThread(channel_id, thread_ts);

        const lines = [];

        // Parent message
        if (result.parent) {
          const pUser = result.parent.user_name || result.parent.user_id || 'unknown';
          const pTime = result.parent.time || '';
          lines.push(`# Thread in ${channel_id}`);
          lines.push(`**${pUser}** ${pTime ? `(${pTime})` : ''}:`);
          lines.push(result.parent.text || '(no text)');
          lines.push(`\n_${result.reply_count || 0} replies | ${(result.participants || []).length} participants_\n`);
        }

        // Replies
        if (result.replies && result.replies.length > 0) {
          lines.push('---\n');
          for (const r of result.replies) {
            const user = r.user_name || r.user_id || 'unknown';
            const time = r.time || '';
            lines.push(`**${user}** ${time ? `(${time})` : ''}:`);
            lines.push(r.text || '(no text)');
            lines.push('');
          }
        }

        if (result.truncated) {
          lines.push('_(Thread was truncated due to length)_');
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        logger.error('MCP slack_get_thread failed', { error: err.message });
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}

module.exports = { register };
