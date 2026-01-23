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
router.put('/:id/verify', checkRole(['Coordinator', 'SuperAdmin']), attendanceController.verifyAttendance);

module.exports = router;
