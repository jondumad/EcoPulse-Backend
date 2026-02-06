const express = require('express');
const router = express.Router();
const badgeController = require('../controllers/badgeController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/', authenticateToken, badgeController.getAllBadges);

module.exports = router;
