const { Router } = require('express');
const { testAuth } = require('../controllers/authController');

const router = Router();

/**
 * @swagger
 * /api/auth/test:
 *   get:
 *     summary: Test authentication validity
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Auth info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     team_id: { type: string, example: T12345 }
 *                     team_name: { type: string, example: MyWorkspace }
 *                     user_id: { type: string, example: U12345 }
 *                     user_name: { type: string, example: alice }
 *                     auth_method: { type: string, enum: [bot_token, cookie] }
 *                     is_valid: { type: boolean, example: true }
 *       401:
 *         description: Missing or invalid API key
 */
router.get('/test', testAuth);

module.exports = router;
