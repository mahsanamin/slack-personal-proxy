const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createMcpServer } = require('./server');
const logger = require('../utils/logger');

function mountMcp(app, getServices) {
  // POST /mcp — handles all JSON-RPC messages (initialize, tools/list, tools/call)
  app.post('/mcp', async (req, res) => {
    try {
      const server = createMcpServer(getServices);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless mode
      });

      res.on('close', () => {
        transport.close();
        server.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error('MCP request failed', { error: err.message });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // GET and DELETE — not supported in stateless mode
  app.get('/mcp', (req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST for stateless MCP.' },
      id: null,
    });
  });

  app.delete('/mcp', (req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST for stateless MCP.' },
      id: null,
    });
  });

  logger.info('MCP server mounted at /mcp');
}

module.exports = { mountMcp };
