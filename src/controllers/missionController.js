const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create a new mission
const createMission = async (req, res) => {
    const {
        title, description, locationGps, locationName,
        startTime, endTime, pointsValue, maxVolunteers,
        priority, isEmergency, categoryIds,
        emergencyJustification, isTemplate, status
    } = req.body;

    // Assumes auth middleware populates req.user
    const creatorId = req.user.id;

    try {
        const userRole = req.user.role?.name;
        const initialStatus = status || ((userRole === 'SuperAdmin' || userRole === 'Coordinator') ? 'Open' : 'Pending');

        // 1. EMERGENCY VALIDATION
        const reallyEmergency = isEmergency || priority === 'Emergency';
        if (reallyEmergency) {
            if (!emergencyJustification || emergencyJustification.length < 20) {
                return res.status(400).json({
                    error: 'Emergency missions require a detailed justification (min 20 characters).'
                });
            }

            // 2. RATE LIMITING (Max 3 emergency missions per 24h)
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const emergencyCount = await prisma.mission.count({
                where: {
                    createdBy: creatorId,
                    isEmergency: true,
                    createdAt: { gte: twentyFourHoursAgo }
                }
            });

            if (emergencyCount >= 3) {
                return res.status(429).json({
                    error: 'Emergency Rate Limit: You can only create 3 emergency missions per 24 hours.'
                });
            }
        }

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
                priority: priority || (reallyEmergency ? 'Emergency' : 'Normal'),
                isEmergency: reallyEmergency,
                emergencyJustification,
                isTemplate: isTemplate || false,
                status: initialStatus,
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

        // Trigger notification if Emergency
        if (mission.isEmergency) {
            await triggerEmergencyNotification(mission);
        }

        res.status(201).json(mission);
    } catch (error) {
        console.error('Create mission error:', error);
        res.status(500).json({ error: 'Failed to create mission' });
    }
};

const triggerEmergencyNotification = async (mission) => {
    try {
        // Find all users and create notifications for them
        const users = await prisma.user.findMany({ select: { id: true } });
        const notifications = users.map(user => ({
            userId: user.id,
            title: `EMERGENCY MISSION: ${mission.title}`,
            message: `New high-priority mission at ${mission.locationName || 'unknown location'}. Join now!`,
            type: 'emergency_mission',
            relatedId: mission.id
        }));

        await prisma.notification.createMany({ data: notifications });
        console.log(`Dispatched ${notifications.length} emergency notifications.`);
    } catch (error) {
        console.error('Emergency notification dispatch error:', error);
    }
};

const approveMission = async (req, res) => {
    const { id } = req.params;
    try {
        const mission = await prisma.mission.update({
            where: { id: parseInt(id) },
            data: { status: 'Open' }
        });
        res.json(mission);
    } catch (error) {
        console.error('Approve mission error:', error);
        res.status(500).json({ error: 'Failed to approve mission' });
    }
};

// Helper for Distance Calculation (Haversine Formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
};

const deg2rad = (deg) => deg * (Math.PI / 180);

// List mission templates
const getTemplates = async (req, res) => {
    try {
        const templates = await prisma.mission.findMany({
            where: {
                isTemplate: true,
                createdBy: req.user.id // Only show own templates for now
            },
            orderBy: { title: 'asc' }
        });
        res.json(templates);
    } catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
};

// List all missions with filters
const getMissions = async (req, res) => {
    const { category, priority, status, search, sortBy, lat, lng } = req.query;

    const where = {};
    const userRole = req.user.role?.name || '';
    const isCoordinatorOrAdmin = userRole === 'SuperAdmin' || userRole === 'Coordinator';

    if (status) {
        where.status = status;
    } else {
        if (isCoordinatorOrAdmin) {
            // See all
        } else {
            where.status = { in: ['Open', 'InProgress'] };
        }
    }

    if (priority) where.priority = priority;

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

    if (req.query.mine === 'true') {
        where.createdBy = req.user.id;
    }

    try {
        let missions = await prisma.mission.findMany({
            where,
            include: {
                missionCategories: { include: { category: true } },
                creator: { select: { name: true, email: true } },
                _count: { select: { registrations: true } },
                registrations: {
                    where: { userId: req.user.id },
                    select: { status: true }
                }
            },
            // Default sort if NOT distance
            orderBy: sortBy !== 'distance' ? { startTime: 'asc' } : undefined
        });

        // Transform (no longer overriding currentVolunteers with raw count)
        let transformedMissions = missions;

        // Handle Distance Sorting
        if (sortBy === 'distance' && lat && lng) {
            const userLat = parseFloat(lat);
            const userLng = parseFloat(lng);

            transformedMissions = transformedMissions.map(m => {
                const [mLat, mLng] = (m.locationGps || '0,0').split(',').map(Number);
                const distance = calculateDistance(userLat, userLng, mLat, mLng);
                return { ...m, distance };
            });

            transformedMissions.sort((a, b) => (a.distance || 0) - (b.distance || 0));
        }

        res.json(transformedMissions);
    } catch (error) {
        console.error('Get missions error:', error);
        res.status(500).json({ error: 'Failed to fetch missions' });
    }
};

// Get single mission details
const getMissionById = async (req, res) => {
    const { id } = req.params;
    const missionId = parseInt(id);

    if (isNaN(missionId)) {
        return res.status(400).json({ error: 'Invalid mission ID' });
    }

    try {
        const mission = await prisma.mission.findUnique({
            where: { id: missionId },
            include: {
                missionCategories: {
                    include: { category: true }
                },
                creator: {
                    select: { id: true, name: true, email: true }
                },
                registrations: {
                    where: { userId: req.user.id },
                    select: { status: true }
                },
                _count: {
                    select: { registrations: true }
                }
            }
        });

        if (!mission) {
            return res.status(404).json({ error: 'Mission not found' });
        }

        // Transform the response (using db field directly)
        const transformedMission = mission;

        res.json(transformedMission);
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

    // Extract categoryIds if present
    const categoryIds = updateData.categoryIds;
    delete updateData.categoryIds;

    try {
        const existing = await prisma.mission.findUnique({
            where: { id: parseInt(id) },
            include: { collaborators: { select: { id: true } } }
        });
        if (!existing) return res.status(404).json({ error: 'Not found' });

        const userRole = req.user.role?.name || "";
        const isCollaborator = existing.collaborators.some(c => c.id === req.user.id);
        const isAuthorized = userRole === 'SuperAdmin' ||
            existing.createdBy === req.user.id ||
            isCollaborator;

        if (!isAuthorized) {
            return res.status(403).json({ error: 'Unauthorized to update this mission' });
        }

        // Prepare relational update for categories if provided
        if (categoryIds) {
            updateData.missionCategories = {
                deleteMany: {}, // Clear current categories
                create: categoryIds.map(catId => ({
                    categoryId: parseInt(catId)
                }))
            };
        }

        // Capture actual timing when status changes
        if (updateData.status === 'InProgress' && !existing.actualStartTime) {
            updateData.actualStartTime = new Date();
        }
        if ((updateData.status === 'Completed' || updateData.status === 'Cancelled') && !existing.actualEndTime) {
            updateData.actualEndTime = new Date();
        }

        const mission = await prisma.mission.update({
            where: { id: parseInt(id) },
            data: updateData,
            include: {
                missionCategories: { include: { category: true } }
            }
        });

        // Trigger notification if status changed to InProgress (Mission Starting)
        if (updateData.status === 'InProgress' && existing.status !== 'InProgress') {
            await notifyVolunteersMissionStarted(mission);
        }

        res.json(mission);
    } catch (error) {
        console.error('Update mission error:', error);
        res.status(500).json({ error: 'Failed to update mission' });
    }
};

const addCollaborator = async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body; // ID of the coordinator to invite

    try {
        const mission = await prisma.mission.findUnique({ where: { id: parseInt(id) } });
        if (!mission) return res.status(404).json({ error: 'Mission not found' });

        // Only Creator or SuperAdmin can invite
        if (mission.createdBy !== req.user.id && req.user.role?.name !== 'SuperAdmin') {
            return res.status(403).json({ error: 'Only the mission creator can invite collaborators' });
        }

        await prisma.mission.update({
            where: { id: parseInt(id) },
            data: {
                collaborators: {
                    connect: { id: parseInt(userId) }
                }
            }
        });

        // Notify the invited coordinator
        await prisma.notification.create({
            data: {
                userId: parseInt(userId),
                title: 'Mission Collaboration Invite',
                message: `You have been added as a collaborator to "${mission.title}"`,
                type: 'collaboration_invite',
                relatedId: mission.id
            }
        });

        res.json({ message: 'Collaborator added successfully' });
    } catch (error) {
        console.error('Add collaborator error:', error);
        res.status(500).json({ error: 'Failed to add collaborator' });
    }
};

const removeCollaborator = async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    try {
        const mission = await prisma.mission.findUnique({ where: { id: parseInt(id) } });
        if (!mission) return res.status(404).json({ error: 'Mission not found' });

        // Only Creator or SuperAdmin can remove
        if (mission.createdBy !== req.user.id && req.user.role?.name !== 'SuperAdmin') {
            return res.status(403).json({ error: 'Only the mission creator can remove collaborators' });
        }

        await prisma.mission.update({
            where: { id: parseInt(id) },
            data: {
                collaborators: {
                    disconnect: { id: parseInt(userId) }
                }
            }
        });

        res.json({ message: 'Collaborator removed successfully' });
    } catch (error) {
        console.error('Remove collaborator error:', error);
        res.status(500).json({ error: 'Failed to remove collaborator' });
    }
};

const getCollaborators = async (req, res) => {
    const { id } = req.params;
    try {
        const mission = await prisma.mission.findUnique({
            where: { id: parseInt(id) },
            include: {
                collaborators: {
                    select: { id: true, name: true, email: true, role: { select: { name: true } } }
                }
            }
        });
        if (!mission) return res.status(404).json({ error: 'Mission not found' });
        res.json(mission.collaborators);
    } catch (error) {
        console.error('Get collaborators error:', error);
        res.status(500).json({ error: 'Failed to fetch collaborators' });
    }
};

const notifyVolunteersMissionStarted = async (mission) => {
    try {
        // Get all registered volunteers
        const registrations = await prisma.registration.findMany({
            where: { missionId: mission.id, status: 'Registered' },
            select: { userId: true }
        });

        if (registrations.length === 0) return;

        const notifications = registrations.map(reg => ({
            userId: reg.userId,
            title: 'Mission Started!',
            message: `${mission.title} is now in progress. Remember to check in!`,
            type: 'mission_update',
            relatedId: mission.id
        }));

        await prisma.notification.createMany({ data: notifications });
        console.log(`Dispatched ${notifications.length} "started" notifications.`);
    } catch (error) {
        console.error('Mission start notification error:', error);
    }
};

// Delete mission (Soft delete usually, or set status to Cancelled)
const deleteMission = async (req, res) => {
    const { id } = req.params;
    try {
        // Logic: Instead of hard delete, set status to Cancelled
        const mission = await prisma.mission.update({
            where: { id: parseInt(id) },
            data: {
                status: 'Cancelled',
                actualEndTime: new Date()
            }
        });
        res.json({ message: 'Mission cancelled successfully', mission });
    } catch (error) {
        console.error('Delete mission error:', error);
        res.status(500).json({ error: 'Failed to cancel mission' });
    }
};

// Duplicate Mission
const duplicateMission = async (req, res) => {
    const { id } = req.params;
    try {
        const original = await prisma.mission.findUnique({
            where: { id: parseInt(id) },
            include: { missionCategories: true }
        });

        if (!original) return res.status(404).json({ error: 'Mission not found' });

        const newMission = await prisma.mission.create({
            data: {
                title: `${original.title} (Copy)`,
                description: original.description,
                locationGps: original.locationGps,
                locationName: original.locationName,
                startTime: original.startTime, // Keeping same time, coordinator can edit
                endTime: original.endTime,
                pointsValue: original.pointsValue,
                maxVolunteers: original.maxVolunteers,
                priority: original.priority,
                isEmergency: false, // Reset emergency
                status: 'Open', // Reset status
                createdBy: req.user.id,
                missionCategories: {
                    create: original.missionCategories.map(mc => ({
                        categoryId: mc.categoryId
                    }))
                }
            }
        });

        res.status(201).json(newMission);
    } catch (error) {
        console.error('Duplicate mission error:', error);
        res.status(500).json({ error: 'Failed to duplicate mission' });
    }
};

// Batch Actions
const batchAction = async (req, res) => {
    const { ids, action, justification } = req.body; // action: 'delete' | 'cancel' | 'emergency'

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Invalid IDs provided' });
    }

    try {
        let result;
        if (action === 'cancel' || action === 'delete') {
            // Soft delete / cancel
            result = await prisma.mission.updateMany({
                where: { id: { in: ids } },
                data: { status: 'Cancelled' }
            });
        } else if (action === 'emergency') {
            if (!justification || justification.length < 20) {
                return res.status(400).json({
                    error: 'Batch emergency actions require a justification (min 20 characters).'
                });
            }

            result = await prisma.mission.updateMany({
                where: { id: { in: ids } },
                data: {
                    isEmergency: true,
                    priority: 'Emergency',
                    emergencyJustification: justification
                }
            });
            // Trigger notifications for each?
            const missions = await prisma.mission.findMany({ where: { id: { in: ids } } });
            for (const m of missions) {
                await triggerEmergencyNotification(m);
            }
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }

        res.json({ message: `Batch ${action} successful`, count: result.count });
    } catch (error) {
        console.error('Batch action error:', error);
        res.status(500).json({ error: 'Batch action failed' });
    }
};

// Invite (Mock)
const inviteToMission = async (req, res) => {
    const { id } = req.params;
    // In a real app, logic to generate a unique link or send emails
    res.json({ message: 'Invite link generated', link: `https://ecopulse.app/missions/${id}/join` });
};

// Contact Volunteers
const contactVolunteers = async (req, res) => {
    const { id } = req.params;
    const { message } = req.body;

    if (!message) return res.status(400).json({ error: 'Message is required' });

    try {
        // Get all registered volunteers
        const methodRegistrations = await prisma.registration.findMany({
            where: { missionId: parseInt(id), status: 'Registered' },
            select: { userId: true }
        });

        if (methodRegistrations.length === 0) {
            return res.json({ message: 'No volunteers to contact' });
        }

        const notifications = methodRegistrations.map(reg => ({
            userId: reg.userId,
            title: 'Mission Update',
            message: message,
            type: 'mission_update',
            relatedId: parseInt(id)
        }));

        await prisma.notification.createMany({ data: notifications });

        res.json({ message: `Message sent to ${notifications.length} volunteers` });
    } catch (error) {
        console.error('Contact volunteers error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
};

// Contact Individual Volunteer
const contactVolunteer = async (req, res) => {
    const { id, userId } = req.params;
    const { message } = req.body;

    if (!message) return res.status(400).json({ error: 'Message is required' });

    try {
        await prisma.notification.create({
            data: {
                userId: parseInt(userId),
                title: 'Mission Message',
                message: message,
                type: 'mission_update',
                relatedId: parseInt(id)
            }
        });

        res.json({ message: 'Notification sent successfully' });
    } catch (error) {
        console.error('Contact volunteer error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
};

const getAllCategories = async (req, res) => {
    try {
        const categories = await prisma.category.findMany({
            where: { isActive: true }
        });
        res.json(categories);
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
};

module.exports = {
    createMission,
    getMissions,
    getMissionById,
    updateMission,
    deleteMission,
    approveMission,
    getAllCategories,
    duplicateMission,
    batchAction,
    inviteToMission,
    contactVolunteers,
    contactVolunteer,
    getTemplates,
    addCollaborator,
    removeCollaborator,
    getCollaborators
};
