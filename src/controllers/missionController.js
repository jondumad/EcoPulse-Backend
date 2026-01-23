const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create a new mission
const createMission = async (req, res) => {
    const {
        title, description, locationGps, locationName,
        startTime, endTime, pointsValue, maxVolunteers,
        priority, isEmergency, categoryIds
    } = req.body;

    // Assumes auth middleware populates req.user
    const creatorId = req.user.id;

    try {
        const mission = await prisma.mission.create({
            data: {
                title,
                description,
                locationGps: locationGps || '0,0',
                locationName,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                pointsValue: parseInt(pointsValue),
                maxVolunteers: maxVolunteers ? parseInt(maxVolunteers) : null,
                priority: priority || 'Normal',
                isEmergency: isEmergency || false,
                createdBy: creatorId,
                missionCategories: {
                    create: (categoryIds || []).map(id => ({ categoryId: id }))
                }
            },
            include: {
                missionCategories: {
                    include: { category: true }
                }
            }
        });
        res.status(201).json(mission);
    } catch (error) {
        console.error('Create mission error:', error);
        res.status(500).json({ error: 'Failed to create mission' });
    }
};

// List all missions with filters
const getMissions = async (req, res) => {
    const { category, priority, status, search } = req.query;

    const where = {};

    // Status filter (default to Open/InProgress if not specified, or all if requested)
    if (status) {
        where.status = status;
    } else {
        where.status = { not: 'Cancelled' };
    }

    if (priority) {
        where.priority = priority;
    }

    if (search) {
        where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { locationName: { contains: search, mode: 'insensitive' } }
        ];
    }

    if (category) {
        where.missionCategories = {
            some: {
                category: {
                    name: { equals: category, mode: 'insensitive' }
                }
            }
        };
    }

    try {
        const missions = await prisma.mission.findMany({
            where,
            include: {
                missionCategories: {
                    include: { category: true }
                },
                creator: {
                    select: { name: true, email: true } // Only public info
                },
                _count: {
                    select: { registrations: true }
                }
            },
            orderBy: { startTime: 'asc' }
        });
        res.json(missions);
    } catch (error) {
        console.error('Get missions error:', error);
        res.status(500).json({ error: 'Failed to fetch missions' });
    }
};

// Get single mission details
const getMissionById = async (req, res) => {
    const { id } = req.params;
    try {
        const mission = await prisma.mission.findUnique({
            where: { id: parseInt(id) },
            include: {
                missionCategories: {
                    include: { category: true }
                },
                creator: {
                    select: { id: true, name: true, email: true }
                },
                registrations: {
                    // Check if current user is registered (if auth'd)
                    // This simple check might be better done by a separate query or FE check
                    select: { userId: true, status: true }
                },
                _count: {
                    select: { registrations: true }
                }
            }
        });

        if (!mission) {
            return res.status(404).json({ error: 'Mission not found' });
        }
        res.json(mission);
    } catch (error) {
        console.error('Get mission error:', error);
        res.status(500).json({ error: 'Detail fetch failed' });
    }
};

// Update mission
const updateMission = async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    // Remove immutable fields or sensitive ones if necessary
    delete updateData.id;
    delete updateData.createdBy;
    delete updateData.createdAt;

    // Handle nested dates conversion
    if (updateData.startTime) updateData.startTime = new Date(updateData.startTime);
    if (updateData.endTime) updateData.endTime = new Date(updateData.endTime);

    try {
        // Should add check to ensure only creator or Admin can update
        // Skipped for brevity but assumed checked in middleware or basic check here:
        const existing = await prisma.mission.findUnique({ where: { id: parseInt(id) } });
        if (!existing) return res.status(404).json({ error: 'Not found' });

        if (req.user.role.name !== 'SuperAdmin' &&
            req.user.role.name !== 'Coordinator' &&
            existing.createdBy !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized to update this mission' });
        }

        const mission = await prisma.mission.update({
            where: { id: parseInt(id) },
            data: updateData,
            include: {
                missionCategories: { include: { category: true } }
            }
        });
        res.json(mission);
    } catch (error) {
        console.error('Update mission error:', error);
        res.status(500).json({ error: 'Failed to update mission' });
    }
};

// Delete mission (Soft delete usually, or set status to Cancelled)
const deleteMission = async (req, res) => {
    const { id } = req.params;
    try {
        // Logic: Instead of hard delete, set status to Cancelled
        const mission = await prisma.mission.update({
            where: { id: parseInt(id) },
            data: { status: 'Cancelled' }
        });
        res.json({ message: 'Mission cancelled successfully', mission });
    } catch (error) {
        console.error('Delete mission error:', error);
        res.status(500).json({ error: 'Failed to cancel mission' });
    }
};

module.exports = {
    createMission,
    getMissions,
    getMissionById,
    updateMission,
    deleteMission
};
