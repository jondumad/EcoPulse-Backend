const express = require('express');
const router = express.Router();
const missionController = require('../controllers/missionController');
const registrationController = require('../controllers/registrationController');
const { authenticateToken, checkRole } = require('../middleware/authMiddleware');

// Public routes (or arguably public, for browsing)
// We might want authentication to see details, but browsing could be public.
// Implementation plan implies auth needed for most but filtering is generic.
// Let's protect all for now as per "authenticateToken for protected routes" roughly.

// CRUD
router.get('/', authenticateToken, missionController.getMissions);
router.get('/:id', authenticateToken, missionController.getMissionById);

router.post('/', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.createMission);
router.put('/:id', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.updateMission);
router.delete('/:id', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.deleteMission);

// Registration
// Volunteers register themselves
router.post('/:id/register', authenticateToken, registrationController.registerForMission);
router.delete('/:id/register', authenticateToken, registrationController.cancelRegistration);

// Coordinator view of registrations
router.get('/:id/registrations', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), registrationController.getMissionRegistrations);

module.exports = router;
