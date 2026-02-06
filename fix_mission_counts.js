const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixCounts() {
    console.log('Checking mission volunteer counts...');
    const missions = await prisma.mission.findMany({
        include: {
            registrations: {
                where: { status: { not: 'Cancelled' } }
            }
        }
    });

    for (const mission of missions) {
        const actualCount = mission.registrations.length;
        if (mission.currentVolunteers !== actualCount) {
            console.log(`Mission ID ${mission.id} ("${mission.title}"): DB count ${mission.currentVolunteers} vs Actual count ${actualCount}. Fixing...`);
            await prisma.mission.update({
                where: { id: mission.id },
                data: { currentVolunteers: actualCount }
            });
        }
    }
    console.log('Cleanup complete.');
}

fixCounts()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
