const { Router } = require('express');
const { listChannels, getChannelInfo, getRecentMessages } = require('../controllers/channelController');
const { validateChannelId, validateCount, validateBoolean, handleValidationErrors } = require('../middleware/validator');

const router = Router();

/**
 * @swagger
 * /api/channels:
 *   get:
 *     summary: List all channels (auto-paginated, cached)
 *     tags: [Channels]
 *     responses:
 *       200:
 *         description: List of channels
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     channels:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, example: C12345 }
 *                           name: { type: string, example: engineering }
 *                           is_private: { type: boolean }
 *                           member_count: { type: integer }
 *                     total_count: { type: integer }
 */
router.get('/', listChannels);

/**
 * @swagger
 * /api/channels/{channelId}/info:
 *   get:
 *     summary: Get channel details
 *     tags: [Channels]
 *     parameters:
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema: { type: string, pattern: '^[CDGW][A-Z0-9]+$' }
 *         example: C12345
 *     responses:
 *       200:
 *         description: Channel info
 *       400:
 *         description: Invalid channel ID
 *       404:
 *         description: Channel not found
 */
router.get('/:channelId/info',
  validateChannelId,
  handleValidationErrors,
  getChannelInfo
);

/**
 * @swagger
 * /api/channels/{channelId}/recent-messages:
 *   get:
 *     summary: Recent messages with automatic thread fetching
 *     tags: [Channels]
 *     parameters:
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema: { type: string }
 *         example: C12345
 *       - in: query
 *         name: count
 *         schema: { type: integer, minimum: 1, maximum: 10, default: 5 }
 *         description: Number of parent messages (1-10)
 *       - in: query
 *         name: includeThreads
 *         schema: { type: boolean, default: true }
 *         description: Auto-fetch thread replies
 *       - in: query
 *         name: verbose
 *         schema: { type: boolean, default: false }
 *         description: Return full Slack message objects (default compact)
 *     responses:
 *       200:
 *         description: Messages with optional thread replies
 *       400:
 *         description: Invalid parameters
 *       403:
 *         description: Channel not whitelisted
 */
router.get('/:channelId/recent-messages',
  validateChannelId,
  validateCount(1, 10, 5),
  validateBoolean('includeThreads'),
  validateBoolean('verbose'),
  handleValidationErrors,
  getRecentMessages
);

module.exports = router;
