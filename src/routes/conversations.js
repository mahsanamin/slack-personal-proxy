const { Router } = require('express');
const { getThread, getContext } = require('../controllers/conversationController');
const { validateChannelId, validateTimestamp, handleValidationErrors } = require('../middleware/validator');

const router = Router();

/**
 * @swagger
 * /api/conversations/{channelId}/thread/{threadTs}:
 *   get:
 *     summary: Fetch complete thread by parent timestamp
 *     tags: [Conversations]
 *     parameters:
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema: { type: string }
 *         example: C12345
 *       - in: path
 *         name: threadTs
 *         required: true
 *         schema: { type: string, pattern: '^\d+\.\d+$' }
 *         description: Parent message timestamp
 *         example: "1708340000.123456"
 *     responses:
 *       200:
 *         description: Complete thread with parent and all replies
 *       400:
 *         description: Invalid parameters
 *       404:
 *         description: Thread not found
 */
router.get('/:channelId/thread/:threadTs',
  validateChannelId,
  validateTimestamp,
  handleValidationErrors,
  getThread
);

/**
 * @swagger
 * /api/conversations/{channelId}/context:
 *   get:
 *     summary: Get conversation context around a specific message
 *     tags: [Conversations]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: messageTs
 *         required: true
 *         schema:
 *           type: string
 *         description: Target message timestamp
 *       - in: query
 *         name: before
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Messages before target (max 10)
 *       - in: query
 *         name: after
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Messages after target (max 10)
 *     responses:
 *       200:
 *         description: Messages surrounding the target with optional thread context
 *       403:
 *         description: Channel not whitelisted
 */
router.get('/:channelId/context',
  validateChannelId,
  handleValidationErrors,
  getContext
);

module.exports = router;
