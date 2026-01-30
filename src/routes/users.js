const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All these routes need authentication
router.use(authenticateToken);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.get('/leaderboard', userController.getLeaderboard);

// Admin Routes
const { checkRole } = require('../middleware/authMiddleware');
router.get('/', checkRole(['SuperAdmin']), userController.getAllUsers);
router.put('/:id/role', checkRole(['SuperAdmin']), userController.updateUserRole);
router.put('/:id/status', checkRole(['SuperAdmin']), userController.updateUserStatus);
router.put('/:id/reset-password', checkRole(['SuperAdmin']), userController.resetUserPassword);

module.exports = router;
