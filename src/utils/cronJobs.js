const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const initCronJobs = () => {
    console.log('Initializing Cron Jobs...');

    // Run every 15 minutes
    // Auto-Open Pending missions when start time is reached
    // Auto-Expire Open missions when end time is passed
    cron.schedule('*/15 * * * *', async () => {
        const now = new Date();
        console.log(`[Cron] Running mission maintenance at ${now.toISOString()}`);

        try {
            // 1. Auto-Open Pending Missions
            const { count: openedCount } = await prisma.mission.updateMany({
                where: {
                    status: 'Pending',
                    startTime: { lte: now }
                },
                data: { status: 'Open' }
            });

            if (openedCount > 0) {
                console.log(`[Cron] Opened ${openedCount} pending missions.`);
            }

            // 2. Auto-Expire Ended Missions
            // Mark as 'Completed' if they are still 'Open' and endTime < now
            const { count: expiredCount } = await prisma.mission.updateMany({
                where: {
                    status: 'Open',
                    endTime: { lt: now }
                },
                data: { status: 'Completed' }
            });

            if (expiredCount > 0) {
                console.log(`[Cron] Completed ${expiredCount} expired missions.`);
            }

        } catch (error) {
            console.error('[Cron] Error running mission maintenance:', error);
        }
    });
};

module.exports = { initCronJobs };
