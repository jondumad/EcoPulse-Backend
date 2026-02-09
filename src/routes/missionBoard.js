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
                }
            }
        });

        if (!mission) {
            return res.status(404).json({ message: 'Mission not found' });
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
