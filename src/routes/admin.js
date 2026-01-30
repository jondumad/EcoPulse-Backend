const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const badgeController = require('../controllers/badgeController');
const { authenticateToken, checkRole } = require('../middleware/authMiddleware');

router.use(authenticateToken);
router.use(checkRole(['SuperAdmin']));

// Reporting
router.get('/stats', adminController.getAggregatedStats);
router.get('/heatmap', adminController.getHeatmapData);
router.get('/export/attendance', adminController.exportAttendanceCSV);

// Mission Approval
const missionController = require('../controllers/missionController');
router.put('/missions/:id/approve', missionController.approveMission);

// Conflict Resolution
router.post('/attendance/manual', adminController.manualAttendance);

// Badges
router.get('/badges', badgeController.getAllBadges);
router.post('/badges', badgeController.createBadge);
router.put('/badges/:id', badgeController.updateBadge);
router.delete('/badges/:id', badgeController.deleteBadge);

module.exports = router;
