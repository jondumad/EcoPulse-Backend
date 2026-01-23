const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

module.exports = {
    getProfile,
    updateProfile,
    getLeaderboard,
};
