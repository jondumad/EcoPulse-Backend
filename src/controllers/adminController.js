const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { Parser } = require('json2csv');

const getAggregatedStats = async (req, res) => {
    try {
        const totalUsers = await prisma.user.count();
        const totalMissions = await prisma.mission.count({ where: { status: 'Completed' } });

        // Sum of totalHours from Attendance where status is Verified
        const totalHoursResult = await prisma.attendance.aggregate({
            _sum: { totalHours: true },
            where: { status: 'Verified' }
        });

        // Growth data: New users per day for the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const userGrowth = await prisma.user.groupBy({
            by: ['createdAt'],
            _count: { id: true },
            where: { createdAt: { gte: thirtyDaysAgo } },
            orderBy: { createdAt: 'asc' }
        });

        res.json({
            summary: {
                totalUsers,
                totalMissions,
                totalHours: totalHoursResult._sum.totalHours || 0,
            },
            userGrowth
        });
    } catch (error) {
        console.error('Aggregated stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const getHeatmapData = async (req, res) => {
    try {
        const missions = await prisma.mission.findMany({
            select: {
                id: true,
                title: true,
                locationGps: true,
                status: true
            }
        });

        const heatmap = missions.map(m => {
            const [lat, lng] = m.locationGps.split(',').map(Number);
            return { id: m.id, title: m.title, lat, lng, status: m.status };
        });

        res.json(heatmap);
    } catch (error) {
        console.error('Heatmap data error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const exportAttendanceCSV = async (req, res) => {
    try {
        const attendance = await prisma.attendance.findMany({
            include: {
                user: { select: { name: true, email: true } },
                mission: { select: { title: true } }
            },
            where: { status: 'Verified' }
        });

        const data = attendance.map(a => ({
            UserName: a.user.name,
            UserEmail: a.user.email,
            Mission: a.mission.title,
            CheckIn: a.checkInTime,
            CheckOut: a.checkOutTime,
            Hours: a.totalHours
        }));

        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(data);

        res.header('Content-Type', 'text/csv');
        res.attachment('attendance_report.csv');
        res.send(csv);
    } catch (error) {
        console.error('CSV export error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const manualAttendance = async (req, res) => {
    const { userId, missionId, totalHours } = req.body;

    try {
        const attendance = await prisma.attendance.upsert({
            where: {
                userId_missionId: {
                    userId: parseInt(userId),
                    missionId: parseInt(missionId)
                }
            },
            update: {
                status: 'Verified',
                totalHours: parseFloat(totalHours),
                verifiedBy: req.user.id,
                verifiedAt: new Date()
            },
            create: {
                userId: parseInt(userId),
                missionId: parseInt(missionId),
                status: 'Verified',
                totalHours: parseFloat(totalHours),
                verifiedBy: req.user.id,
                verifiedAt: new Date()
            }
        });

        res.json(attendance);
    } catch (error) {
        console.error('Manual attendance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getAggregatedStats,
    getHeatmapData,
    exportAttendanceCSV,
    manualAttendance
};
