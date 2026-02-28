const { z } = require('zod');
const logger = require('../../utils/logger');

function register(server, services) {
  server.tool(
    'slack_search',
    'Search Slack messages. Supports Slack search syntax: "from:username", "in:channel-name", "has:link", date filters, etc.',
    {
      query: z.string().min(1)
        .describe('Search query (supports Slack search syntax like from:user, in:channel)'),
      count: z.number().min(1).max(50).default(10)
        .describe('Number of results to return'),
      include_threads: z.boolean().default(false)
        .describe('Include full thread context for each result'),
    },
    async ({ query, count, include_threads }) => {
      try {
        const { searchService } = services();
        const result = await searchService.searchMessages(query, count, include_threads);

        const lines = [];
        lines.push(`# Search: "${query}" (${result.total_matches} matches)\n`);

        if (result.results.length === 0) {
          lines.push('No results found.');
          return { content: [{ type: 'text', text: lines.join('\n') }] };
        }

        for (const item of result.results) {
          const msg = item.message || item;
          const channel = msg.channel_name || msg.channel_id || 'unknown';
          const user = msg.user_name || msg.user_id || 'unknown';
          const time = msg.time || '';

          lines.push(`### #${channel} — ${user} ${time ? `(${time})` : ''}`);
          lines.push(msg.text || '(no text)');

          if (msg.thread_ts) {
            lines.push(`_Thread: ${msg.channel_id}/${msg.thread_ts}_`);
          }

          if (include_threads && item.thread_context) {
            const tc = item.thread_context;
            lines.push(`\n**Thread** (${tc.reply_count || 0} replies):`);
            if (tc.replies) {
              for (const r of tc.replies.slice(-3)) {
                const rUser = r.user_name || r.user_id || 'unknown';
                lines.push(`> ${rUser}: ${r.text || '(no text)'}`);
              }
            }
          }
          lines.push('');
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        logger.error('MCP slack_search failed', { error: err.message });
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}

module.exports = { register };
