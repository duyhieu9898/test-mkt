import { desc, eq } from 'drizzle-orm';
import {
  banners,
  blogPosts,
  campaigns,
  dataSources,
  knowledgeBase,
  landingPages,
  socialPosts,
  agents,
  departments,
} from '@1person/core/db';
import type { BrainSnapshot } from '@1person/ai-tenant';
import { db } from '../lib/db';
import { getTenantAI } from '../lib/tenant-ai';
import { buildBusinessContext } from './business-context';
import {
  enrichMarketSignals,
  type CompetitiveSignal,
  type MarketContextEntity,
} from './market-intelligence';
import { searchBrainEvents } from './brain-hub/search';
import {
  assessGrowthPlanHealth,
  type GrowthPlanHealth,
} from './growth-plan-intelligence';

export type AdvisorSourceStatus = 'ok' | 'empty' | 'unavailable';

export interface AdvisorSourceHealth {
  source: string;
  status: AdvisorSourceStatus;
  count: number;
  message?: string;
}

export interface AdvisorEvidence {
  id: string;
  sourceType: 'business' | 'brain' | 'campaign' | 'blog' | 'landing_page' | 'learning' | 'market' | 'sales' | 'coverage';
  sourceId?: string;
  label: string;
  detail: string;
  link?: string;
  occurredAt?: string;
  score?: number;
}

export interface AdvisorMarketSignal extends CompetitiveSignal {
  scanId: string;
  evidenceId: string;
  completedAt?: string;
  recommendedAction?: string | null;
}

export interface AdvisorContext {
  companyId: string;
  tenantId: string;
  business: Record<string, unknown>;
  campaigns: Array<Record<string, unknown>>;
  blogs: Array<Record<string, unknown>>;
  landingPages: Array<Record<string, unknown>>;
  sales: Record<string, unknown>;
  team: AdvisorTeamMember[];
  marketSignals: AdvisorMarketSignal[];
  coverageGaps: string[];
  growthPlanHealth: GrowthPlanHealth;
  evidence: AdvisorEvidence[];
  sourceHealth: AdvisorSourceHealth[];
  counts: {
    campaigns: number;
    blogs: number;
    landingPages: number;
    deals: number;
    marketScans: number;
    learnings: number;
    brainEvents: number;
  };
}

export interface AdvisorTeamMember {
  id: string;
  name: string;
  role: string;
  title?: string;
  department?: string;
  capabilities: string[];
}

const DAY = 86_400_000;

function plainText(value: unknown, maxLength = 400): string {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function optionalSource<T>(
  source: string,
  loader: () => Promise<T>,
  count: (value: T) => number,
): Promise<{ value: T | null; health: AdvisorSourceHealth }> {
  try {
    const value = await loader();
    const itemCount = count(value);
    return {
      value,
      health: {
        source,
        status: itemCount > 0 ? 'ok' : 'empty',
        count: itemCount,
      },
    };
  } catch (error) {
    console.warn(`[ceo-advisor] ${source} source unavailable:`, error);
    return {
      value: null,
      health: {
        source,
        status: 'unavailable',
        count: 0,
        message: 'This source could not be read during this refresh.',
      },
    };
  }
}

function buildRetrievalQuery(snapshot: BrainSnapshot | null): string {
  const terms = [
    'customer pain points objections opportunities campaign content demand',
    ...(snapshot?.products ?? []).slice(0, 5).map((product) => product.name),
    ...(snapshot?.personas ?? []).slice(0, 3).flatMap((persona) => [
      persona.name,
      ...(persona.attributes?.painPoints ?? []).slice(0, 2),
      ...(persona.attributes?.goals ?? []).slice(0, 2),
    ]),
    ...(snapshot?.marketingStrategy?.themes ?? []).slice(0, 5).map((theme) => theme.title),
  ];
  return terms.filter(Boolean).join(' ').slice(0, 500);
}

function campaignAudience(targeting: unknown): string {
  const value = targeting as Record<string, unknown> | null;
  return plainText(value?.audience ?? value?.targetAudience ?? '', 180);
}

function campaignTheme(campaign: typeof campaigns.$inferSelect): string {
  const targeting = campaign.targeting as Record<string, unknown> | null;
  return plainText(
    targeting?.theme ?? targeting?.angle ?? targeting?.blogKeyword ?? campaign.name,
    180,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function campaignPlanSummary(targeting: Record<string, unknown> | null): string {
  const plan = asRecord(targeting?.campaignPlan);
  if (!plan) return '';
  return [
    plan.objective ? `objective ${plainText(plan.objective, 180)}` : '',
    plan.audience ? `audience ${plainText(plan.audience, 140)}` : '',
    plan.coreMessage ? `message ${plainText(plan.coreMessage, 220)}` : '',
  ].filter(Boolean).join('; ');
}

function campaignLearningSummary(targeting: Record<string, unknown> | null): string {
  const learning = asRecord(targeting?.learningSummary);
  if (!learning) return '';
  const observations = Array.isArray(learning.observations)
    ? learning.observations.map((item) => plainText(item, 120)).filter(Boolean).slice(0, 3)
    : [];
  const nextActions = Array.isArray(learning.nextActions)
    ? learning.nextActions.map((item) => plainText(item, 120)).filter(Boolean).slice(0, 3)
    : [];
  return [
    learning.status ? `status ${plainText(learning.status, 80)}` : '',
    observations.length ? `observed ${observations.join(' | ')}` : '',
    nextActions.length ? `next ${nextActions.join(' | ')}` : '',
  ].filter(Boolean).join('; ');
}

export async function buildAdvisorContext(args: {
  companyId: string;
  tenantId: string;
}): Promise<AdvisorContext> {
  const { companyId, tenantId } = args;
  const ai = getTenantAI();

  const [
    campaignRows,
    blogRows,
    landingRows,
    bannerRows,
    socialRows,
    brainSources,
    knowledgeEntries,
    brainSnapshot,
    dealsResult,
    competitorsResult,
    scansResult,
    businessContext,
    teamResult,
  ] = await Promise.all([
    optionalSource('campaigns', () =>
      db.select().from(campaigns)
        .where(eq(campaigns.companyId, companyId))
        .orderBy(desc(campaigns.updatedAt))
        .limit(30), (rows) => rows.length),
    optionalSource('blogs', () =>
      db.select().from(blogPosts)
        .where(eq(blogPosts.companyId, companyId))
        .orderBy(desc(blogPosts.updatedAt))
        .limit(40), (rows) => rows.length),
    optionalSource('landingPages', () =>
      db.select().from(landingPages)
        .where(eq(landingPages.companyId, companyId))
        .orderBy(desc(landingPages.updatedAt))
        .limit(30), (rows) => rows.length),
    optionalSource('banners', () =>
      db.select({
        id: banners.id,
        campaignId: banners.campaignId,
        status: banners.status,
        angle: banners.angle,
        metrics: banners.metrics,
      }).from(banners).where(eq(banners.companyId, companyId)), (rows) => rows.length),
    optionalSource('socialPosts', () =>
      db.select({
        id: socialPosts.id,
        campaignId: socialPosts.campaignId,
        platform: socialPosts.platform,
        status: socialPosts.status,
        metrics: socialPosts.metrics,
      }).from(socialPosts).where(eq(socialPosts.companyId, companyId)), (rows) => rows.length),
    optionalSource('brainHubSources', () =>
      db.select({
        id: dataSources.id,
        name: dataSources.name,
        type: dataSources.type,
        status: dataSources.status,
        lastSyncedAt: dataSources.lastSyncedAt,
        eventCount: dataSources.eventCount,
      }).from(dataSources).where(eq(dataSources.companyId, companyId)), (rows) => rows.length),
    optionalSource('knowledge', () =>
      db.select({
        id: knowledgeBase.id,
        title: knowledgeBase.title,
        category: knowledgeBase.category,
        updatedAt: knowledgeBase.updatedAt,
      }).from(knowledgeBase)
        .where(eq(knowledgeBase.companyId, companyId))
        .orderBy(desc(knowledgeBase.updatedAt))
        .limit(20), (rows) => rows.length),
    optionalSource('businessBrain', () => ai.brain.getSnapshot(tenantId), (snapshot) => {
      return snapshot
        ? Number(Boolean(snapshot.brandVoice))
          + snapshot.personas.length
          + snapshot.products.length
          + snapshot.recentLearnings.length
          + Number(Boolean(snapshot.marketPosition))
          + Number(Boolean(snapshot.marketingStrategy))
        : 0;
    }),
    optionalSource('deals', () => ai.deals.list(tenantId), (rows) => rows.length),
    optionalSource('marketCompetitors', () => ai.market.listCompetitors(tenantId), (rows) => rows.length),
    optionalSource('marketScans', () => ai.market.listScans(tenantId, 50), (rows) => rows.length),
    optionalSource('businessContext', () => buildBusinessContext(companyId), (ctx) =>
      ctx.fullContext.trim() ? 1 : 0),
    optionalSource('aiTeam', () =>
      db.select({
        id: agents.id,
        name: agents.name,
        role: agents.role,
        title: agents.title,
        capabilities: agents.capabilities,
        department: departments.name,
      })
        .from(agents)
        .leftJoin(departments, eq(agents.departmentId, departments.id))
        .where(eq(agents.companyId, companyId)), (rows) => rows.length),
  ]);

  const campaignData = campaignRows.value ?? [];
  const blogData = blogRows.value ?? [];
  const landingData = landingRows.value ?? [];
  const bannerData = bannerRows.value ?? [];
  const socialData = socialRows.value ?? [];
  const snapshot = brainSnapshot.value;
  const deals = dealsResult.value ?? [];
  const competitors = competitorsResult.value ?? [];
  const scans = scansResult.value ?? [];
  const team: AdvisorTeamMember[] = (teamResult.value ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    role: member.role,
    title: member.title ?? undefined,
    department: member.department ?? undefined,
    capabilities: (member.capabilities ?? []).map((capability) => capability.name),
  }));
  const learnings = snapshot?.recentLearnings ?? [];
  const competitorById = new Map(competitors.map((competitor) => [competitor.id, competitor]));
  const productEntities: MarketContextEntity[] = [
    ...(snapshot?.products ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      description: [
        product.description,
        ...(product.attributes?.features ?? []),
        ...(product.attributes?.benefits ?? []),
      ].filter(Boolean).join(' '),
    })),
    ...(businessContext.value?.products ?? []).map((product) => ({ name: product })),
  ];
  const audienceEntities: MarketContextEntity[] = [
    ...(snapshot?.personas ?? []).map((persona) => ({
      id: persona.id,
      name: persona.name,
      description: [
        persona.description,
        persona.attributes?.demographics,
        ...(persona.attributes?.painPoints ?? []),
        ...(persona.attributes?.goals ?? []),
      ].filter(Boolean).join(' '),
    })),
    ...(businessContext.value?.targetAudience ?? []).map((audience) => ({ name: audience })),
  ];

  const brainEventsResult = await optionalSource(
    'brainHubEvents',
    () => searchBrainEvents({
      companyId,
      query: buildRetrievalQuery(snapshot),
      limit: 12,
      minScore: 0.12,
    }),
    (rows) => rows.length,
  );
  const brainEvents = brainEventsResult.value ?? [];

  const evidence: AdvisorEvidence[] = [];
  const growthPlan = businessContext.value?.growthPlan;
  if (growthPlan) {
    const planSections = [
      ['SEO', growthPlan.seoGrowthPlan],
      ['Content', growthPlan.contentPlan],
      ['Social', growthPlan.socialMediaPlan],
    ] as const;
    for (const [sectionLabel, section] of planSections) {
      section.items.slice(0, 5).forEach((item, index) => {
        evidence.push({
          id: `business:growth-plan:${sectionLabel.toLowerCase()}:${index + 1}`,
          sourceType: 'business',
          label: `${sectionLabel} Growth Plan priority`,
          detail: plainText(
            `${item.action}; timeline ${item.timeline}; expected impact ${item.expectedImpact}; priority ${item.priority}`,
            400,
          ),
          link: sectionLabel === 'SEO'
            ? `/${companyId}/seo-engine`
            : `/${companyId}/campaigns`,
        });
      });
    }
  }
  for (const product of (snapshot?.products ?? []).slice(0, 10)) {
    evidence.push({
      id: `business:product:${product.id}`,
      sourceType: 'business',
      sourceId: product.id,
      label: `Product: ${product.name}`,
      detail: plainText([
        product.description,
        ...(product.attributes?.benefits ?? []),
        ...(product.attributes?.features ?? []),
      ].filter(Boolean).join('; '), 350),
      link: `/${companyId}/brain`,
      occurredAt: iso(product.updatedAt),
    });
  }
  if (snapshot?.brandVoice) {
    evidence.push({
      id: `business:brand-voice:${snapshot.brandVoice.id}`,
      sourceType: 'brain',
      sourceId: snapshot.brandVoice.id,
      label: 'Brand voice',
      detail: plainText(
        `${snapshot.brandVoice.tone}; ${snapshot.brandVoice.description ?? ''}`,
        350,
      ),
      link: `/${companyId}/brand-iq`,
      occurredAt: iso(snapshot.brandVoice.updatedAt),
    });
  }
  for (const persona of (snapshot?.personas ?? []).slice(0, 8)) {
    evidence.push({
      id: `business:persona:${persona.id}`,
      sourceType: 'business',
      sourceId: persona.id,
      label: `Customer persona: ${persona.name}`,
      detail: plainText([
        persona.description,
        ...(persona.attributes?.painPoints ?? []),
        ...(persona.attributes?.goals ?? []),
      ].filter(Boolean).join('; '), 350),
      link: `/${companyId}/brain`,
      occurredAt: iso(persona.updatedAt),
    });
  }
  if (snapshot?.marketingStrategy) {
    evidence.push({
      id: `business:marketing-strategy:${snapshot.marketingStrategy.id}`,
      sourceType: 'business',
      sourceId: snapshot.marketingStrategy.id,
      label: 'Marketing strategy',
      detail: plainText(JSON.stringify({
        channels: snapshot.marketingStrategy.channels,
        themes: snapshot.marketingStrategy.themes,
        funnelStages: snapshot.marketingStrategy.funnelStages,
        kpis: snapshot.marketingStrategy.kpis,
      }), 500),
      link: `/${companyId}/brain`,
      occurredAt: iso(snapshot.marketingStrategy.updatedAt),
    });
  }
  const campaignFacts = campaignData.map((campaign) => {
    const campaignBanners = bannerData.filter((item) => item.campaignId === campaign.id);
    const campaignPosts = socialData.filter((item) => item.campaignId === campaign.id);
    const targeting = campaign.targeting as Record<string, unknown> | null;
    const source = targeting?.source;
    const sourceRecord = source && typeof source === 'object'
      ? source as Record<string, unknown>
      : null;
    const audience = campaignAudience(targeting);
    const planSummary = campaignPlanSummary(targeting);
    const learningSummary = campaignLearningSummary(targeting);
    const detail = [
      `${campaign.status} ${campaign.platform} campaign`,
      `goal ${campaign.goal}`,
      audience ? `audience ${audience}` : '',
      `${campaignBanners.length} banners`,
      `${campaignPosts.length} social posts`,
      planSummary ? `plan ${planSummary}` : '',
      learningSummary ? `learning ${learningSummary}` : '',
    ].filter(Boolean).join('; ');
    evidence.push({
      id: `campaign:${campaign.id}`,
      sourceType: 'campaign',
      sourceId: campaign.id,
      label: campaign.name,
      detail,
      link: `/${companyId}/campaigns/${campaign.id}`,
      occurredAt: iso(campaign.updatedAt),
    });
    return {
      id: campaign.id,
      name: campaign.name,
      goal: campaign.goal,
      status: campaign.status,
      platform: campaign.platform,
      aiMode: campaign.aiMode,
      audience: audience || null,
      sourceType: typeof sourceRecord?.type === 'string'
        ? sourceRecord.type
        : typeof source === 'string'
          ? source
          : null,
      sourceReason: typeof sourceRecord?.reasoning === 'string'
        ? sourceRecord.reasoning
        : null,
      theme: campaignTheme(campaign),
      landingPageUrl: campaign.landingPageUrl,
      metrics: campaign.metrics ?? {},
      bannerCount: campaignBanners.length,
      socialPlatforms: [...new Set(campaignPosts.map((post) => post.platform))],
      socialStatuses: campaignPosts.map((post) => post.status),
      campaignPlan: planSummary || null,
      learningSummary: learningSummary || null,
      blogPostId: typeof targeting?.blogPostId === 'string' ? targeting.blogPostId : null,
      createdAt: iso(campaign.createdAt),
      updatedAt: iso(campaign.updatedAt),
    };
  });

  const blogFacts = blogData.map((blog) => {
    evidence.push({
      id: `blog:${blog.id}`,
      sourceType: 'blog',
      sourceId: blog.id,
      label: blog.title,
      detail: [
        blog.status ?? 'draft',
        blog.keyword ? `keyword ${blog.keyword}` : '',
        blog.searchIntent ? `intent ${blog.searchIntent}` : '',
        blog.wordCount ? `${blog.wordCount} words` : '',
        plainText(blog.excerpt, 180),
      ].filter(Boolean).join('; '),
      link: `/${companyId}/blog/${blog.id}`,
      occurredAt: iso(blog.updatedAt),
    });
    return {
      id: blog.id,
      title: blog.title,
      status: blog.status,
      keyword: blog.keyword,
      searchIntent: blog.searchIntent,
      excerpt: plainText(blog.excerpt || blog.content, 280),
      tags: blog.tags,
      wordCount: blog.wordCount,
      cmsPostUrl: blog.cmsPostUrl,
      updatedAt: iso(blog.updatedAt),
    };
  });

  const landingFacts = landingData.map((page) => {
    evidence.push({
      id: `landing:${page.id}`,
      sourceType: 'landing_page',
      sourceId: page.id,
      label: page.name,
      detail: `${page.status ?? 'draft'} landing page; ${page.totalVisitors ?? 0} visitors; ${page.totalLeads ?? 0} leads`,
      link: `/${companyId}/landing-pages`,
      occurredAt: iso(page.updatedAt),
    });
    return {
      id: page.id,
      name: page.name,
      status: page.status,
      targetAudience: page.businessContext?.targetAudience,
      valueProposition: page.businessContext?.valueProposition,
      visitors: page.totalVisitors ?? 0,
      leads: page.totalLeads ?? 0,
      conversionRate: Number(page.conversionRate ?? 0),
      publishedUrl: page.publishedUrl,
      updatedAt: iso(page.updatedAt),
    };
  });

  for (const learning of learnings.slice(0, 12)) {
    evidence.push({
      id: `learning:${learning.id}`,
      sourceType: 'learning',
      sourceId: learning.id,
      label: `${learning.category ?? 'insight'} from campaign history`,
      detail: plainText(learning.lesson, 350),
      link: `/${companyId}/brain`,
      occurredAt: iso(learning.createdAt),
    });
  }

  for (const event of brainEvents) {
    evidence.push({
      id: `brain:${event.id}`,
      sourceType: 'brain',
      sourceId: event.id,
      label: event.subject,
      detail: plainText(event.content, 350),
      link: `/${companyId}/brain-hub`,
      occurredAt: event.occurredAt,
      score: Math.round(event.score * 100) / 100,
    });
  }

  for (const source of (brainSources.value ?? []).slice(0, 10)) {
    evidence.push({
      id: `brain-source:${source.id}`,
      sourceType: 'brain',
      sourceId: source.id,
      label: `Brain Hub source: ${source.name}`,
      detail: `${source.type} source is ${source.status}; ${source.eventCount ?? 0} events indexed`,
      link: `/${companyId}/brain-hub`,
      occurredAt: iso(source.lastSyncedAt),
    });
  }

  for (const entry of (knowledgeEntries.value ?? []).slice(0, 10)) {
    evidence.push({
      id: `knowledge:${entry.id}`,
      sourceType: 'brain',
      sourceId: entry.id,
      label: `Knowledge updated: ${entry.title}`,
      detail: `${entry.category} business knowledge was added or updated`,
      link: `/${companyId}/knowledge`,
      occurredAt: iso(entry.updatedAt),
    });
  }

  const completedScans = scans.filter((scan) => scan.status === 'completed');
  const marketSignals: AdvisorMarketSignal[] = [];
  completedScans
    .filter((scan) => scan.signals.length > 0)
    .slice(0, 25)
    .forEach((scan, scanIndex) => {
      const competitor = scan.competitorId ? competitorById.get(scan.competitorId) : null;
      const competitorName = competitor?.name ?? 'Tracked competitor';
      const enrichedSignals = enrichMarketSignals({
        competitorId: scan.competitorId ?? `unknown-${scanIndex}`,
        competitorName,
        signals: scan.signals.slice(0, 6),
        products: productEntities,
        audiences: audienceEntities,
      });

      enrichedSignals.forEach((signal, signalIndex) => {
        const evidenceId = `market:${scan.id}:${signalIndex + 1}`;
        const detail = plainText([
          `Competitor ${signal.competitorName}`,
          `threat ${signal.threatLevel}`,
          `category ${signal.competitorCategory}`,
          signal.affectedProducts.length ? `affected products ${signal.affectedProducts.join(', ')}` : '',
          signal.affectedAudiences.length ? `affected audiences ${signal.affectedAudiences.join(', ')}` : '',
          `signal ${signal.text}`,
          `counter-move ${signal.counterMove}`,
        ].filter(Boolean).join('; '), 600);

        evidence.push({
          id: evidenceId,
          sourceType: 'market',
          sourceId: scan.id,
          label: `${signal.competitorName}: ${signal.competitorCategory.replace(/_/g, ' ')}`,
          detail,
          link: `/${companyId}/market`,
          occurredAt: iso(scan.completedAt),
        });
        marketSignals.push({
          ...signal,
          scanId: scan.id,
          evidenceId,
          completedAt: iso(scan.completedAt),
          recommendedAction: scan.recommendedAction,
        });
      });
    });

  const now = Date.now();
  const stalledDeals = deals
    .filter((deal) => !['closed_won', 'closed_lost'].includes(deal.stage)
      && now - new Date(deal.updatedAt).getTime() > 3 * DAY)
    .slice(0, 10)
    .map((deal) => {
      const daysSinceUpdate = Math.floor((now - new Date(deal.updatedAt).getTime()) / DAY);
      evidence.push({
        id: `sales:${deal.id}`,
        sourceType: 'sales',
        sourceId: deal.id,
        label: deal.title,
        detail: `${deal.stage} deal has had no update for ${daysSinceUpdate} days`,
        link: `/${companyId}/sales`,
        occurredAt: iso(deal.updatedAt),
      });
      return {
        id: deal.id,
        title: deal.title,
        stage: deal.stage,
        value: deal.value,
        nextAction: deal.nextAction,
        daysSinceUpdate,
      };
    });
  const hotDeals = deals
    .filter((deal) => ['proposal', 'negotiation'].includes(deal.stage) && Number(deal.value ?? 0) > 0)
    .slice(0, 10)
    .map((deal) => {
      if (!evidence.some((item) => item.id === `sales:${deal.id}`)) {
        evidence.push({
          id: `sales:${deal.id}`,
          sourceType: 'sales',
          sourceId: deal.id,
          label: deal.title,
          detail: `${deal.stage} deal valued at ${deal.value ?? 'unknown'} ${deal.currency}`,
          link: `/${companyId}/sales`,
          occurredAt: iso(deal.updatedAt),
        });
      }
      return {
        id: deal.id,
        title: deal.title,
        stage: deal.stage,
        value: deal.value,
        currency: deal.currency,
      };
    });

  const coverageGaps: string[] = [];
  const publishedBlogs = blogData.filter((blog) => ['published', 'pushed_to_cms'].includes(blog.status ?? ''));
  const liveCampaigns = campaignData.filter((campaign) => ['live', 'optimizing'].includes(campaign.status));
  const publishedLandingPages = landingData.filter((page) => page.status === 'published');
  const campaignsWithBlogs = campaignFacts.filter((campaign) => campaign.blogPostId).length;
  const campaignsWithMetrics = campaignData.filter((campaign) =>
    campaign.metrics && Object.values(campaign.metrics).some((value) => Number(value) > 0)).length;

  if (campaignRows.health.status !== 'unavailable' && campaignData.length === 0) {
    coverageGaps.push('No campaigns have been created yet.');
  }
  if (blogRows.health.status !== 'unavailable' && blogData.length === 0) {
    coverageGaps.push('No blog posts exist for the company.');
  }
  if (blogRows.health.status !== 'unavailable' && blogData.length > 0 && publishedBlogs.length === 0) {
    coverageGaps.push(`${blogData.length} blog posts exist, but none are published.`);
  }
  if (campaignRows.health.status !== 'unavailable'
    && blogRows.health.status !== 'unavailable'
    && campaignData.length > 0
    && campaignsWithBlogs === 0) {
    coverageGaps.push('No campaign is linked to a supporting blog post.');
  }
  if (campaignRows.health.status !== 'unavailable'
    && landingRows.health.status !== 'unavailable'
    && liveCampaigns.length > 0
    && publishedLandingPages.length === 0) {
    coverageGaps.push(`${liveCampaigns.length} live campaigns have no published landing page available.`);
  }
  if (campaignRows.health.status !== 'unavailable'
    && liveCampaigns.length > 0
    && campaignsWithMetrics === 0) {
    coverageGaps.push('Campaigns are live, but no measurable campaign performance has been collected.');
  }
  if (brainSnapshot.health.status !== 'unavailable' && (snapshot?.products.length ?? 0) === 0) {
    coverageGaps.push('Business Brain has no products or services.');
  }
  if (brainSnapshot.health.status !== 'unavailable' && (snapshot?.personas.length ?? 0) === 0) {
    coverageGaps.push('Business Brain has no customer personas.');
  }
  if (brainSnapshot.health.status !== 'unavailable' && !(snapshot?.marketingStrategy)) {
    coverageGaps.push('Business Brain has no marketing strategy.');
  }
  coverageGaps.forEach((gap, index) => {
    evidence.push({
      id: `coverage:${index + 1}`,
      sourceType: 'coverage',
      label: 'Detected coverage gap',
      detail: gap,
      link: `/${companyId}/campaigns`,
    });
  });

  const growthPlanHealth = assessGrowthPlanHealth({
    businessPlan: businessContext.value?.businessPlan,
    signals: evidence,
  });
  if (growthPlanHealth.status === 'update_recommended') {
    evidence.unshift({
      id: 'business:growth-plan:drift',
      sourceType: 'business',
      label: 'Growth Plan update recommended',
      detail: growthPlanHealth.reasons.join(' '),
      link: `/${companyId}/growth-plan`,
    });
  }

  const sourceHealth = [
    campaignRows.health,
    blogRows.health,
    landingRows.health,
    bannerRows.health,
    socialRows.health,
    brainSources.health,
    knowledgeEntries.health,
    brainSnapshot.health,
    brainEventsResult.health,
    dealsResult.health,
    competitorsResult.health,
    scansResult.health,
    businessContext.health,
    teamResult.health,
  ];

  return {
    companyId,
    tenantId,
    business: {
      language: businessContext.value?.language ?? 'en',
      languageName: businessContext.value?.languageName ?? 'English',
      profile: plainText(businessContext.value?.fullContext, 4500),
      growthPlan: growthPlan ?? null,
      brandVoice: snapshot?.brandVoice ?? null,
      personas: (snapshot?.personas ?? []).slice(0, 8),
      products: (snapshot?.products ?? []).slice(0, 10),
      marketPosition: snapshot?.marketPosition ?? null,
      marketingStrategy: snapshot?.marketingStrategy ?? null,
      connectedBrainSources: brainSources.value ?? [],
    },
    campaigns: campaignFacts,
    blogs: blogFacts,
    landingPages: landingFacts,
    sales: {
      stalledDeals,
      hotDeals,
    },
    team,
    marketSignals,
    coverageGaps,
    growthPlanHealth,
    evidence: evidence.slice(0, 80),
    sourceHealth,
    counts: {
      campaigns: campaignData.length,
      blogs: blogData.length,
      landingPages: landingData.length,
      deals: deals.length,
      marketScans: completedScans.length,
      learnings: learnings.length,
      brainEvents: brainEvents.length,
    },
  };
}
