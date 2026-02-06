const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const badges = await prisma.badge.findMany();
    console.log(JSON.stringify(badges, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
