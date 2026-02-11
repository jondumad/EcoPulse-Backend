const express = require('express');
const router = express.Router();
const missionController = require('../controllers/missionController');
const registrationController = require('../controllers/registrationController');
const { authenticateToken, checkRole } = require('../middleware/authMiddleware');

// Public routes (or arguably public, for browsing)
// We might want authentication to see details, but browsing could be public.
// Implementation plan implies auth needed for most but filtering is generic.
// Let's protect all for now as per "authenticateToken for protected routes" roughly.

// Basic Browse (Categories)
router.get('/categories', missionController.getAllCategories);

// Templates
router.get('/templates', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.getTemplates);

// CRUD
// CRUD
router.post('/batch-action', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.batchAction);
router.post('/:id/duplicate', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.duplicateMission);
router.post('/:id/invite', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.inviteToMission);
router.post('/:id/contact-volunteers', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.contactVolunteers);

router.get('/', authenticateToken, missionController.getMissions);
router.get('/:id', authenticateToken, missionController.getMissionById);

router.post('/', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.createMission);
router.put('/:id', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.updateMission);
router.delete('/:id', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.deleteMission);

// Registration
// Volunteers register themselves
router.post('/:id/register', authenticateToken, registrationController.registerForMission);
router.delete('/:id/register', authenticateToken, registrationController.cancelRegistration);
router.post('/:id/decline', authenticateToken, registrationController.declineInvitation);

// Coordinator view of registrations
router.get('/:id/registrations', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), registrationController.getMissionRegistrations);
router.post('/:id/invite-user', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), registrationController.inviteUserToMission);

// Collaborators
router.get('/:id/collaborators', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.getCollaborators);
router.post('/:id/collaborators', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.addCollaborator);
router.delete('/:id/collaborators', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.removeCollaborator);

// Individual volunteer notification
router.post('/:id/participants/:userId/notify', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), missionController.contactVolunteer);

// Coordinator waitlist management
router.post('/registrations/:registrationId/promote', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), registrationController.promoteUser);
router.patch('/registrations/:registrationId/priority', authenticateToken, checkRole(['Coordinator', 'SuperAdmin']), registrationController.setPriority);

module.exports = router;
