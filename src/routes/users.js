const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All these routes need authentication
router.use(authenticateToken);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.get('/leaderboard', userController.getLeaderboard);

module.exports = router;
