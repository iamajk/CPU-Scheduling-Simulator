// ══════════════════════════════════════════════
//   routes/auth.js
// ══════════════════════════════════════════════
const express = require('express');
const router  = express.Router();
const { register, login, getProfile } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { registerValidation, loginValidation } = require('../utils/validators');
const { authLimiter } = require('../middleware/rateLimiter');

router.post('/register', authLimiter, registerValidation, register);
router.post('/login',    authLimiter, loginValidation,    login);
router.get('/profile',   protect,                         getProfile);

module.exports = router;
