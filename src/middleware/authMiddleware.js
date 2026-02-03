const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            include: { role: true },
        });

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        if (!user.isActive) {
            return res.status(403).json({ error: 'Account suspended' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

const checkRole = (allowedRoles) => {
    const roleMap = {
        'SuperAdmin': 1,
        'Coordinator': 2,
        'Volunteer': 3
    };

    return (req, res, next) => {
        if (!req.user) {
            return res.status(403).json({ error: 'Access denied: User not found' });
        }

        const userRoleName = req.user.role?.name;
        const userRoleId = req.user.roleId;

        const hasRole = allowedRoles.some(roleName =>
            userRoleName === roleName || userRoleId === roleMap[roleName]
        );



        if (!hasRole) {
            return res.status(403).json({
                error: 'Access denied: Insufficient permissions',
                debug: { userRoleName, userRoleId, required: allowedRoles }
            });
        }

        next();
    };
};

module.exports = { authenticateToken, checkRole };
