const { formatSuccessResponse, parseBoolean } = require('../utils/helpers');
const { ERROR_CODES } = require('../utils/constants');
const { compactMessage } = require('../utils/compactThread');
const config = require('../config');
const configStore = require('../services/configStore');

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

    const result = await messageService.sendMessage(channelId, text, thread_ts || null, req.apiKey && req.apiKey.id);

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
    const result = await messageService.sendDirectMessage(target, text, thread_ts || null, req.apiKey && req.apiKey.id);

    res.json(formatSuccessResponse({
      channel: result.channel,
      ts: result.ts,
      message: { text: result.message?.text, ts: result.ts },
    }));
  } catch (err) {
    next(err);
  }
}

async function requestDirectMessage(req, res, next) {
  try {
    if (!config.enableWriteOps) {
      return res.status(ERROR_CODES.WRITE_OPS_DISABLED.status).json({ success: false, error: ERROR_CODES.WRITE_OPS_DISABLED });
    }
    if (!config.dmApprovals || !config.dmApprovals.enabled) {
      return res.status(ERROR_CODES.DM_APPROVALS_DISABLED.status).json({
        success: false,
        error: ERROR_CODES.DM_APPROVALS_DISABLED,
      });
    }
    if (!configStore.hasMasterKey()) {
      return res.status(ERROR_CODES.DM_APPROVAL_STORAGE_UNAVAILABLE.status).json({
        success: false,
        error: ERROR_CODES.DM_APPROVAL_STORAGE_UNAVAILABLE,
      });
    }
    const { whitelistService } = req.services;
    const { target, text, thread_ts } = req.body;
    const normalized = String(target || '').trim().replace(/^@/, '');
    const userId = await whitelistService.resolveUserTarget(normalized);
    if (!userId) throw { ...ERROR_CODES.USER_NOT_FOUND, details: { user: target } };
    const name = whitelistService.userIdToName.get(userId) || normalized;
    const approval = configStore.createDmApproval({
      target,
      userId,
      name,
      text,
      threadTs: thread_ts || null,
      apiKeyId: req.apiKey.id,
      apiKeyLabel: req.apiKey.label,
    });
    res.status(202).json(formatSuccessResponse({
      approval,
      next: `Open Dashboard → Approvals. To check later: slackp approval ${approval.id}`,
    }));
  } catch (err) {
    next(err);
  }
}

function getDirectMessageApproval(req, res) {
  const approval = configStore.getDmApproval(req.params.requestId);
  if (!approval || approval.apiKeyId !== req.apiKey.id) {
    return res.status(ERROR_CODES.USER_NOT_FOUND.status).json({ success: false, error: ERROR_CODES.USER_NOT_FOUND });
  }
  res.json(formatSuccessResponse({ approval }));
}

module.exports = {
  sendMessage,
  sendDirectMessage,
  requestDirectMessage,
  getDirectMessageApproval,
  getMessageHistory,
  deleteMessage,
};
