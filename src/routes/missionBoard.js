const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/:id/board', authenticateToken, async (req, res) => {
    try {
        const missionId = parseInt(req.params.id);

        const mission = await prisma.mission.findUnique({
            where: { id: missionId },
            include: {
                comments: {
                    include: { user: { select: { id: true, name: true } } },
                    orderBy: { createdAt: 'desc' }
                },
                checklist: {
                    orderBy: { createdAt: 'asc' }
                },
                collaborators: { select: { id: true } }
            }
        });

        if (!mission) {
            return res.status(404).json({ message: 'Mission not found' });
        }

        // Access Control
        const isCreator = mission.createdBy === req.user.id;
        const isCollaborator = mission.collaborators.some(c => c.id === req.user.id);
        const isSuperAdmin = req.user.role?.name === 'SuperAdmin' || req.user.roleId === 1;

        if (!isCreator && !isCollaborator && !isSuperAdmin) {
            return res.status(403).json({ message: 'Unauthorized: Not a member of the mission team' });
        }

        res.json({
            comments: mission.comments,
            checklist: mission.checklist
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
