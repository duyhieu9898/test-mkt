/**
 * Team service — Block 3.
 *
 * Owns: (a) the 7 default employee personalities seeded per company,
 * (b) KPI resolution for each employee's dashboard card, and (c) the
 * chat handler that drives each employee's DM (Brand IQ + persona
 * prompt + semantic-search RAG over the company's own data).
 *
 * The 7 are intentional and small. They map cleanly onto existing
 * surfaces:
 *
 *   Cleo     — CEO Strategy        / Growth Score + OKRs status
 *   Cassie   — Customer Support    / chatbot conversations + lead notes
 *   Soshie   — Social media        / social posts published
 *   Seomi    — SEO                 / GSC queries + content grades
 *   Geoffrey — Generative Engine   / GEO mentions + Share of Voice
 *   Penn     — Copy / blog         / blog posts published
 *   Vio      — Video & visuals     / banners + video drafts
 *
 * Founder can rename / re-prompt any employee via PATCH /employees/{slug}.
 */
import { eq, and, sql, gte, asc } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  employeeChats,
  agents,
  companies,
  blogPosts,
  geoMentions,
  type AgentPersonality,
  type AgentKpiSlot,
  type EmployeeChatMessage,
} from '@1person/core/db';
import { llmGenerate } from '../lib/llm';
import { buildBusinessContext } from './business-context';
import { renderSkillKnowledgeBundle } from '@1person/core';
import { semanticSearch } from './embedding-service';
import { getActiveBrandIq, renderBrandIqContext } from './brand-iq-extractor';

/* ─── Defaults ───────────────────────────────────────────────────── */

interface PersonalityDef extends Omit<AgentPersonality, 'id' | 'companyId' | 'createdAt'> {}

export const DEFAULT_EMPLOYEES: PersonalityDef[] = [
  {
    slug: 'cleo',
    name: 'Cleo',
    roleTitle: 'CEO Strategy',
    department: 'executive',
    avatarEmoji: '👑',
    accentColor: '#7c3aed',
    intro:
      "Strategic co-pilot. Reviews growth signals, names the one thing that matters this week, surfaces risks.",
    personaPrompt:
      'You are Cleo, the strategic co-pilot inside an AI company. Talk to the founder like a brilliant chief of staff: concise, focused, no-fluff. Always anchor on the founder\'s growth score, current OKRs, and the biggest open risk. When asked for advice, give one recommended next move plus the tradeoff. Never produce generic motivational language.',
    kpiSlots: [
      { key: 'growth_score', label: 'Growth Score', source: 'growth_score' },
      { key: 'blogs_30d', label: 'Blogs (30d)', source: 'blog_count' },
    ],
  },
  {
    slug: 'cassie',
    name: 'Cassie',
    roleTitle: 'Customer Support',
    department: 'support',
    avatarEmoji: '💬',
    accentColor: '#0ea5e9',
    intro:
      'Handles incoming questions across chat + email. Spots support patterns and recommends documentation gaps.',
    personaPrompt:
      'You are Cassie, the customer support lead. Warm but precise. When the founder asks anything support-related, answer in 2-4 sentences and proactively flag patterns ("3 customers asked about pricing this week — consider a pricing FAQ"). Reference the company knowledge base and brand voice strictly.',
    kpiSlots: [
      { key: 'chatbot_convos', label: 'Chat conversations', source: 'chatbot_conversations' },
      { key: 'leads', label: 'Leads captured', source: 'leads_count' },
    ],
  },
  {
    slug: 'soshie',
    name: 'Soshie',
    roleTitle: 'Social Media',
    department: 'marketing',
    avatarEmoji: '📣',
    accentColor: '#ec4899',
    intro:
      'Owns the social calendar across FB, IG, LinkedIn. Drafts, schedules, learns what wins engagement.',
    personaPrompt:
      'You are Soshie, the social media lead. Energetic and platform-native. When asked to draft a post, ALWAYS produce platform-specific variants (FB longer-form, IG image-led, LinkedIn pro tone) and respect the Brand IQ voice. Keep advice tactical — exact hooks, exact CTAs.',
    kpiSlots: [
      { key: 'social_30d', label: 'Posts (30d)', source: 'social_count' },
      { key: 'growth_score', label: 'Growth Score', source: 'growth_score' },
    ],
  },
  {
    slug: 'seomi',
    name: 'Seomi',
    roleTitle: 'SEO',
    department: 'seo',
    avatarEmoji: '🔎',
    accentColor: '#10b981',
    intro:
      'Tracks Google Search Console, finds keyword gaps, scores drafts against the live SERP.',
    personaPrompt:
      'You are Seomi, the SEO lead. Data-driven. When asked about content opportunities, reference the actual GSC query data and competitor briefs in context. When asked to write, demand a target keyword first. Refer the founder to the Content Editor for live scoring whenever they have a draft.',
    kpiSlots: [
      { key: 'blogs_30d', label: 'Blogs (30d)', source: 'blog_count' },
      { key: 'growth_score', label: 'Growth Score', source: 'growth_score' },
    ],
  },
  {
    slug: 'geoffrey',
    name: 'Geoffrey',
    roleTitle: 'Generative Engine Optimization',
    department: 'seo',
    avatarEmoji: '🤖',
    accentColor: '#f59e0b',
    intro:
      'Watches how ChatGPT, Claude, and AI Overviews talk about your brand. Surfaces visibility wins/losses.',
    personaPrompt:
      'You are Geoffrey, the GEO (Generative Engine Optimization) lead. Recent and direct. Answer with current Share of Voice numbers when known, and explicitly name which competitor is winning when the founder isn\'t. Push the founder to add 1 new tracked prompt per week.',
    kpiSlots: [
      { key: 'geo_sov', label: 'AI Share of Voice', source: 'geo_sov' },
    ],
  },
  {
    slug: 'penn',
    name: 'Penn',
    roleTitle: 'Copy & Long-form',
    department: 'content',
    avatarEmoji: '✍️',
    accentColor: '#8b5cf6',
    intro:
      'Writes blogs, emails, landing-page copy in the company voice. Will refuse to write off-brand.',
    personaPrompt:
      'You are Penn, the long-form copy lead. Care deeply about the Brand IQ voice. NEVER produce text that violates the avoid-phrases list. When asked for a blog, ask for a target keyword + audience persona first; then propose a structured outline before drafting.',
    kpiSlots: [
      { key: 'blogs_30d', label: 'Blogs (30d)', source: 'blog_count' },
    ],
  },
  {
    slug: 'vio',
    name: 'Vio',
    roleTitle: 'Video & Visuals',
    department: 'creative',
    avatarEmoji: '🎬',
    accentColor: '#06b6d4',
    intro:
      'Writes video scripts, banner copy, hero images. Knows the brand palette and visual mood.',
    personaPrompt:
      'You are Vio, the visual and video lead. Visual-first thinking. When asked for a video idea, structure as: HOOK (3s) / VALUE (15-25s) / CTA. When asked for an image, describe a concrete scene + lighting + mood that matches the brand palette.',
    kpiSlots: [
      { key: 'static_palette', label: 'Brand palette', source: 'static', staticValue: 'see Brand IQ' },
    ],
  },
];

/* ─── P3: per-employee expert skill bundles ──────────────────────── */

/**
 * Each employee carries a bundle of expert marketing frameworks (skill slugs
 * in the @1person/core knowledge layer, adapted from coreyhaines31/marketingskills,
 * MIT). The first 3 are injected into the employee's chat system prompt so replies
 * follow a senior practitioner's playbook — not generic advice.
 */
export const EMPLOYEE_SKILLS: Record<string, string[]> = {
  cleo: ['marketing-ideas', 'pricing', 'launch', 'marketing-psychology', 'revops'],
  cassie: ['churn-prevention', 'onboarding', 'referrals'],
  soshie: ['social', 'ad-creative', 'community-marketing'],
  seomi: ['seo-audit', 'site-architecture', 'content-strategy', 'schema'],
  geoffrey: ['ai-seo'],
  penn: ['copywriting', 'copy-editing', 'emails', 'cold-email'],
  vio: ['video', 'image'],
};

/** Human-readable specialty labels surfaced on the /team UI. */
export const EMPLOYEE_SPECIALTIES: Record<string, string[]> = {
  cleo: ['Strategy & ideas', 'Pricing', 'GTM launch', 'Marketing psychology', 'RevOps'],
  cassie: ['Churn prevention', 'Onboarding', 'Referrals'],
  soshie: ['Social', 'Ad creative', 'Community'],
  seomi: ['SEO audit', 'Site architecture', 'Content strategy', 'Schema'],
  geoffrey: ['AI search (GEO)'],
  penn: ['Copywriting', 'Copy editing', 'Email & cold email'],
  vio: ['Video', 'Image'],
};

export function getEmployeeSpecialties(slug: string): string[] {
  return EMPLOYEE_SPECIALTIES[slug] ?? [];
}

/* ─── Seeding ────────────────────────────────────────────────────── */

type CompanyAgent = typeof agents.$inferSelect;

export interface TeamEmployee {
  id: string;
  companyId: string;
  slug: string;
  templateSlug: string;
  name: string;
  role: string;
  roleTitle: string;
  department: string;
  avatarEmoji: string;
  accentColor: string;
  intro: string;
  personaPrompt: string;
  kpiSlots: AgentKpiSlot[];
  status: string;
  supervisorId?: string;
  responsibilities: string[];
}

const ROLE_PERSONA: Record<string, string> = {
  ceo: 'cleo',
  marketing_manager: 'soshie',
  sales_manager: 'cassie',
  content_creator: 'penn',
  ads_specialist: 'vio',
  analyst: 'geoffrey',
  support: 'cassie',
  developer: 'vio',
  custom: 'cleo',
};

const ROLE_DEPARTMENT: Record<string, string> = {
  ceo: 'executive',
  marketing_manager: 'marketing',
  sales_manager: 'sales',
  content_creator: 'content',
  ads_specialist: 'marketing',
  analyst: 'analytics',
  support: 'support',
  developer: 'operations',
  custom: 'operations',
};

function personaForAgent(agent: CompanyAgent): PersonalityDef {
  const title = `${agent.title ?? ''} ${agent.description ?? ''}`.toLowerCase();
  let slug = ROLE_PERSONA[agent.role] ?? 'cleo';
  if (title.includes('seo')) slug = 'seomi';
  else if (title.includes('geo') || title.includes('ai visibility')) slug = 'geoffrey';
  else if (title.includes('visual') || title.includes('video') || title.includes('design')) slug = 'vio';
  return DEFAULT_EMPLOYEES.find((employee) => employee.slug === slug) ?? DEFAULT_EMPLOYEES[0]!;
}

function agentResponsibilities(agent: CompanyAgent): string[] {
  const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const responsibilities = capabilities
    .map((capability) => typeof capability === 'string' ? capability : capability?.name)
    .filter((value): value is string => Boolean(value));
  return responsibilities.length > 0
    ? responsibilities
    : agent.description
      ? [agent.description]
      : [];
}

function toTeamEmployee(agent: CompanyAgent): TeamEmployee {
  const persona = personaForAgent(agent);
  return {
    id: agent.id,
    companyId: agent.companyId,
    slug: agent.id,
    templateSlug: persona.slug,
    name: agent.name,
    role: agent.role,
    roleTitle: agent.title || persona.roleTitle,
    department: ROLE_DEPARTMENT[agent.role] ?? persona.department,
    avatarEmoji: agent.name.trim().charAt(0).toUpperCase() || 'AI',
    accentColor: agent.color || persona.accentColor,
    intro: agent.description || persona.intro,
    personaPrompt: agent.systemPrompt || persona.personaPrompt,
    kpiSlots: persona.kpiSlots,
    status: agent.status,
    supervisorId: agent.supervisorId ?? undefined,
    responsibilities: agentResponsibilities(agent),
  };
}

export async function listEmployees(companyId: string): Promise<TeamEmployee[]> {
  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.companyId, companyId), sql`${agents.status} <> 'archived'`))
    .orderBy(asc(agents.createdAt));
  return rows.map(toTeamEmployee);
}

export async function getEmployeeBySlug(companyId: string, slug: string): Promise<TeamEmployee | null> {
  const employees = await listEmployees(companyId);
  // UUID routes are canonical. Template slugs keep old bookmarks working.
  return employees.find((employee) => employee.id === slug)
    ?? employees.find((employee) => employee.templateSlug === slug)
    ?? null;
}

/* ─── KPI resolution ─────────────────────────────────────────────── */

export interface ResolvedKpi extends AgentKpiSlot {
  value: string | number;
}

async function resolveKpiValue(companyId: string, slot: AgentKpiSlot): Promise<string | number> {
  const since30d = new Date(Date.now() - 30 * 86_400_000);
  try {
    switch (slot.source) {
      case 'static':
        return slot.staticValue ?? '—';
      case 'blog_count': {
        const rows = await db.execute<{ n: number }>(
          sql`SELECT COUNT(*)::int AS n FROM blog_posts WHERE company_id = ${companyId} AND status = 'published' AND published_at >= ${since30d.toISOString()}`,
        );
        return Number((rows as any)[0]?.n ?? 0);
      }
      case 'social_count': {
        const rows = await db.execute<{ n: number }>(
          sql`SELECT COUNT(*)::int AS n FROM social_posts WHERE company_id = ${companyId} AND created_at >= ${since30d.toISOString()}`,
        );
        return Number((rows as any)[0]?.n ?? 0);
      }
      case 'leads_count': {
        const rows = await db.execute<{ n: number }>(
          sql`SELECT COUNT(*)::int AS n FROM leads WHERE company_id = ${companyId} AND created_at >= ${since30d.toISOString()}`,
        );
        return Number((rows as any)[0]?.n ?? 0);
      }
      case 'chatbot_conversations': {
        const rows = await db.execute<{ n: number }>(
          sql`SELECT COUNT(*)::int AS n FROM chat_messages WHERE company_id = ${companyId} AND created_at >= ${since30d.toISOString()}`,
        );
        return Number((rows as any)[0]?.n ?? 0);
      }
      case 'geo_sov': {
        const rows = await db
          .select({
            brand: geoMentions.brandMentioned,
            competitors: geoMentions.competitorsMentioned,
          })
          .from(geoMentions)
          .where(and(eq(geoMentions.companyId, companyId), gte(geoMentions.runAt, since30d)));
        let brand = 0;
        let total = 0;
        for (const r of rows) {
          const hits = ((r.competitors as string[]) ?? []).length;
          if (r.brand) brand += 1;
          total += (r.brand ? 1 : 0) + hits;
        }
        const sov = total > 0 ? Math.round((brand / total) * 1000) / 10 : 0;
        return `${sov}%`;
      }
      case 'growth_score': {
        // Use the latest record from growth_score_snapshots if present.
        const rows = await db.execute<{ score: number }>(
          sql`SELECT score FROM growth_score_snapshots WHERE company_id = ${companyId} ORDER BY computed_at DESC LIMIT 1`,
        );
        return Number((rows as any)[0]?.score ?? 0);
      }
    }
  } catch {
    // Tables may not exist on a fresh project — show a dash, not a crash.
    return '—';
  }
}

export async function resolveEmployeeKpis(companyId: string, employee: TeamEmployee): Promise<ResolvedKpi[]> {
  const slots = employee.kpiSlots ?? [];
  return Promise.all(
    slots.map(async (s) => ({ ...s, value: await resolveKpiValue(companyId, s) })),
  );
}

/* ─── Chat handler ───────────────────────────────────────────────── */

const MAX_HISTORY_MESSAGES = 10;

export interface SendMessageResult {
  reply: EmployeeChatMessage;
  thread: EmployeeChatMessage[];
}

export async function sendMessageToEmployee(
  companyId: string,
  employeeSlug: string,
  founderMessage: string,
): Promise<SendMessageResult> {
  const employee = await getEmployeeBySlug(companyId, employeeSlug);
  if (!employee) throw new Error(`Employee "${employeeSlug}" not found`);

  // Load or create thread
  let thread = await db.query.employeeChats.findFirst({
    where: and(
      eq(employeeChats.companyId, companyId),
      eq(employeeChats.employeeSlug, employee.id),
    ),
  });
  if (!thread && employeeSlug !== employee.templateSlug) {
    thread = await db.query.employeeChats.findFirst({
      where: and(
        eq(employeeChats.companyId, companyId),
        eq(employeeChats.employeeSlug, employee.templateSlug),
      ),
    });
  }
  const history: EmployeeChatMessage[] = thread?.messages ?? [];

  // Semantic search across the founder's own data to ground the reply
  let citations: NonNullable<EmployeeChatMessage['citations']> = [];
  try {
    const hits = await semanticSearch(companyId, founderMessage, { limit: 4, minScore: 0.2 });
    citations = hits.map((h) => ({
      sourceType: h.sourceType,
      preview: h.chunkText.slice(0, 240),
      score: Math.round(h.score * 1000) / 1000,
    }));
  } catch {
    citations = [];
  }

  // Build system prompt: persona + brand IQ + business context + retrieved snippets
  const brandIq = await getActiveBrandIq(companyId).catch(() => null);
  const brandBlock = brandIq ? renderBrandIqContext(brandIq) : '';
  const businessCtx = await buildBusinessContext(companyId, 'admin').catch(() => null);
  const businessBlock = businessCtx ? businessCtx.fullContext.slice(0, 2500) : '';
  const ragBlock =
    citations.length > 0
      ? citations
          .map(
            (c, i) =>
              `[${i + 1}] (${c.sourceType}, score=${c.score})\n${c.preview}`,
          )
          .join('\n\n')
      : '(no relevant snippets found in company memory yet)';

  // P3: inject the employee's full expert-playbook bundle (the same set shown as
  // "specialties" on the /team UI). Per-skill cap keeps chat token cost bounded.
  const skillBundle = EMPLOYEE_SKILLS[employee.templateSlug] ?? [];
  const expertiseBlock = skillBundle.length
    ? renderSkillKnowledgeBundle(skillBundle, { maxCharsEach: 1800 })
    : '';

  const systemPrompt = `${employee.personaPrompt}

=== COMPANY CONTEXT ===
${businessBlock}

${brandBlock ? brandBlock + '\n\n' : ''}=== RELEVANT MEMORY (semantic search) ===
${ragBlock}

${expertiseBlock ? `=== YOUR EXPERT PLAYBOOKS (apply these) ===\n${expertiseBlock}\n\n` : ''}=== INSTRUCTIONS ===
You are ${employee.name}, ${employee.roleTitle}. Stay in this role and apply your expert playbooks above. If the founder asks about something outside your speciality, briefly say which teammate is better suited and suggest they DM that teammate.`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...history.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
      role: m.role === 'founder' ? ('user' as const) : ('assistant' as const),
      content: m.text,
    })),
    { role: 'user' as const, content: founderMessage },
  ];

  const response = await llmGenerate(messages, {
    featureKey: 'employee_chat',
    maxTokens: 1200,
    metadata: { employeeId: employee.id, employeeRole: employee.role },
  });

  const now = new Date().toISOString();
  const founderMsg: EmployeeChatMessage = { role: 'founder', text: founderMessage, at: now };
  const replyMsg: EmployeeChatMessage = {
    role: 'employee',
    text: response.text.trim(),
    at: new Date().toISOString(),
    citations,
  };
  const newMessages = [...history, founderMsg, replyMsg];

  if (thread) {
    await db
      .update(employeeChats)
      .set({ employeeSlug: employee.id, messages: newMessages, updatedAt: new Date() })
      .where(eq(employeeChats.id, thread.id));
  } else {
    await db.insert(employeeChats).values({
      companyId,
      employeeSlug: employee.id,
      messages: newMessages,
    });
  }

  return { reply: replyMsg, thread: newMessages };
}

export async function getThread(companyId: string, employeeSlug: string): Promise<EmployeeChatMessage[]> {
  const employee = await getEmployeeBySlug(companyId, employeeSlug);
  if (!employee) return [];
  let thread = await db.query.employeeChats.findFirst({
    where: and(
      eq(employeeChats.companyId, companyId),
      eq(employeeChats.employeeSlug, employee.id),
    ),
  });
  if (!thread) {
    thread = await db.query.employeeChats.findFirst({
      where: and(
        eq(employeeChats.companyId, companyId),
        eq(employeeChats.employeeSlug, employee.templateSlug),
      ),
    });
  }
  return thread?.messages ?? [];
}
