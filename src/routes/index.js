const { Router } = require('express');
const authRoutes = require('./auth');
const channelRoutes = require('./channels');
const userRoutes = require('./users');
const searchRoutes = require('./search');
const conversationRoutes = require('./conversations');
const adminRoutes = require('./admin');

const router = Router();

router.use('/auth', authRoutes);
router.use('/channels', channelRoutes);
router.use('/users', userRoutes);
router.use('/search', searchRoutes);
router.use('/conversations', conversationRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
