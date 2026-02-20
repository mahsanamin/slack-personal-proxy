const { formatSuccessResponse } = require('../utils/helpers');
const { ERROR_CODES } = require('../utils/constants');
const config = require('../config');

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

module.exports = { sendMessage };
