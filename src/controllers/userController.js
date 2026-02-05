const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

const getProfile = async (req, res) => {
    // req.user is populated by authenticateToken middleware
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: {
                role: true,
                userBadges: {
                    include: { badge: true }
                },
                // Include recent missions or stats if needed
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Remove sensitive data
        const { passwordHash, ...userProfile } = user;
        res.json(userProfile);
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const updateProfile = async (req, res) => {
    const { name, email } = req.body;
    const userId = req.user.id;

    try {
        // Check if email is being changed and if it's already taken
        if (email) {
            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser && existingUser.id !== userId) {
                return res.status(400).json({ error: 'Email already in use' });
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                name: name || undefined,
                email: email || undefined,
            },
            include: { role: true },
        });

        const { passwordHash, ...userProfile } = updatedUser;
        res.json(userProfile);
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const getAllUsers = async (req, res) => {
    const { search, roleId, status } = req.query;

    try {
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (roleId) {
            where.roleId = parseInt(roleId);
        }
        if (status) {
            where.isActive = status === 'active';
        }

        const users = await prisma.user.findMany({
            where,
            include: { role: true },
            orderBy: { createdAt: 'desc' }
        });

        const safeUsers = users.map(user => {
            const { passwordHash, ...safeUser } = user;
            return safeUser;
        });

        res.json(safeUsers);
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const updateUserRole = async (req, res) => {
    const { id } = req.params;
    const { roleId } = req.body;

    try {
        const updatedUser = await prisma.user.update({
            where: { id: parseInt(id) },
            data: { roleId: parseInt(roleId) },
            include: { role: true }
        });

        const { passwordHash, ...safeUser } = updatedUser;
        res.json(safeUser);
    } catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const updateUserStatus = async (req, res) => {
    const { id } = req.params;
    const { isActive } = req.body;

    try {
        const updatedUser = await prisma.user.update({
            where: { id: parseInt(id) },
            data: { isActive },
            include: { role: true }
        });

        const { passwordHash, ...safeUser } = updatedUser;
        res.json(safeUser);
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const resetUserPassword = async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body; // In a real app, you might generate this

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: parseInt(id) },
            data: { passwordHash: hashedPassword }
        });

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('Reset user password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const getLeaderboard = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { totalPoints: 'desc' },
            take: 10,
            include: { role: true },
            where: {
                role: {
                    name: 'Volunteer' // Generally leaderboard is for volunteers, simplify for now
                }
            }
        });

        const leaderboard = users.map(user => ({
            id: user.id,
            name: user.name,
            totalPoints: user.totalPoints,
            role: user.role.name,
            // formatted for safe public consumption
        }));

        res.json(leaderboard);
    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const getUserStats = async (req, res) => {
    const userId = req.user.id;

    try {
        // 1. Count completed actions
        const actionsCompleted = await prisma.registration.count({
            where: {
                userId,
                status: 'Completed'
            }
        });

        // 2. Get user's rank
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { totalPoints: true }
        });

        const totalVolunteers = await prisma.user.count({
            where: {
                role: { name: 'Volunteer' }
            }
        });

        // Rank is number of people with more points + 1
        const rank = await prisma.user.count({
            where: {
                totalPoints: { gt: user.totalPoints },
                role: { name: 'Volunteer' }
            }
        }) + 1;

        // 3. Get weekly activity (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const transactions = await prisma.pointTransaction.findMany({
            where: {
                userId,
                createdAt: { gte: sevenDaysAgo },
                amount: { gt: 0 }
            }
        });

        // Format daily points for the chart
        const weeklyActivity = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(sevenDaysAgo);
            date.setDate(date.getDate() + i);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'narrow' });

            const dayPoints = transactions
                .filter(t => new Date(t.createdAt).toDateString() === date.toDateString())
                .reduce((sum, t) => sum + t.amount, 0);

            weeklyActivity.push({
                day: dayName,
                value: dayPoints,
                isToday: date.toDateString() === new Date().toDateString()
            });
        }

        res.json({
            actionsCompleted,
            rank,
            totalVolunteers,
            weeklyActivity
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    getLeaderboard,
    getUserStats,
    getAllUsers,
    updateUserRole,
    updateUserStatus,
    resetUserPassword,
};
