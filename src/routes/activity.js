const { Router } = require('express');
const { getThreadsImIn, getMyThreads } = require('../controllers/activityController');
const { validateCount, validateBoolean, handleValidationErrors } = require('../middleware/validator');

const router = Router();

/**
 * @swagger
 * /api/activity/threads-im-in:
 *   get:
 *     summary: Get threads you participated in
 *     tags: [Activity]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: count
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of messages to search (1-50)
 *     responses:
 *       200:
 *         description: Threads with your replies and activity stats
 */
router.get(
  '/threads-im-in',
  validateCount(1, 50, 20),
  handleValidationErrors,
  getThreadsImIn
);

/**
 * @swagger
 * /api/activity/my-threads:
 *   get:
 *     summary: Get threads you started
 *     tags: [Activity]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: count
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of messages to search (1-50)
 *       - in: query
 *         name: includeReplies
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Fetch complete thread replies
 *     responses:
 *       200:
 *         description: Threads you initiated with reply details
 */
router.get(
  '/my-threads',
  validateCount(1, 50, 20),
  validateBoolean('includeReplies'),
  handleValidationErrors,
  getMyThreads
);

module.exports = router;
