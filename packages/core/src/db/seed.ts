import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';

async function seed() {
  console.log('🌱 Starting database seed...\n');

  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    // Create or fetch demo user
    console.log('Creating demo user...');
    const passwordHash = await bcrypt.hash('demo1234', 12);

    let activeUser = await db.query.users.findFirst({
      where: eq(schema.users.email, 'demo@1person.ai'),
    });

    if (!activeUser) {
      const [newUser] = await db
        .insert(schema.users)
        .values({
          email: 'demo@1person.ai',
          passwordHash,
          name: 'Demo User',
          onboardingCompleted: true,
          preferences: {
            theme: 'system',
            notifications: true,
          },
        })
        .returning();
      activeUser = newUser;
      console.log(`✓ Created user: ${activeUser.email}`);
    } else {
      console.log(`✓ User exists: ${activeUser.email}`);
    }

    // Create or fetch demo company
    console.log('\nCreating demo company...');
    let activeCompany = await db.query.companies.findFirst({
      where: eq(schema.companies.slug, 'ai-marketing-agency'),
    });

    if (!activeCompany) {
      const [newCompany] = await db
        .insert(schema.companies)
        .values({
          name: 'AI Marketing Agency',
          slug: 'ai-marketing-agency',
          ownerId: activeUser.id,
          industry: 'marketing',
          status: 'active',
          description: 'A fully AI-powered marketing agency',
          settings: {
            monthlyBudget: 10000,
            currency: 'USD',
            timezone: 'America/New_York',
          },
        })
        .returning();
      activeCompany = newCompany;
      console.log(`✓ Created company: ${activeCompany.name}`);
    } else {
      console.log(`✓ Company exists: ${activeCompany.name}`);
    }

    // Check if agents already exist
    const existingAgents = await db.query.agents.findMany({
      where: eq(schema.agents.companyId, activeCompany.id),
    });

    let agents = existingAgents;

    if (existingAgents.length === 0) {
      // Create agents
      console.log('\nCreating AI agents...');
      const agentsData = [
        {
          companyId: activeCompany.id,
          name: 'CEO Agent',
          role: 'ceo',
          status: 'running' as const,
          avatar: '👔',
          color: '#8b5cf6',
          description: 'Strategic planning and team coordination',
          capabilities: ['strategic_planning', 'budget_management', 'team_coordination', 'decision_making'],
          personality: { traits: ['analytical', 'decisive', 'strategic'] },
          budgetLimit: 1000,
          budgetUsed: 450,
        },
        {
          companyId: activeCompany.id,
          name: 'Marketing Manager',
          role: 'marketing_manager',
          status: 'running' as const,
          avatar: '📈',
          color: '#3b82f6',
          description: 'Marketing strategy and campaign management',
          capabilities: ['campaign_management', 'market_research', 'brand_strategy', 'growth_hacking'],
          personality: { traits: ['creative', 'data-driven', 'collaborative'] },
          budgetLimit: 500,
          budgetUsed: 320,
        },
        {
          companyId: activeCompany.id,
          name: 'Content Creator',
          role: 'content_creator',
          status: 'running' as const,
          avatar: '✍️',
          color: '#10b981',
          description: 'Creating engaging content for all channels',
          capabilities: ['blog_writing', 'social_media', 'copywriting', 'seo_optimization'],
          personality: { traits: ['creative', 'detail-oriented', 'adaptable'] },
          budgetLimit: 300,
          budgetUsed: 180,
        },
        {
          companyId: activeCompany.id,
          name: 'Ads Specialist',
          role: 'ads_specialist',
          status: 'paused' as const,
          avatar: '🎯',
          color: '#f59e0b',
          description: 'Paid advertising and performance optimization',
          capabilities: ['google_ads', 'facebook_ads', 'ab_testing', 'conversion_optimization'],
          personality: { traits: ['analytical', 'detail-oriented', 'results-focused'] },
          budgetLimit: 1000,
          budgetUsed: 800,
        },
      ];

      agents = await db.insert(schema.agents).values(agentsData).returning();
      console.log(`✓ Created ${agents.length} agents`);
    } else {
      console.log(`\n✓ Agents exist: ${existingAgents.length} agents`);
    }

    // Check if tasks already exist
    const existingTasks = await db.query.tasks.findMany({
      where: eq(schema.tasks.companyId, activeCompany.id),
    });

    if (existingTasks.length === 0 && agents.length >= 4) {
      // Create sample tasks
      console.log('\nCreating sample tasks...');
      const tasksData = [
        {
          companyId: activeCompany.id,
          assignedAgentId: agents[1].id, // Marketing Manager
          title: 'Create Q1 Marketing Campaign',
          description: 'Develop comprehensive marketing campaign for Q1 targeting millennials',
          type: 'project',
          status: 'in_progress' as const,
          priority: 'high' as const,
        },
        {
          companyId: activeCompany.id,
          assignedAgentId: agents[2].id, // Content Creator
          title: 'Write 5 Blog Posts',
          description: 'Create engaging blog content about AI in business',
          type: 'content',
          status: 'in_progress' as const,
          priority: 'medium' as const,
        },
        {
          companyId: activeCompany.id,
          assignedAgentId: agents[0].id, // CEO
          title: 'Approve Marketing Budget',
          description: 'Review and approve the marketing budget allocation for Q1',
          type: 'approval',
          status: 'completed' as const,
          priority: 'critical' as const,
          completedAt: new Date(),
        },
        {
          companyId: activeCompany.id,
          assignedAgentId: agents[3].id, // Ads Specialist
          title: 'Launch Facebook Ad Campaign',
          description: 'Set up and launch targeted Facebook ads for new product',
          type: 'campaign',
          status: 'pending' as const,
          priority: 'high' as const,
        },
        {
          companyId: activeCompany.id,
          assignedAgentId: agents[1].id, // Marketing Manager
          title: 'Competitor Analysis Report',
          description: 'Analyze top 5 competitors and create detailed report',
          type: 'research',
          status: 'completed' as const,
          priority: 'medium' as const,
          completedAt: new Date(Date.now() - 86400000),
        },
      ];

      const tasks = await db.insert(schema.tasks).values(tasksData).returning();
      console.log(`✓ Created ${tasks.length} tasks`);

      // Create audit log entries for tasks
      console.log('\nCreating audit log entries...');
      const auditEntries = [
        {
          companyId: activeCompany.id,
          actorType: 'user',
          actorId: activeUser.id,
          actorName: activeUser.name,
          action: 'company.created',
          resourceType: 'company',
          resourceId: activeCompany.id,
          metadata: { companyName: activeCompany.name },
        },
        {
          companyId: activeCompany.id,
          actorType: 'user',
          actorId: activeUser.id,
          actorName: activeUser.name,
          action: 'agent.created',
          resourceType: 'agent',
          resourceId: agents[0].id,
          metadata: { agentName: agents[0].name },
        },
        {
          companyId: activeCompany.id,
          actorType: 'agent',
          actorId: agents[0].id,
          actorName: agents[0].name,
          action: 'task.completed',
          resourceType: 'task',
          resourceId: tasks[2].id,
          metadata: { taskTitle: tasks[2].title },
        },
      ];

      await db.insert(schema.auditLogs).values(auditEntries);
      console.log('✓ Created audit log entries');
    } else {
      console.log(`\n✓ Tasks exist: ${existingTasks.length} tasks`);
    }

    // Create agent evaluations if not exist
    const existingEvaluations = await db.query.evaluations.findMany({
      where: eq(schema.evaluations.companyId, activeCompany.id),
    });

    if (existingEvaluations.length === 0 && agents.length > 0) {
      console.log('\nCreating agent evaluations...');
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 86400000);

      for (const agent of agents) {
        await db.insert(schema.evaluations).values({
          agentId: agent.id,
          companyId: activeCompany.id,
          periodType: 'daily',
          periodStart: dayAgo,
          periodEnd: now,
          overallScore: String(Math.floor(Math.random() * 20) + 80),
          tasksCompleted: Math.floor(Math.random() * 20) + 5,
          tasksFailed: Math.floor(Math.random() * 3),
          recommendations: ['Continue current performance', 'Consider expanding capabilities'],
        });
      }
      console.log('✓ Created evaluations for all agents');
    } else {
      console.log(`\n✓ Evaluations exist: ${existingEvaluations.length} evaluations`);
    }

    console.log('\n========================================');
    console.log('✅ Seed completed successfully!');
    console.log('========================================');
    console.log('\n📝 Demo Account:');
    console.log('   Email: demo@1person.ai');
    console.log('   Password: demo1234');
    console.log(`\n🏢 Company: ${activeCompany.name}`);
    console.log(`   ID: ${activeCompany.id}`);
    console.log(`   Agents: ${agents.length}`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
