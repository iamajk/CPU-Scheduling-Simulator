// ══════════════════════════════════════════════
//   routes/analytics.js
// ══════════════════════════════════════════════
const express = require('express');
const router  = express.Router();
const { getStats, getComparison } = require('../controllers/analyticsController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/stats',      protect, adminOnly, getStats);
router.get('/comparison', protect,            getComparison);

module.exports = router;
