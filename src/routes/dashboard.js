const path = require('path');
const express = require('express');
const dashboardAuth = require('../middleware/dashboardAuth');
const c = require('../controllers/dashboardController');

const router = express.Router();
const PUBLIC_DIR = path.join(__dirname, '..', 'dashboard', 'public');

// Static SPA shell (HTML/JS/CSS only, no secrets). Still gated by the global ipWhitelist.
router.use('/', express.static(PUBLIC_DIR));

// Public: auth + a tiny bootstrap probe so the SPA knows whether login is configured.
router.post('/login', c.login);
router.post('/logout', c.logout);
router.get('/api/bootstrap', c.bootstrap);

// Everything below requires a valid dashboard session.
router.use('/api', dashboardAuth);

router.get('/api/status', c.status);

router.post('/api/setup/test', c.testSlack);
router.post('/api/setup/slack', c.saveSlack);

router.get('/api/keys', c.listKeys);
router.post('/api/keys', c.createKey);
router.delete('/api/keys/:id', c.revokeKey);

router.get('/api/dm-allowlist', c.listDmUsers);
router.post('/api/dm-allowlist', c.addDmUser);
router.delete('/api/dm-allowlist/:id', c.removeDmUser);

router.get('/api/summary', c.summary);

module.exports = router;
