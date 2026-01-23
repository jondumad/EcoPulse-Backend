const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Seed Roles
  console.log('Creating roles...');
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SuperAdmin' },
    update: {},
    create: { name: 'SuperAdmin' }
  });

  const coordinatorRole = await prisma.role.upsert({
    where: { name: 'Coordinator' },
    update: {},
    create: { name: 'Coordinator' }
  });

  const volunteerRole = await prisma.role.upsert({
    where: { name: 'Volunteer' },
    update: {},
    create: { name: 'Volunteer' }
  });

  // 2. Seed Categories
  console.log('Creating categories...');
  await prisma.category.upsert({
    where: { name: 'Environmental' },
    update: {},
    create: { 
      name: 'Environmental', 
      description: 'Environmental conservation and cleanup activities',
      icon: '🌱', 
      color: '#22c55e' 
    }
  });

  await prisma.category.upsert({
    where: { name: 'Social' },
    update: {},
    create: { 
      name: 'Social', 
      description: 'Community service and social welfare',
      icon: '🤝', 
      color: '#3b82f6' 
    }
  });

  await prisma.category.upsert({
    where: { name: 'Educational' },
    update: {},
    create: { 
      name: 'Educational', 
      description: 'Teaching and knowledge sharing',
      icon: '📚', 
      color: '#f59e0b' 
    }
  });

  await prisma.category.upsert({
    where: { name: 'Health' },
    update: {},
    create: { 
      name: 'Health', 
      description: 'Health and wellness initiatives',
      icon: '❤️', 
      color: '#ef4444' 
    }
  });

  // 3. Seed Badges
  console.log('Creating badges...');
  await prisma.badge.upsert({
    where: { name: 'Rookie' },
    update: {},
    create: { 
      name: 'Rookie', 
      description: 'Complete your first mission',
      pointsRequired: 0,
      category: 'Participation'
    }
  });

  await prisma.badge.upsert({
    where: { name: 'Community Hero' },
    update: {},
    create: { 
      name: 'Community Hero', 
      description: 'Earn 500 points',
      pointsRequired: 500,
      category: 'Participation'
    }
  });

  await prisma.badge.upsert({
    where: { name: 'Eco Warrior' },
    update: {},
    create: { 
      name: 'Eco Warrior', 
      description: 'Complete 10 environmental missions',
      pointsRequired: 0,
      category: 'Impact'
    }
  });

  // 4. Create Test Users
  console.log('Creating test users...');
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  await prisma.user.upsert({
    where: { email: 'admin@ecopulse.com' },
    update: {},
    create: {
      email: 'admin@ecopulse.com',
      passwordHash: hashedPassword,
      name: 'Admin User',
      roleId: superAdminRole.id
    }
  });

  await prisma.user.upsert({
    where: { email: 'coordinator@ecopulse.com' },
    update: {},
    create: {
      email: 'coordinator@ecopulse.com',
      passwordHash: hashedPassword,
      name: 'John Coordinator',
      roleId: coordinatorRole.id
    }
  });

  await prisma.user.upsert({
    where: { email: 'volunteer@ecopulse.com' },
    update: {},
    create: {
      email: 'volunteer@ecopulse.com',
      passwordHash: hashedPassword,
      name: 'Jane Volunteer',
      roleId: volunteerRole.id
    }
  });

  console.log('✅ Database seeded successfully!');
  console.log('\n📧 Test accounts created (password: password123):');
  console.log('   Admin: admin@ecopulse.com');
  console.log('   Coordinator: coordinator@ecopulse.com');
  console.log('   Volunteer: volunteer@ecopulse.com');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });