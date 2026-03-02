const { formatSuccessResponse, parseBoolean } = require('../utils/helpers');
const { compactSearchResult } = require('../utils/compactThread');

async function searchMessages(req, res, next) {
  try {
    const { searchService } = req.services;
    const { query } = req.query;
    const count = parseInt(req.query.count, 10) || 10;
    const includeThreads = parseBoolean(req.query.includeThreads, true);
    const sortOrder = req.query.sortOrder || 'timestamp';
    const verbose = parseBoolean(req.query.verbose, false);

    const result = await searchService.searchMessages(query, count, includeThreads, sortOrder);
    const results = verbose ? result.results : result.results.map(compactSearchResult);

    res.json(formatSuccessResponse(
      { results, total_matches: result.total_matches },
      { query: result.query, searched_channels: 'whitelisted_only', api_calls_made: result.api_calls_made }
    ));
  } catch (err) {
    next(err);
  }
}

module.exports = { searchMessages };
