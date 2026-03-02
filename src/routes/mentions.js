const { Router } = require('express');
const { getAllMentions, getMentionThreads, getMentionsByChannel } = require('../controllers/mentionController');
const { validateChannelId, validateCount, validateBoolean, handleValidationErrors } = require('../middleware/validator');

const router = Router();

/**
 * @swagger
 * /api/mentions/all:
 *   get:
 *     summary: Get all messages where you are mentioned
 *     tags: [Mentions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: count
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of mentions (1-50)
 *       - in: query
 *         name: includeThreads
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Fetch complete thread context for thread mentions
 *       - in: query
 *         name: verbose
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Return full Slack message objects (default compact)
 *     responses:
 *       200:
 *         description: List of mentions grouped by channel
 */
router.get(
  '/all',
  validateCount(1, 50, 20),
  validateBoolean('includeThreads'),
  validateBoolean('verbose'),
  handleValidationErrors,
  getAllMentions
);

/**
 * @swagger
 * /api/mentions/threads:
 *   get:
 *     summary: Get threads where you were mentioned
 *     tags: [Mentions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: count
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of mentions to search (1-50)
 *       - in: query
 *         name: verbose
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Return full Slack message objects (default compact)
 *     responses:
 *       200:
 *         description: Deduplicated threads with mention details
 */
router.get(
  '/threads',
  validateCount(1, 50, 20),
  validateBoolean('verbose'),
  handleValidationErrors,
  getMentionThreads
);

/**
 * @swagger
 * /api/mentions/by-channel/{channelId}:
 *   get:
 *     summary: Get mentions in a specific channel
 *     tags: [Mentions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema:
 *           type: string
 *         description: Channel ID (must be whitelisted)
 *       - in: query
 *         name: count
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: includeThreads
 *         schema:
 *           type: boolean
 *           default: true
 *       - in: query
 *         name: verbose
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Return full Slack message objects (default compact)
 *     responses:
 *       200:
 *         description: Mentions in specified channel
 *       403:
 *         description: Channel not whitelisted
 */
router.get(
  '/by-channel/:channelId',
  validateChannelId,
  validateCount(1, 50, 20),
  validateBoolean('includeThreads'),
  validateBoolean('verbose'),
  handleValidationErrors,
  getMentionsByChannel
);

module.exports = router;
