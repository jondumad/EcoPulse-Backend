const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const registerForMission = async (req, res) => {
    const { id } = req.params; // missionId
    const userId = req.user.id;

    try {
        const missionId = parseInt(id);

        // Check if mission exists and is open
        const mission = await prisma.mission.findUnique({
            where: { id: missionId },
            include: {
                _count: { select: { registrations: true } }
            }
        });

        if (!mission) return res.status(404).json({ error: 'Mission not found' });

        const allowedStatuses = ['Open', 'InProgress'];
        if (!allowedStatuses.includes(mission.status)) {
            return res.status(400).json({ error: `Mission is not open for registration (Status: ${mission.status})` });
        }

        // Check capacity
        if (mission.maxVolunteers && mission.currentVolunteers >= mission.maxVolunteers) {
            return res.status(400).json({ error: 'Mission is full' });
        }

        // Check existing registration
        const existing = await prisma.registration.findUnique({
            where: {
                userId_missionId: {
                    userId: userId,
                    missionId: missionId
                }
            }
        });

        if (existing) {
            if (existing.status === 'Cancelled') {
                // Re-register
                const updated = await prisma.registration.update({
                    where: { id: existing.id },
                    data: { status: 'Registered' }
                });
                // Update currentVolunteers count on mission
                await prisma.mission.update({
                    where: { id: missionId },
                    data: { currentVolunteers: { increment: 1 } }
                });
                return res.json(updated);
            }
            return res.status(400).json({ error: 'Already registered' });
        }

        // Create registration
        const registration = await prisma.registration.create({
            data: {
                userId,
                missionId,
                status: 'Registered'
            }
        });

        // Update volunteer count
        await prisma.mission.update({
            where: { id: missionId },
            data: { currentVolunteers: { increment: 1 } }
        });

        res.status(201).json(registration);
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
};

const cancelRegistration = async (req, res) => {
    const { id } = req.params; // missionId
    const userId = req.user.id;

    try {
        const missionId = parseInt(id);
        const registration = await prisma.registration.findUnique({
            where: {
                userId_missionId: {
                    userId,
                    missionId
                }
            }
        });

        if (!registration || registration.status === 'Cancelled') {
            return res.status(400).json({ error: 'Not registered for this mission' });
        }

        const updated = await prisma.registration.update({
            where: { id: registration.id },
            data: { status: 'Cancelled' }
        });

        // Decrement volunteer count
        await prisma.mission.update({
            where: { id: missionId },
            data: { currentVolunteers: { decrement: 1 } }
        });

        res.json({ message: 'Registration cancelled', registration: updated });
    } catch (error) {
        console.error('Cancel registration error:', error);
        res.status(500).json({ error: 'Cancellation failed' });
    }
};

const getMissionRegistrations = async (req, res) => {
    const { id } = req.params;
    try {
        const registrations = await prisma.registration.findMany({
            where: { missionId: parseInt(id), status: 'Registered' },
            include: {
                user: {
                    select: { id: true, name: true, email: true, totalPoints: true }
                }
            }
        });
        res.json(registrations);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch registrations' });
    }
};

module.exports = {
    registerForMission,
    cancelRegistration,
    getMissionRegistrations
};
