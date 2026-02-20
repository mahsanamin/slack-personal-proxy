const { formatSuccessResponse, parseBoolean } = require('../utils/helpers');

async function listUsers(req, res, next) {
  try {
    const { userService } = req.services;
    const includeDeleted = parseBoolean(req.query.includeDeleted, false);
    const includeBots = parseBoolean(req.query.includeBots, false);

    const result = await userService.listUsers(includeDeleted, includeBots);

    res.json(formatSuccessResponse(
      { users: result.users, total_count: result.total_count },
      { cached: result.cached, api_calls_made: result.api_calls_made }
    ));
  } catch (err) {
    next(err);
  }
}

async function getUserProfile(req, res, next) {
  try {
    const { userService } = req.services;
    const { userId } = req.params;

    const result = await userService.getUserProfile(userId);

    res.json(formatSuccessResponse(result, { cached: result.cached }));
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, getUserProfile };
