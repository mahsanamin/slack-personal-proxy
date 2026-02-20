const { Router } = require('express');
const { sendMessage } = require('../controllers/messageController');
const {
  validateChannelId,
  validateMessageText,
  validateThreadTs,
  handleValidationErrors,
} = require('../middleware/validator');

const router = Router();

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

module.exports = router;
