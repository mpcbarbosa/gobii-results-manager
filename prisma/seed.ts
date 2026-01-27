import prisma from '../lib/prisma'
import { UserRole, LeadStatus, InteractionChannel, InteractionOutcome, HandoffTeam, HandoffStatus } from '@prisma/client'
import crypto from 'crypto'

async function main() {
  console.log('🌱 Starting seed...')

  // Clean existing data (in development only)
  console.log('🧹 Cleaning existing data...')
  await prisma.handoff.deleteMany()
  await prisma.interaction.deleteMany()
  await prisma.leadStatusHistory.deleteMany()
  await prisma.leadAssignment.deleteMany()
  await prisma.scoringRun.deleteMany()
  await prisma.lead.deleteMany()
  await prisma.contact.deleteMany()
  await prisma.account.deleteMany()
  await prisma.source.deleteMany()
  await prisma.user.deleteMany()

  // Create Users
  console.log('👤 Creating users...')
  const admin = await prisma.user.create({
    data: {
      email: 'admin@gobii.com',
      name: 'Admin User',
      role: UserRole.ADMIN,
      isActive: true,
    },
  })

  const opsLead = await prisma.user.create({
    data: {
      email: 'ops.lead@gobii.com',
      name: 'Operations Lead',
      role: UserRole.OPERATIONS_LEAD,
      isActive: true,
    },
  })

  const operator1 = await prisma.user.create({
    data: {
      email: 'operator1@gobii.com',
      name: 'Operator One',
      role: UserRole.OPERATOR,
      isActive: true,
    },
  })

  const operator2 = await prisma.user.create({
    data: {
      email: 'operator2@gobii.com',
      name: 'Operator Two',
      role: UserRole.OPERATOR,
      isActive: true,
    },
  })

  // Create Sources
  console.log('🔌 Creating sources...')
  const linkedinScanner = await prisma.source.create({
    data: {
      name: 'LinkedIn Scanner',
      type: 'scanner',
      description: 'Scans LinkedIn for potential leads',
      isActive: true,
      config: {
        searchCriteria: ['CEO', 'CTO', 'Founder'],
        industries: ['Technology', 'SaaS'],
      },
    },
  })

  const emailScorer = await prisma.source.create({
    data: {
      name: 'Email Scorer',
      type: 'scorer',
      description: 'Scores leads based on email engagement',
      isActive: true,
      config: {
        scoringFactors: ['open_rate', 'click_rate', 'reply_rate'],
      },
    },
  })

  // Create Accounts
  console.log('🏢 Creating accounts...')
  const account1 = await prisma.account.create({
    data: {
      name: 'TechCorp Solutions',
      nameNormalized: 'techcorp solutions',
      domain: 'techcorp.com',
      website: 'https://techcorp.com',
      industry: 'Technology',
      size: '51-200',
      location: 'San Francisco, CA',
      country: 'USA',
      description: 'Leading provider of enterprise software solutions',
      linkedinUrl: 'https://linkedin.com/company/techcorp',
    },
  })

  const account2 = await prisma.account.create({
    data: {
      name: 'InnovateLabs',
      nameNormalized: 'innovatelabs',
      domain: 'innovatelabs.io',
      website: 'https://innovatelabs.io',
      industry: 'SaaS',
      size: '11-50',
      location: 'Austin, TX',
      country: 'USA',
      description: 'Innovative SaaS platform for modern businesses',
      linkedinUrl: 'https://linkedin.com/company/innovatelabs',
    },
  })

  // Create Contacts
  console.log('👥 Creating contacts...')
  const contact1 = await prisma.contact.create({
    data: {
      accountId: account1.id,
      firstName: 'John',
      lastName: 'Smith',
      fullName: 'John Smith',
      email: 'john.smith@techcorp.com',
      phone: '+1-555-0101',
      title: 'CEO',
      department: 'Executive',
      seniority: 'C-Level',
      linkedinUrl: 'https://linkedin.com/in/johnsmith',
      isPrimary: true,
    },
  })

  const contact2 = await prisma.contact.create({
    data: {
      accountId: account2.id,
      firstName: 'Sarah',
      lastName: 'Johnson',
      fullName: 'Sarah Johnson',
      email: 'sarah.johnson@innovatelabs.io',
      phone: '+1-555-0202',
      title: 'CTO',
      department: 'Engineering',
      seniority: 'C-Level',
      linkedinUrl: 'https://linkedin.com/in/sarahjohnson',
      isPrimary: true,
    },
  })

  // Create Leads with deduplication keys
  console.log('🎯 Creating leads...')
  const lead1DedupeKey = crypto
    .createHash('sha256')
    .update(`${account1.id}-${contact1.email}-${linkedinScanner.id}`)
    .digest('hex')

  const lead1 = await prisma.lead.create({
    data: {
      dedupeKey: lead1DedupeKey,
      sourceId: linkedinScanner.id,
      accountId: account1.id,
      title: 'CEO',
      seniority: 'C-Level',
      department: 'Executive',
      score: 85.5,
      scoreDetails: {
        engagement: 90,
        fit: 85,
        intent: 80,
      },
      status: LeadStatus.QUALIFIED,
      priority: 10,
      tags: ['high-value', 'enterprise'],
      rawData: {
        source: 'LinkedIn',
        profile_url: 'https://linkedin.com/in/johnsmith',
      },
    },
  })

  const lead2DedupeKey = crypto
    .createHash('sha256')
    .update(`${account2.id}-${contact2.email}-${linkedinScanner.id}`)
    .digest('hex')

  const lead2 = await prisma.lead.create({
    data: {
      dedupeKey: lead2DedupeKey,
      sourceId: linkedinScanner.id,
      accountId: account2.id,
      title: 'CTO',
      seniority: 'C-Level',
      department: 'Engineering',
      score: 72.0,
      scoreDetails: {
        engagement: 70,
        fit: 75,
        intent: 71,
      },
      status: LeadStatus.REVIEWING,
      priority: 7,
      tags: ['tech-focused', 'saas'],
      rawData: {
        source: 'LinkedIn',
        profile_url: 'https://linkedin.com/in/sarahjohnson',
      },
    },
  })

  // Create Scoring Runs
  console.log('📊 Creating scoring runs...')
  await prisma.scoringRun.create({
    data: {
      sourceId: emailScorer.id,
      leadId: lead1.id,
      score: 85.5,
      scoreData: {
        factors: {
          engagement: 90,
          fit: 85,
          intent: 80,
        },
        algorithm: 'v1.0',
      },
      version: 'v1.0',
    },
  })

  // Create Lead Assignments
  console.log('📋 Creating lead assignments...')
  await prisma.leadAssignment.create({
    data: {
      leadId: lead1.id,
      userId: operator1.id,
      reason: 'High priority lead assignment',
      notes: 'Focus on enterprise value proposition',
    },
  })

  await prisma.leadAssignment.create({
    data: {
      leadId: lead2.id,
      userId: operator2.id,
      reason: 'Technical lead assignment',
      notes: 'Emphasize technical capabilities',
    },
  })

  // Create Lead Status History
  console.log('📜 Creating status history...')
  await prisma.leadStatusHistory.create({
    data: {
      leadId: lead1.id,
      fromStatus: null,
      toStatus: LeadStatus.NEW,
      reason: 'Initial lead creation',
      changedById: admin.id,
    },
  })

  await prisma.leadStatusHistory.create({
    data: {
      leadId: lead1.id,
      fromStatus: LeadStatus.NEW,
      toStatus: LeadStatus.QUALIFIED,
      reason: 'Meets qualification criteria',
      notes: 'High score and good fit',
      changedById: operator1.id,
    },
  })

  // Create Interactions
  console.log('💬 Creating interactions...')
  await prisma.interaction.create({
    data: {
      leadId: lead1.id,
      contactId: contact1.id,
      userId: operator1.id,
      channel: InteractionChannel.EMAIL,
      outcome: InteractionOutcome.INFO_SENT,
      subject: 'Introduction to Gobii Solutions',
      notes: 'Sent initial introduction email with case studies',
      completedAt: new Date(),
    },
  })

  await prisma.interaction.create({
    data: {
      leadId: lead1.id,
      contactId: contact1.id,
      userId: operator1.id,
      channel: InteractionChannel.PHONE,
      outcome: InteractionOutcome.MEETING_BOOKED,
      subject: 'Follow-up call',
      notes: 'Discussed pain points, scheduled demo for next week',
      duration: 25,
      completedAt: new Date(),
    },
  })

  // Create Handoff
  console.log('🤝 Creating handoff...')
  await prisma.handoff.create({
    data: {
      leadId: lead1.id,
      toTeam: HandoffTeam.SALES,
      status: HandoffStatus.PENDING,
      reason: 'Lead is qualified and ready for sales engagement',
      notes: 'Demo scheduled for next week, high interest level',
      priority: 10,
      createdById: operator1.id,
      metadata: {
        qualification_score: 85.5,
        engagement_level: 'high',
        budget_confirmed: true,
      },
    },
  })

  console.log('✅ Seed completed successfully!')
  console.log({
    users: 4,
    sources: 2,
    accounts: 2,
    contacts: 2,
    leads: 2,
    scoringRuns: 1,
    assignments: 2,
    statusHistory: 2,
    interactions: 2,
    handoffs: 1,
  })
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
