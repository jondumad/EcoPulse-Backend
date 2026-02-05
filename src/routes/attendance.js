const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { authenticateToken, checkRole } = require('../middleware/authMiddleware');

// All attendance routes require authentication
router.use(authenticateToken);

// Volunteer/User routes
router.post('/validate-location', attendanceController.validateLocation);
router.post('/check-in', attendanceController.checkIn);
router.post('/check-out', attendanceController.checkOut);
router.get('/current', attendanceController.getCurrentAttendance);

// Coordinator/Admin routes
router.get('/missions/:id/qr-code', checkRole(['Coordinator', 'SuperAdmin']), attendanceController.getQRCode);
router.get('/pending', checkRole(['Coordinator', 'SuperAdmin']), attendanceController.getPendingVerifications);
router.get('/recent-activity', checkRole(['Coordinator', 'SuperAdmin']), attendanceController.getRecentActivity);
router.put('/:id/verify', checkRole(['Coordinator', 'SuperAdmin']), attendanceController.verifyAttendance);

// Manual Management
router.post('/missions/:missionId/participants/:userId/check-in', checkRole(['Coordinator', 'SuperAdmin']), attendanceController.manualCheckIn);
router.post('/missions/:missionId/participants/:userId/complete', checkRole(['Coordinator', 'SuperAdmin']), attendanceController.manualComplete);

module.exports = router;
