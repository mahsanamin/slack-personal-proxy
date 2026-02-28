const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');

const slackSummary = require('./tools/slackSummary');
const getMentions = require('./tools/getMentions');
const getThreadActivity = require('./tools/getThreadActivity');
const sendMessage = require('./tools/sendMessage');
const search = require('./tools/search');
const getThread = require('./tools/getThread');
const unread = require('./tools/unread');

function createMcpServer(getServices) {
  const server = new McpServer({
    name: 'slack-personal-proxy',
    version: '1.0.0',
  });

  slackSummary.register(server, getServices);
  getMentions.register(server, getServices);
  getThreadActivity.register(server, getServices);
  sendMessage.register(server, getServices);
  search.register(server, getServices);
  getThread.register(server, getServices);
  unread.register(server, getServices);

  return server;
}

module.exports = { createMcpServer };
