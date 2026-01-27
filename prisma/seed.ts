import prisma from '../lib/prisma'

async function main() {
  console.log('🌱 Starting seed...')

  // Placeholder seed - will be expanded in Milestone 1
  const user = await prisma.user.upsert({
    where: { email: 'admin@gobii.com' },
    update: {},
    create: {
      email: 'admin@gobii.com',
      name: 'Admin User',
    },
  })

  console.log('✅ Seed completed:', { user })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
