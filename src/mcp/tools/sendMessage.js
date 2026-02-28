const { z } = require('zod');
const config = require('../../config');
const logger = require('../../utils/logger');

function register(server, services) {
  server.tool(
    'slack_send_message',
    'Send a message to a whitelisted Slack channel or DM, or reply in a thread. Requires ENABLE_WRITE_OPS=true and the channel/user must be in the whitelist.',
    {
      channel_id: z.string().min(1)
        .describe('Channel ID (C...) or DM channel ID (D...) to send to'),
      text: z.string().min(1)
        .describe('Message text to send'),
      thread_ts: z.string().optional()
        .describe('Thread timestamp to reply in a thread (optional)'),
    },
    async ({ channel_id, text, thread_ts }) => {
      try {
        if (!config.enableWriteOps) {
          return {
            content: [{ type: 'text', text: 'Error: Write operations are disabled (ENABLE_WRITE_OPS=false)' }],
            isError: true,
          };
        }

        const { messageService } = services();
        const result = await messageService.sendMessage(channel_id, text, thread_ts || null);

        const lines = [];
        lines.push('Message sent successfully.');
        lines.push(`Channel: ${result.channel}`);
        lines.push(`Timestamp: ${result.ts}`);
        if (thread_ts) {
          lines.push(`Thread: ${thread_ts}`);
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        logger.error('MCP slack_send_message failed', { error: err.message });
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}

module.exports = { register };
