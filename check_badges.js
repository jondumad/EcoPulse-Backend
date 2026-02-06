const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const count = await prisma.badge.count();
    console.log(`Current badges: ${count}`);
    if (count === 0) {
        console.log('No badges found, seeding default badges...');
        await prisma.badge.createMany({
            data: [
                { name: 'First Plant', description: 'Planted your first tree', pointsRequired: 100, category: 'Impact' },
                { name: 'Eco Warrior', description: 'Completed 10 missions', pointsRequired: 1000, category: 'Participation' },
                { name: 'Local Hero', description: 'Participated in 5 local events', pointsRequired: 500, category: 'Participation' },
                { name: 'Water Saver', description: 'Lead a river cleanup', pointsRequired: 1500, category: 'Impact' },
                { name: 'Recycle King', description: 'Sorted 50kg of waste', pointsRequired: 800, category: 'Impact' },
                { name: 'Team Leader', description: 'Lead a mission group', pointsRequired: 2000, category: 'Special' },
            ]
        });
        console.log('Seed complete.');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
