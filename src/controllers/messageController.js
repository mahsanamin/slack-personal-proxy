const { formatSuccessResponse, parseBoolean } = require('../utils/helpers');
const { ERROR_CODES } = require('../utils/constants');
const { compactMessage } = require('../utils/compactThread');
const config = require('../config');

async function getMessageHistory(req, res, next) {
  try {
    const { messageService } = req.services;
    const { channelId } = req.params;
    const count = parseInt(req.query.count, 10) || 100;
    const oldest = req.query.oldest || null;
    const latest = req.query.latest || null;
    const verbose = parseBoolean(req.query.verbose, false);

    const result = await messageService.getMessageHistory(channelId, count, oldest, latest);
    const messages = verbose ? result.messages : result.messages.map(compactMessage).filter(Boolean);

    res.json(formatSuccessResponse(
      { messages, has_more: result.has_more },
      { api_calls_made: result.api_calls_made }
    ));
  } catch (err) {
    next(err);
  }
}

async function deleteMessage(req, res, next) {
  try {
    if (!config.enableWriteOps) {
      return res.status(ERROR_CODES.WRITE_OPS_DISABLED.status).json({
        success: false,
        error: ERROR_CODES.WRITE_OPS_DISABLED,
      });
    }

    const { messageService } = req.services;
    const { channelId, messageTs } = req.params;

    const result = await messageService.deleteMessage(channelId, messageTs);

    res.json(formatSuccessResponse({
      ts: result.ts,
      channel: result.channel,
    }));
  } catch (err) {
    next(err);
  }
}

async function sendMessage(req, res, next) {
  try {
    if (!config.enableWriteOps) {
      return res.status(ERROR_CODES.WRITE_OPS_DISABLED.status).json({
        success: false,
        error: ERROR_CODES.WRITE_OPS_DISABLED,
      });
    }

    const { messageService } = req.services;
    const { channelId } = req.params;
    const { text, thread_ts } = req.body;

    const result = await messageService.sendMessage(channelId, text, thread_ts || null);

    res.json(formatSuccessResponse({
      channel: result.channel,
      ts: result.ts,
      message: {
        text: result.message?.text,
        ts: result.ts,
      },
    }));
  } catch (err) {
    next(err);
  }
}

async function sendDirectMessage(req, res, next) {
  try {
    if (!config.enableWriteOps) {
      return res.status(ERROR_CODES.WRITE_OPS_DISABLED.status).json({
        success: false,
        error: ERROR_CODES.WRITE_OPS_DISABLED,
      });
    }

    const { messageService } = req.services;
    const { target, text, thread_ts } = req.body;
    const result = await messageService.sendDirectMessage(target, text, thread_ts || null);

    res.json(formatSuccessResponse({
      channel: result.channel,
      ts: result.ts,
      message: { text: result.message?.text, ts: result.ts },
    }));
  } catch (err) {
    next(err);
  }
}

module.exports = { sendMessage, sendDirectMessage, getMessageHistory, deleteMessage };
