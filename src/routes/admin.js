const { Router } = require('express');
const { getWhitelistStatus, getCacheStats } = require('../controllers/adminController');

const router = Router();

/**
 * @swagger
 * /api/admin/whitelist-status:
 *   get:
 *     summary: Get current whitelist configuration and status
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Whitelist config
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     enforce: { type: boolean }
 *                     write_channels:
 *                       type: object
 *                       properties:
 *                         configured: { type: boolean }
 *                         count: { type: integer }
 *                         channels: { type: array, items: { type: string } }
 *                     dm_users:
 *                       type: object
 *                       properties:
 *                         configured: { type: boolean }
 *                         count: { type: integer }
 *                         users: { type: array, items: { type: string } }
 */
router.get('/whitelist-status', getWhitelistStatus);

/**
 * @swagger
 * /api/admin/cache-stats:
 *   get:
 *     summary: Get memory and persistent cache statistics
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Cache statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     memory_cache: { type: object }
 *                     persistent_cache: { type: object }
 */
router.get('/cache-stats', getCacheStats);

module.exports = router;
