const { Router } = require('express');
const { getThread } = require('../controllers/conversationController');
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

module.exports = router;
