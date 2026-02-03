const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getUserNotifications = async (req, res) => {
    const userId = req.user.id;

    try {
        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(notifications);
    } catch (error) {
        console.error('Get user notifications error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const markAsRead = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const notification = await prisma.notification.findFirst({
            where: {
                id: parseInt(id),
                userId
            },
        });

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        const updated = await prisma.notification.update({
            where: { id: parseInt(id) },
            data: { isRead: true },
        });

        res.json(updated);
    } catch (error) {
        console.error('Mark notification as read error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const markAllAsRead = async (req, res) => {
    const userId = req.user.id;

    try {
        await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });

        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Mark all notifications as read error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getUserNotifications,
    markAsRead,
    markAllAsRead,
};
