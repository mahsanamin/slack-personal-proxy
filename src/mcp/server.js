const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');

const slackSummary = require('./tools/slackSummary');
const getMentions = require('./tools/getMentions');
const getThreadActivity = require('./tools/getThreadActivity');
const sendMessage = require('./tools/sendMessage');
const search = require('./tools/search');
const getThread = require('./tools/getThread');
const unread = require('./tools/unread');

function createMcpServer(getServices, access) {
  const server = new McpServer({
    name: 'slack-personal-proxy',
    version: '1.0.0',
  });

  slackSummary.register(server, getServices, access);
  getMentions.register(server, getServices, access);
  getThreadActivity.register(server, getServices, access);
  sendMessage.register(server, getServices, access);
  search.register(server, getServices, access);
  getThread.register(server, getServices, access);
  unread.register(server, getServices, access);

  return server;
}

module.exports = { createMcpServer };
