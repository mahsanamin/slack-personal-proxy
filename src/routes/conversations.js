const { Router } = require('express');
const { getThread, getContext, getThreadByPermalink } = require('../controllers/conversationController');
const { validateChannelId, validateTimestamp, validateBoolean, handleValidationErrors } = require('../middleware/validator');

const router = Router();

/**
 * @swagger
 * /api/conversations/permalink:
 *   get:
 *     summary: Fetch thread by Slack permalink URL
 *     tags: [Conversations]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema: { type: string }
 *         description: Slack permalink URL
 *         example: "https://workspace.slack.com/archives/C12345/p1708340000123456"
 *       - in: query
 *         name: verbose
 *         schema: { type: boolean, default: false }
 *         description: Return full Slack message objects (default compact)
 *     responses:
 *       200:
 *         description: Complete thread with parent and all replies
 *       400:
 *         description: Invalid permalink URL
 *       404:
 *         description: Thread not found
 */
router.get('/permalink',
  validateBoolean('verbose'),
  handleValidationErrors,
  getThreadByPermalink
);

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
 *       - in: query
 *         name: verbose
 *         schema: { type: boolean, default: false }
 *         description: Return full Slack message objects (default compact)
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
  validateBoolean('verbose'),
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
 *       - in: query
 *         name: verbose
 *         schema: { type: boolean, default: false }
 *         description: Return full Slack message objects (default compact)
 *     responses:
 *       200:
 *         description: Messages surrounding the target with optional thread context
 *       403:
 *         description: Channel not whitelisted
 */
router.get('/:channelId/context',
  validateChannelId,
  validateBoolean('verbose'),
  handleValidationErrors,
  getContext
);

module.exports = router;
