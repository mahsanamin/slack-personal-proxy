const { formatSuccessResponse } = require('../utils/helpers');

async function testAuth(req, res, next) {
  try {
    const { slackClient } = req.services;

    const authResult = await slackClient.authTest();

    res.json(formatSuccessResponse({
      team_id: authResult.team_id,
      team_name: authResult.team,
      user_id: authResult.user_id,
      user_name: authResult.user,
      auth_method: slackClient.authMethod,
      is_valid: true,
    }));
  } catch (err) {
    next(err);
  }
}

module.exports = { testAuth };
