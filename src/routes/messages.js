const { Router } = require('express');
const { sendMessage, sendDirectMessage, getMessageHistory, deleteMessage } = require('../controllers/messageController');
const {
  validateChannelId,
  validateMessageText,
  validateDmTarget,
  validateMessageTs,
  validateThreadTs,
  validateCount,
  validateBoolean,
  validateOptionalTimestamp,
  handleValidationErrors,
} = require('../middleware/validator');

const router = Router();

// Send to an allowlisted user without requiring callers to discover a D-channel ID.
router.post(
  '/dm/send',
  validateDmTarget,
  validateMessageText,
  validateThreadTs,
  handleValidationErrors,
  sendDirectMessage
);

/**
 * @swagger
 * /api/messages/{channelId}/send:
 *   post:
 *     summary: Send a message to a whitelisted channel
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema:
 *           type: string
 *         description: Channel ID (must be in write whitelist)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: Message text
 *                 example: "Hello from the proxy!"
 *               thread_ts:
 *                 type: string
 *                 description: Thread timestamp to reply in (optional)
 *                 example: "1234567890.123456"
 *     responses:
 *       200:
 *         description: Message sent successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Channel not in write whitelist or write ops disabled
 */
router.post(
  '/:channelId/send',
  validateChannelId,
  validateMessageText,
  validateThreadTs,
  handleValidationErrors,
  sendMessage
);

/**
 * @swagger
 * /api/messages/{channelId}/history:
 *   get:
 *     summary: Fetch message history from a channel or DM
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema: { type: string }
 *         description: Channel or DM ID
 *       - in: query
 *         name: count
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 100 }
 *         description: Number of messages to return (1-200)
 *       - in: query
 *         name: oldest
 *         schema: { type: string }
 *         description: Only return messages after this timestamp
 *       - in: query
 *         name: latest
 *         schema: { type: string }
 *         description: Only return messages before this timestamp
 *       - in: query
 *         name: verbose
 *         schema: { type: boolean, default: false }
 *         description: Return full Slack message objects (default compact)
 *     responses:
 *       200:
 *         description: Message history
 *       400:
 *         description: Invalid parameters
 */
router.get(
  '/:channelId/history',
  validateChannelId,
  validateCount(1, 200, 100),
  validateOptionalTimestamp('oldest'),
  validateOptionalTimestamp('latest'),
  validateBoolean('verbose'),
  handleValidationErrors,
  getMessageHistory
);

/**
 * @swagger
 * /api/messages/{channelId}/{messageTs}:
 *   delete:
 *     summary: Delete a specific message
 *     tags: [Messages]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema: { type: string }
 *         description: Channel or DM ID (must be in write whitelist)
 *       - in: path
 *         name: messageTs
 *         required: true
 *         schema: { type: string, pattern: '^\d+\.\d+$' }
 *         description: Message timestamp to delete
 *     responses:
 *       200:
 *         description: Message deleted successfully
 *       400:
 *         description: Invalid parameters
 *       403:
 *         description: Channel not in write whitelist or write ops disabled
 */
router.delete(
  '/:channelId/:messageTs',
  validateChannelId,
  validateMessageTs,
  handleValidationErrors,
  deleteMessage
);

module.exports = router;
