const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getAllBadges = async (req, res) => {
    try {
        const badges = await prisma.badge.findMany();
        res.json(badges);
    } catch (error) {
        console.error('Get all badges error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const createBadge = async (req, res) => {
    const { name, description, iconUrl, pointsRequired, category } = req.body;
    try {
        const badge = await prisma.badge.create({
            data: { name, description, iconUrl, pointsRequired: parseInt(pointsRequired), category }
        });
        res.status(201).json(badge);
    } catch (error) {
        console.error('Create badge error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const updateBadge = async (req, res) => {
    const { id } = req.params;
    const { name, description, iconUrl, pointsRequired, category } = req.body;
    try {
        const badge = await prisma.badge.update({
            where: { id: parseInt(id) },
            data: { name, description, iconUrl, pointsRequired: parseInt(pointsRequired), category }
        });
        res.json(badge);
    } catch (error) {
        console.error('Update badge error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const deleteBadge = async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.badge.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Badge deleted' });
    } catch (error) {
        console.error('Delete badge error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getAllBadges,
    createBadge,
    updateBadge,
    deleteBadge
};
