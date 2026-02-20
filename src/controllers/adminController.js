const { formatSuccessResponse } = require('../utils/helpers');

async function getWhitelistStatus(req, res, next) {
  try {
    const { whitelistService } = req.services;
    const status = whitelistService.getStatus();

    res.json(formatSuccessResponse(status));
  } catch (err) {
    next(err);
  }
}

module.exports = { getWhitelistStatus };
