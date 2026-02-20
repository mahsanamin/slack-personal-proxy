const { Router } = require('express');
const { searchMessages } = require('../controllers/searchController');
const { validateSearchQuery, validateCount, validateBoolean, validateSortOrder, handleValidationErrors } = require('../middleware/validator');

const router = Router();

/**
 * @swagger
 * /api/search/messages:
 *   get:
 *     summary: Global message search with thread context
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema: { type: string }
 *         description: Search text
 *         example: deploy bug
 *       - in: query
 *         name: count
 *         schema: { type: integer, minimum: 1, maximum: 20, default: 10 }
 *         description: Number of results (1-20)
 *       - in: query
 *         name: includeThreads
 *         schema: { type: boolean, default: true }
 *         description: Fetch thread context for matches in threads
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [timestamp, score], default: timestamp }
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Search results with optional thread context
 *       400:
 *         description: Missing or invalid query
 */
router.get('/messages',
  validateSearchQuery,
  validateCount(1, 20, 10),
  validateBoolean('includeThreads'),
  validateSortOrder,
  handleValidationErrors,
  searchMessages
);

module.exports = router;
