const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const registerForMission = async (req, res) => {
    const { id } = req.params; // missionId
    const userId = req.user.id;

    try {
        const missionId = parseInt(id);

        const result = await prisma.$transaction(async (tx) => {
            // Check if mission exists and is open
            const mission = await tx.mission.findUnique({
                where: { id: missionId },
                include: {
                    _count: { select: { registrations: true } }
                }
            });

            if (!mission) throw new Error('Mission not found');

            const allowedStatuses = ['Open', 'InProgress'];
            if (!allowedStatuses.includes(mission.status)) {
                throw new Error(`Mission is not open for registration (Status: ${mission.status})`);
            }

            // Check capacity
            let registrationStatus = 'Registered';
            let shouldIncrementCount = true;

            if (mission.maxVolunteers && mission.currentVolunteers >= mission.maxVolunteers) {
                // Mission is full - add to waitlist instead
                registrationStatus = 'Waitlisted';
                shouldIncrementCount = false;
            }

            // Check existing registration
            const existing = await tx.registration.findUnique({
                where: {
                    userId_missionId: {
                        userId: userId,
                        missionId: missionId
                    }
                }
            });

            if (existing) {
                if (existing.status === 'Cancelled') {
                    // Re-register or re-join waitlist
                    const updated = await tx.registration.update({
                        where: { id: existing.id },
                        data: { status: registrationStatus }
                    });

                    // Update currentVolunteers count only if not waitlisted
                    if (shouldIncrementCount) {
                        await tx.mission.update({
                            where: { id: missionId },
                            data: { currentVolunteers: { increment: 1 } }
                        });
                    }

                    return updated;
                }
                throw new Error('Already registered or waitlisted');
            }

            // Create registration
            const registration = await tx.registration.create({
                data: {
                    userId,
                    missionId,
                    status: registrationStatus
                }
            });

            // Update volunteer count only if registered (not waitlisted)
            if (shouldIncrementCount) {
                await tx.mission.update({
                    where: { id: missionId },
                    data: { currentVolunteers: { increment: 1 } }
                });
            }

            return registration;
        });

        res.status(201).json(result);
    } catch (error) {
        console.error('Registration error:', error);
        const status = error.message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: error.message });
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

        // Trigger waitlist processing if mission has auto-promote enabled
        const mission = await prisma.mission.findUnique({
            where: { id: missionId },
            select: { autoPromote: true, maxVolunteers: true, currentVolunteers: true }
        });

        if (mission && mission.autoPromote) {
            await processWaitlist(missionId);
        }
    } catch (error) {
        console.error('Cancel registration error:', error);
        res.status(500).json({ error: 'Cancellation failed' });
    }
};

// Helper: Process waitlist and auto-promote users
const processWaitlist = async (missionId) => {
    try {
        const mission = await prisma.mission.findUnique({
            where: { id: missionId },
            include: {
                registrations: {
                    where: { status: 'Waitlisted' },
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                attendance: {
                                    select: { status: true }
                                }
                            }
                        }
                    },
                    orderBy: { createdAt: 'asc' }
                }
            }
        });

        if (!mission || !mission.maxVolunteers) return;

        const availableSlots = mission.maxVolunteers - mission.currentVolunteers;
        if (availableSlots <= 0) return;

        const waitlisted = mission.registrations;
        if (waitlisted.length === 0) return;

        // Calculate reliability score for each user
        const scoredUsers = waitlisted.map(reg => {
            const totalAttendance = reg.user.attendance.length;
            const verifiedAttendance = reg.user.attendance.filter(
                a => a.status === 'Verified'
            ).length;
            const reliabilityScore = totalAttendance > 0
                ? verifiedAttendance / totalAttendance
                : 0.5; // Default for new users

            return {
                registration: reg,
                reliabilityScore,
                isPriority: reg.isPriority,
                waitTime: new Date() - new Date(reg.createdAt)
            };
        });

        // Sort by: Priority > Reliability > Wait Time
        scoredUsers.sort((a, b) => {
            if (a.isPriority !== b.isPriority) return b.isPriority - a.isPriority;
            if (Math.abs(a.reliabilityScore - b.reliabilityScore) > 0.01) {
                return b.reliabilityScore - a.reliabilityScore;
            }
            return b.waitTime - a.waitTime;
        });

        // Promote top candidates
        const toPromote = scoredUsers.slice(0, availableSlots);

        for (const candidate of toPromote) {
            await prisma.registration.update({
                where: { id: candidate.registration.id },
                data: { status: 'Registered' }
            });

            await prisma.mission.update({
                where: { id: missionId },
                data: { currentVolunteers: { increment: 1 } }
            });

            // Notify user
            await prisma.notification.create({
                data: {
                    userId: candidate.registration.userId,
                    title: 'Promoted from Waitlist!',
                    message: `You've been promoted to ${mission.title}. Check in on time!`,
                    type: 'waitlist_promotion',
                    relatedId: missionId
                }
            });
        }

        console.log(`Promoted ${toPromote.length} users from waitlist for mission ${missionId}`);
    } catch (error) {
        console.error('Process waitlist error:', error);
    }
};

const getMissionRegistrations = async (req, res) => {
    const { id } = req.params;
    try {
        const registrations = await prisma.registration.findMany({
            where: {
                missionId: parseInt(id),
                status: { not: 'Cancelled' }
            },
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

// Coordinator: Manually promote a user from waitlist
const promoteUser = async (req, res) => {
    const { registrationId } = req.params;

    try {
        const result = await prisma.$transaction(async (tx) => {
            const registration = await tx.registration.findUnique({
                where: { id: parseInt(registrationId) },
                include: { mission: true }
            });

            if (!registration) {
                throw new Error('Registration not found');
            }

            if (registration.status !== 'Waitlisted') {
                throw new Error('User is not on waitlist');
            }

            const mission = registration.mission;
            if (mission.maxVolunteers && mission.currentVolunteers >= mission.maxVolunteers) {
                throw new Error('Mission is full. Cannot promote.');
            }

            // Promote user
            await tx.registration.update({
                where: { id: parseInt(registrationId) },
                data: { status: 'Registered' }
            });

            await tx.mission.update({
                where: { id: registration.missionId },
                data: { currentVolunteers: { increment: 1 } }
            });

            // Notify user
            await tx.notification.create({
                data: {
                    userId: registration.userId,
                    title: 'Promoted from Waitlist!',
                    message: `You've been manually promoted to ${mission.title}.`,
                    type: 'waitlist_promotion',
                    relatedId: registration.missionId
                }
            });

            return { message: 'User promoted successfully' };
        });

        res.json(result);
    } catch (error) {
        console.error('Promote user error:', error);
        const status = error.message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: error.message });
    }
};

// Coordinator: Set priority flag on waitlisted user
const setPriority = async (req, res) => {
    const { registrationId } = req.params;
    const { isPriority } = req.body;

    try {
        const registration = await prisma.registration.findUnique({
            where: { id: parseInt(registrationId) }
        });

        if (!registration) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        if (registration.status !== 'Waitlisted') {
            return res.status(400).json({ error: 'Can only set priority for waitlisted users' });
        }

        const updated = await prisma.registration.update({
            where: { id: parseInt(registrationId) },
            data: { isPriority: isPriority === true }
        });

        res.json(updated);
    } catch (error) {
        console.error('Set priority error:', error);
        res.status(500).json({ error: 'Failed to set priority' });
    }
};

module.exports = {
    registerForMission,
    cancelRegistration,
    getMissionRegistrations,
    promoteUser,
    setPriority
};
