const { Router } = require('express');
const { listUsers, getUserProfile } = require('../controllers/userController');
const { validateBoolean, handleValidationErrors } = require('../middleware/validator');
const { param } = require('express-validator');

const router = Router();

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List all workspace users (auto-paginated, cached)
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: includeDeleted
 *         schema: { type: boolean, default: false }
 *         description: Include deleted users
 *       - in: query
 *         name: includeBots
 *         schema: { type: boolean, default: false }
 *         description: Include bot users
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/',
  validateBoolean('includeDeleted'),
  validateBoolean('includeBots'),
  handleValidationErrors,
  listUsers
);

/**
 * @swagger
 * /api/users/{userId}/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, pattern: '^[UW][A-Z0-9]+$' }
 *         example: U12345
 *     responses:
 *       200:
 *         description: User profile
 *       400:
 *         description: Invalid user ID
 *       404:
 *         description: User not found
 */
router.get('/:userId/profile',
  param('userId').matches(/^[UW][A-Z0-9]+$/).withMessage('Invalid user ID format.'),
  handleValidationErrors,
  getUserProfile
);

module.exports = router;
