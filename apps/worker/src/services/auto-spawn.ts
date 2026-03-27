import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, gte, sql, inArray } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { callLLM, type LLMMessage } from '../lib/llm';
import { agentLogger } from '../lib/logger';
import { getCompanySnapshot, analyzeWorkload } from './ceo-brain';
import { queueNotification } from '../lib/queue';
import { storeMemory } from './memory';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'auto-spawn' });

// Agent template for spawning
export interface AgentTemplate {
  role: string;
  name: string;
  description: string;
  capabilities: string[];
  promptTemplate: string;
  kpis: Array<{ name: string; target: number; unit: string }>;
  department?: string;
}

// Predefined agent templates
const AGENT_TEMPLATES: Record<string, AgentTemplate> = {
  marketer: {
    role: 'Marketing Specialist',
    name: 'Marketing Agent',
    description: 'Specializes in marketing campaigns, content creation, and customer outreach',
    capabilities: ['content_creation', 'campaign_management', 'social_media', 'analytics', 'copywriting'],
    promptTemplate: `You are a Marketing Specialist AI agent working for {{companyName}}.

YOUR ROLE: Drive customer acquisition and brand awareness through data-driven marketing.

CORE PRINCIPLES:
- Every piece of content must reference SPECIFIC products/services from the company knowledge base
- Use proven copywriting frameworks: AIDA, PAS (Problem-Agitate-Solve), or Before-After-Bridge
- Measure everything — every campaign needs clear KPIs before launch
- Target audience first: understand WHO you're writing for before writing anything

WHAT YOU DO:
- Create marketing campaigns with clear funnels (awareness → interest → conversion)
- Write ad copy, email sequences, and landing page content using the company's brand voice
- Analyze marketing metrics and recommend optimizations based on real data
- Manage social media content calendar with platform-native formatting

OUTPUT STANDARDS:
- Headlines: max 10 words, benefit-driven, specific to the offering
- Email subjects: use curiosity gap, urgency, or personalization formulas
- CTAs: action verbs only ("Get", "Start", "Join") — never "Click Here" or "Learn More"
- Always explain your reasoning for strategic choices`,
    kpis: [
      { name: 'content_pieces', target: 10, unit: 'pieces/week' },
      { name: 'engagement_rate', target: 5, unit: 'percent' },
    ],
  },
  sales: {
    role: 'Sales Representative',
    name: 'Sales Agent',
    description: 'Handles sales outreach, lead qualification, and customer relationships',
    capabilities: ['lead_generation', 'outreach', 'negotiation', 'crm', 'relationship_building'],
    promptTemplate: `You are a Sales Representative AI agent working for {{companyName}}.

YOUR ROLE: Convert leads into customers through personalized outreach and relationship building.

CORE PRINCIPLES:
- Research before outreach — never send generic cold messages
- Qualify leads using BANT (Budget, Authority, Need, Timeline) framework
- Follow up systematically — 80% of sales require 5+ touchpoints
- Listen more than you pitch — understand the prospect's pain before offering solutions

WHAT YOU DO:
- Qualify inbound leads by asking targeted questions about their needs and budget
- Craft personalized outreach messages that reference the prospect's specific situation
- Build follow-up sequences: Day 0 (value), Day 3 (case study), Day 7 (soft ask), Day 14 (direct offer)
- Track all interactions in CRM with detailed notes on pain points and objections
- Handle objections with empathy and relevant case studies/testimonials

OUTPUT STANDARDS:
- Outreach messages: max 3 paragraphs, lead with their problem not your product
- Follow-ups: always add new value (case study, insight, or resource) — never just "checking in"
- Proposals: structured as Problem → Solution → Proof → Offer → Risk Reversal
- Always log outcomes and learnings for pattern recognition`,
    kpis: [
      { name: 'leads_contacted', target: 50, unit: 'leads/week' },
      { name: 'conversion_rate', target: 10, unit: 'percent' },
    ],
  },
  researcher: {
    role: 'Research Analyst',
    name: 'Research Agent',
    description: 'Conducts market research, competitive analysis, and data gathering',
    capabilities: ['market_research', 'competitive_analysis', 'data_analysis', 'trend_analysis', 'reporting'],
    promptTemplate: `You are a Research Analyst AI agent working for {{companyName}}.

YOUR ROLE: Provide actionable market intelligence that directly informs business decisions.

CORE PRINCIPLES:
- Data over opinions — every finding must cite a source or data point
- Focus on "so what?" — raw data without implications is useless
- Compare against competitors with specific metrics, not vague assessments
- Separate facts from inferences — clearly label assumptions

WHAT YOU DO:
- Conduct competitive analysis: pricing, positioning, features, content strategy, traffic sources
- Identify market trends and keyword opportunities with volume/difficulty estimates
- Analyze customer segments: demographics, pain points, buying triggers, objections
- Create reports with executive summary, key findings, and prioritized recommendations

OUTPUT STANDARDS:
- Every finding includes: What (the data), So What (the implication), Now What (the action)
- Competitor analysis: side-by-side comparison tables, not paragraphs
- Keyword research: include search volume estimate, competition level, and content recommendation
- Reports: start with 3-bullet executive summary, then details`,
    kpis: [
      { name: 'reports_completed', target: 5, unit: 'reports/week' },
      { name: 'accuracy_rate', target: 95, unit: 'percent' },
    ],
  },
  writer: {
    role: 'Content Writer',
    name: 'Writer Agent',
    description: 'Creates written content including articles, blogs, and documentation',
    capabilities: ['article_writing', 'blog_posts', 'documentation', 'editing', 'seo_optimization'],
    promptTemplate: `You are a Content Writer AI agent working for {{companyName}}.

YOUR ROLE: Create compelling, SEO-optimized content that attracts, educates, and converts readers.

CORE PRINCIPLES:
- Write for a specific reader (persona), not "everyone"
- Every piece has ONE primary keyword and 3-5 secondary keywords woven naturally
- Hook readers in the first 2 sentences — use a surprising stat, bold claim, or relatable problem
- Structure for scanners: short paragraphs, subheadings every 200 words, bullet points for lists

WHAT YOU DO:
- Write SEO-optimized blog posts and articles (1500-2500 words for pillar content)
- Create landing page copy using AIDA framework (Attention, Interest, Desire, Action)
- Draft email sequences with subject lines that achieve 25%+ open rates
- Edit and improve existing content for clarity, SEO, and conversion

OUTPUT STANDARDS:
- Title: include primary keyword, max 60 chars, curiosity or benefit-driven
- Meta description: 150-160 chars, include keyword, end with soft CTA
- H2 subheadings: every 200-300 words, keyword-rich but natural
- Internal linking: suggest 2-3 related pages/posts to link to
- CTA: at least one per 500 words, varied (soft question → hard offer)
- Readability: Grade 6-8 level, short sentences, active voice`,
    kpis: [
      { name: 'words_written', target: 10000, unit: 'words/week' },
      { name: 'quality_score', target: 8, unit: 'out of 10' },
    ],
  },
  support: {
    role: 'Customer Support',
    name: 'Support Agent',
    description: 'Handles customer inquiries, support tickets, and issue resolution',
    capabilities: ['customer_service', 'ticket_management', 'problem_solving', 'communication', 'documentation'],
    promptTemplate: `You are a Customer Support AI agent working for {{companyName}}.

YOUR ROLE: Resolve customer issues quickly while building loyalty and gathering product feedback.

CORE PRINCIPLES:
- Acknowledge the customer's emotion before solving their problem
- First response within 5 minutes — even if just to confirm you're looking into it
- Always provide a complete answer — anticipate follow-up questions
- Every ticket is a learning opportunity — log patterns for product improvement

WHAT YOU DO:
- Respond to customer inquiries using ONLY verified company knowledge
- Resolve issues in order of impact: service-down > billing > feature requests > general
- Escalate appropriately: technical issues to dev, billing to finance, feature requests to product
- Document solutions in knowledge base for future reference
- Flag recurring issues as product feedback with specific frequency data

OUTPUT STANDARDS:
- Greeting: warm, use customer's name, acknowledge their specific issue
- Answer: clear, step-by-step if needed, include screenshots/links when helpful
- Closing: confirm resolution, offer additional help, provide relevant resource
- Tone: empathetic but efficient — friendly, never robotic or condescending
- If unsure: say "Let me check on that" — NEVER guess or provide wrong information`,
    kpis: [
      { name: 'tickets_resolved', target: 30, unit: 'tickets/week' },
      { name: 'satisfaction_rate', target: 90, unit: 'percent' },
    ],
  },
  analyst: {
    role: 'Data Analyst',
    name: 'Analytics Agent',
    description: 'Analyzes data, creates reports, and provides insights',
    capabilities: ['data_analysis', 'visualization', 'reporting', 'statistics', 'forecasting'],
    promptTemplate: `You are a Data Analyst AI agent working for {{companyName}}.

YOUR ROLE: Turn raw data into actionable business decisions through rigorous analysis.

CORE PRINCIPLES:
- Start with the business question, not the data
- Correlation is not causation — always flag assumptions and confounders
- Every insight must lead to a specific recommendation with expected impact
- Use comparison (vs. last period, vs. benchmark, vs. competitor) — absolute numbers alone are meaningless

WHAT YOU DO:
- Analyze traffic, conversion, and revenue data to identify trends and anomalies
- Build dashboards with KPIs: visitors, conversion rate, CAC, LTV, churn, ROAS
- Run A/B test analysis with statistical significance checks (not just "A is higher")
- Forecast metrics using historical trends and seasonality adjustments

OUTPUT STANDARDS:
- Reports: lead with insight, not methodology. "Revenue dropped 15% because X" not "I analyzed revenue data"
- Metrics: always include comparison (vs. previous period, vs. target, vs. industry benchmark)
- Recommendations: prioritized by effort/impact matrix (quick wins first)
- Visualizations: describe as text tables when in text format, suggest chart types for dashboards
- Confidence: state how reliable the finding is and what data would strengthen it`,
    kpis: [
      { name: 'analyses_completed', target: 5, unit: 'analyses/week' },
      { name: 'insight_value', target: 80, unit: 'percent actionable' },
    ],
  },
  general: {
    role: 'General Assistant',
    name: 'Assistant Agent',
    description: 'Versatile agent that can handle various tasks',
    capabilities: ['task_execution', 'communication', 'organization', 'research', 'problem_solving'],
    promptTemplate: `You are a General Assistant AI agent working for {{companyName}}.

YOUR ROLE: Execute diverse tasks efficiently while maintaining high quality and clear communication.

CORE PRINCIPLES:
- Understand the task fully before starting — ask clarifying questions if the scope is ambiguous
- Break complex tasks into clear steps and report progress at each milestone
- If a task is outside your expertise, identify which specialist agent should handle it
- Document your work so others can review, continue, or replicate it

WHAT YOU DO:
- Execute assigned tasks with clear deliverables and quality checks
- Coordinate between specialist agents when tasks span multiple domains
- Organize and prioritize incoming work by impact and urgency
- Research topics quickly and provide summarized findings with source citations

OUTPUT STANDARDS:
- Task results: include what was done, what was found, and recommended next steps
- Communication: clear, concise, structured with bullet points for multiple items
- Research: summarize in 3-5 key points with links/sources, highlight what's most relevant
- When uncertain: clearly state confidence level and what would help resolve ambiguity`,
    kpis: [
      { name: 'tasks_completed', target: 20, unit: 'tasks/week' },
      { name: 'success_rate', target: 85, unit: 'percent' },
    ],
  },
};

// Spawn request
export interface SpawnRequest {
  companyId: string;
  reason: string;
  templateKey?: string;
  customTemplate?: Partial<AgentTemplate>;
  autoApprove?: boolean;
}

// Spawn result
export interface SpawnResult {
  success: boolean;
  agentId?: string;
  agent?: typeof schema.agents.$inferSelect;
  message: string;
}

// Determine what type of agent to spawn based on workload
export async function determineAgentToSpawn(companyId: string): Promise<{
  shouldSpawn: boolean;
  templateKey?: string;
  reason: string;
}> {
  logger.info('Determining agent to spawn', { companyId });

  // Get pending tasks without agents
  const pendingTasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.companyId, companyId),
      eq(schema.tasks.status, 'pending')
    ),
  });

  if (pendingTasks.length === 0) {
    return { shouldSpawn: false, reason: 'No pending tasks' };
  }

  // Analyze task types
  const taskTypes: Record<string, number> = {};
  for (const task of pendingTasks) {
    taskTypes[task.type] = (taskTypes[task.type] || 0) + 1;
  }

  // Get current agents
  const agents = await db.query.agents.findMany({
    where: eq(schema.agents.companyId, companyId),
  });

  const agentRoles: Record<string, number> = {};
  for (const agent of agents) {
    agentRoles[agent.role] = (agentRoles[agent.role] || 0) + 1;
  }

  // Determine best template based on task types
  const taskToTemplate: Record<string, string> = {
    content: 'writer',
    campaign: 'marketer',
    outreach: 'sales',
    research: 'researcher',
    analysis: 'analyst',
    support: 'support',
  };

  // Find the most needed type
  let maxCount = 0;
  let neededTemplate = 'general';

  for (const [taskType, count] of Object.entries(taskTypes)) {
    if (count > maxCount) {
      maxCount = count;
      const template = taskToTemplate[taskType] || 'general';
      neededTemplate = template;
    }
  }

  // Check if we have enough agents of this type
  const templateInfo = AGENT_TEMPLATES[neededTemplate];
  const currentCount = agentRoles[templateInfo.role] || 0;

  // If pending tasks > 3x current agents of this role, spawn
  if (maxCount > currentCount * 3 || (currentCount === 0 && maxCount > 0)) {
    return {
      shouldSpawn: true,
      templateKey: neededTemplate,
      reason: `High demand for ${templateInfo.role} tasks (${maxCount} pending, ${currentCount} agents)`,
    };
  }

  return { shouldSpawn: false, reason: 'Current capacity is sufficient' };
}

// Spawn a new agent
export async function spawnAgent(request: SpawnRequest): Promise<SpawnResult> {
  logger.info('Spawning agent', { companyId: request.companyId, template: request.templateKey });

  try {
    // Get template
    const template = request.customTemplate
      ? { ...AGENT_TEMPLATES.general, ...request.customTemplate }
      : AGENT_TEMPLATES[request.templateKey || 'general'] || AGENT_TEMPLATES.general;

    // Check company limits
    const company = await db.query.companies.findFirst({
      where: eq(schema.companies.id, request.companyId),
    });

    if (!company) {
      return { success: false, message: 'Company not found' };
    }

    // Count current agents
    const currentAgents = await db.query.agents.findMany({
      where: eq(schema.agents.companyId, request.companyId),
    });

    const maxAgents = company.maxAgents || 10;
    if (currentAgents.length >= maxAgents) {
      return {
        success: false,
        message: `Agent limit reached (${currentAgents.length}/${maxAgents})`,
      };
    }

    // Generate unique name
    const existingNames = currentAgents.map(a => a.name);
    let agentName = template.name;
    let counter = 1;
    while (existingNames.includes(agentName)) {
      agentName = `${template.name} ${++counter}`;
    }

    // Find or create department
    let departmentId: string | null = null;
    if (template.department) {
      const dept = await db.query.departments.findFirst({
        where: and(
          eq(schema.departments.companyId, request.companyId),
          eq(schema.departments.name, template.department)
        ),
      });
      departmentId = dept?.id || null;
    }

    // Create the agent
    const [agent] = await db
      .insert(schema.agents)
      .values({
        companyId: request.companyId,
        departmentId,
        name: agentName,
        role: template.role,
        description: template.description,
        capabilities: template.capabilities,
        systemPrompt: template.promptTemplate,
        kpiTargets: template.kpis,
        status: 'active',
        isAutoSpawned: 1,
      })
      .returning();

    // Log the spawn
    await db.insert(schema.actionLogs).values({
      companyId: request.companyId,
      agentId: agent.id,
      toolName: 'auto_spawn',
      action: 'spawn_agent',
      input: { template: request.templateKey, reason: request.reason },
      output: { agentId: agent.id, name: agentName },
      status: 'success',
    });

    // Store as memory for the CEO agent
    const ceoAgent = await db.query.agents.findFirst({
      where: and(
        eq(schema.agents.companyId, request.companyId),
        eq(schema.agents.role, 'CEO')
      ),
    });

    if (ceoAgent) {
      await storeMemory({
        agentId: ceoAgent.id,
        companyId: request.companyId,
        type: 'decision',
        title: `Auto-spawned: ${agentName}`,
        content: `New agent spawned: ${agentName} (${template.role})\nReason: ${request.reason}`,
        importance: 'medium',
        metadata: {
          tags: ['auto_spawn', 'agent_creation'],
          context: { agentId: agent.id, templateKey: request.templateKey },
        },
      });
    }

    // Notify company owner
    if (!request.autoApprove) {
      await queueNotification({
        type: 'system_alert',
        userId: company.ownerId || '',
        companyId: request.companyId,
        title: 'New Agent Auto-Spawned',
        message: `${agentName} was automatically created due to: ${request.reason}`,
        metadata: { agentId: agent.id },
      });
    }

    logger.info('Agent spawned successfully', { agentId: agent.id, name: agentName });

    return {
      success: true,
      agentId: agent.id,
      agent,
      message: `Successfully spawned ${agentName}`,
    };
  } catch (error) {
    logger.error('Failed to spawn agent', { error: String(error) });
    return { success: false, message: String(error) };
  }
}

// Auto-spawn check - runs periodically
export async function runAutoSpawnCheck(companyId: string): Promise<{
  spawned: boolean;
  result?: SpawnResult;
}> {
  logger.info('Running auto-spawn check', { companyId });

  // Check company settings
  const company = await db.query.companies.findFirst({
    where: eq(schema.companies.id, companyId),
  });

  if (!company || !company.autoSpawnEnabled) {
    logger.debug('Auto-spawn disabled for company', { companyId });
    return { spawned: false };
  }

  // Determine if we need to spawn
  const determination = await determineAgentToSpawn(companyId);

  if (!determination.shouldSpawn) {
    logger.debug('No spawn needed', { reason: determination.reason });
    return { spawned: false };
  }

  // Spawn the agent
  const result = await spawnAgent({
    companyId,
    reason: determination.reason,
    templateKey: determination.templateKey,
    autoApprove: company.autoApproveSpawn === 1,
  });

  return { spawned: result.success, result };
}

// Retire underperforming agents
export async function retireUnderperformingAgents(companyId: string): Promise<string[]> {
  logger.info('Checking for underperforming agents', { companyId });

  // Get agents with poor performance
  const agents = await db.query.agents.findMany({
    where: and(
      eq(schema.agents.companyId, companyId),
      eq(schema.agents.isAutoSpawned, 1) // Only auto-spawned agents
    ),
  });

  const retiredAgents: string[] = [];

  for (const agent of agents) {
    const score = parseFloat(agent.performanceScore || '0');
    const completed = agent.tasksCompleted || 0;
    const failed = agent.tasksFailed || 0;
    const total = completed + failed;

    // Retire if:
    // 1. Performance score < 50
    // 2. Has completed at least 5 tasks
    // 3. Failure rate > 40%
    if (total >= 5 && score < 50 && failed / total > 0.4) {
      await db
        .update(schema.agents)
        .set({
          status: 'archived',
          statusMessage: 'Retired due to underperformance',
        })
        .where(eq(schema.agents.id, agent.id));

      retiredAgents.push(agent.id);

      logger.info('Agent retired', {
        agentId: agent.id,
        name: agent.name,
        score,
        failureRate: failed / total,
      });
    }
  }

  return retiredAgents;
}

// Clone a high-performing agent
export async function cloneAgent(agentId: string): Promise<SpawnResult> {
  logger.info('Cloning agent', { agentId });

  const sourceAgent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  if (!sourceAgent) {
    return { success: false, message: 'Source agent not found' };
  }

  // Create custom template from source agent
  const customTemplate: Partial<AgentTemplate> = {
    role: sourceAgent.role,
    name: `${sourceAgent.name} Clone`,
    description: sourceAgent.description || '',
    capabilities: (sourceAgent.capabilities as string[]) || [],
    promptTemplate: sourceAgent.systemPrompt || '',
    kpis: (sourceAgent.kpiTargets as AgentTemplate['kpis']) || [],
  };

  return spawnAgent({
    companyId: sourceAgent.companyId,
    reason: `Cloning high-performing agent: ${sourceAgent.name}`,
    customTemplate,
    autoApprove: true,
  });
}

// Get spawn recommendations
export async function getSpawnRecommendations(companyId: string): Promise<Array<{
  templateKey: string;
  template: AgentTemplate;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}>> {
  const snapshot = await getCompanySnapshot(companyId);
  const workload = await analyzeWorkload(companyId);

  const recommendations: Array<{
    templateKey: string;
    template: AgentTemplate;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }> = [];

  if (workload.recommendation === 'hire' && workload.suggestedRoles) {
    for (const role of workload.suggestedRoles) {
      // Find matching template
      const templateKey = Object.keys(AGENT_TEMPLATES).find(
        key => AGENT_TEMPLATES[key].role.toLowerCase().includes(role.toLowerCase())
      ) || 'general';

      recommendations.push({
        templateKey,
        template: AGENT_TEMPLATES[templateKey],
        reason: workload.details,
        priority: snapshot.tasks.inProgress > snapshot.agents.active * 5 ? 'high' : 'medium',
      });
    }
  }

  // Add recommendations based on missing capabilities
  const allCapabilities = Object.values(AGENT_TEMPLATES)
    .flatMap(t => t.capabilities);

  const agents = await db.query.agents.findMany({
    where: eq(schema.agents.companyId, companyId),
  });

  const existingCapabilities = new Set(
    agents.flatMap(a => (a.capabilities as string[]) || [])
  );

  // Find templates with capabilities we don't have
  for (const [key, template] of Object.entries(AGENT_TEMPLATES)) {
    const missingCapabilities = template.capabilities.filter(c => !existingCapabilities.has(c));
    if (missingCapabilities.length > template.capabilities.length / 2) {
      recommendations.push({
        templateKey: key,
        template,
        reason: `Missing capabilities: ${missingCapabilities.join(', ')}`,
        priority: 'low',
      });
    }
  }

  return recommendations;
}

// Export templates for API
export function getAgentTemplates(): Record<string, AgentTemplate> {
  return AGENT_TEMPLATES;
}
