import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  parsed: {} as Record<string, unknown>,
  buildAdvisorContext: vi.fn(),
  llmGenerate: vi.fn(),
}));

vi.mock('./advisor-context-builder', () => ({
  buildAdvisorContext: mocks.buildAdvisorContext,
}));

vi.mock('../lib/llm', () => ({
  llmGenerate: mocks.llmGenerate,
  extractJSON: () => mocks.parsed,
}));

import { generateCeoBrief } from './ceo-advisor';

const baseContext = {
  companyId: 'company-1',
  tenantId: 'tenant-1',
  business: {},
  campaigns: [],
  blogs: [],
  landingPages: [],
  sales: {},
  team: [{
    id: 'agent-ceo',
    name: 'Alice Johnson',
    role: 'ceo',
    title: 'CEO',
    department: 'Executive',
    capabilities: ['Strategy'],
  }, {
    id: 'agent-marketing',
    name: 'Ben Smith',
    role: 'marketing_manager',
    title: 'Marketing Director',
    department: 'Marketing',
    capabilities: ['Campaign planning'],
  }],
  marketSignals: [],
  coverageGaps: [],
  growthPlanHealth: {
    status: 'fresh',
    version: 1,
    baselineAt: new Date().toISOString(),
    ageDays: 0,
    score: 0,
    reasons: ['The current strategy still matches the latest available company data.'],
    signalIds: [],
    newSignals: 0,
  },
  evidence: [{
    id: 'campaign:campaign-1',
    sourceType: 'campaign',
    sourceId: 'campaign-1',
    label: 'Summer campaign',
    detail: 'Live traffic campaign with measurable clicks',
    link: '/company-1/campaigns/campaign-1',
  }],
  sourceHealth: [{
    source: 'campaigns',
    status: 'ok',
    count: 1,
  }],
  counts: {
    campaigns: 1,
    blogs: 0,
    landingPages: 0,
    deals: 0,
    marketScans: 0,
    learnings: 0,
    brainEvents: 0,
  },
};

describe('generateCeoBrief', () => {
  beforeEach(() => {
    mocks.buildAdvisorContext.mockResolvedValue(baseContext);
    mocks.llmGenerate.mockResolvedValue({
      text: '{}',
      model: 'test-model',
      traceId: 'trace-1',
    });
    mocks.parsed = {};
  });

  it('keeps only grounded actions and resolves evidence from the server catalog', async () => {
    mocks.parsed = {
      headline: 'Focus on the strongest signal',
      actions: [
        {
          title: 'Build a follow-up campaign',
          why: 'The current campaign has measurable engagement.',
          link: '/company-1/campaigns',
          severity: 'high',
          confidence: 'high',
          actionKind: 'campaign',
          evidenceIds: ['campaign:campaign-1'],
          campaignProposal: {
            goal: 'Convert engaged visitors',
            audience: 'Visitors who clicked the summer campaign',
            channels: ['facebook'],
            assets: ['blog', 'banner'],
          },
        },
        {
          title: 'Invented recommendation',
          why: 'This cites evidence that does not exist.',
          evidenceIds: ['campaign:missing'],
        },
      ],
      wins: [],
      alerts: [],
    };

    const result = await generateCeoBrief({
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.evidence).toEqual([baseContext.evidence[0]]);
    expect(result.actions[0]?.campaignProposal?.goal).toBe('Convert engaged visitors');
    expect(result.actions[0]?.teamTasks?.[0]).toMatchObject({
      agentId: 'agent-marketing',
      agentName: 'Ben Smith',
    });
  });

  it('keeps valid role-specific AI assignments from the actual company team', async () => {
    mocks.parsed = {
      actions: [{
        title: 'Prepare a customer campaign',
        why: 'The campaign evidence supports a focused follow-up.',
        severity: 'high',
        confidence: 'high',
        actionKind: 'content',
        evidenceIds: ['campaign:campaign-1'],
        teamTasks: [{
          agentId: 'agent-marketing',
          task: 'Create the campaign brief and coordinate the launch assets.',
          expectedOutcome: 'A review-ready campaign plan.',
        }, {
          agentId: 'invented-agent',
          task: 'This assignment must be removed.',
        }],
      }],
      wins: [],
      alerts: [],
    };

    const result = await generateCeoBrief({
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    expect(result.actions[0]?.teamTasks).toEqual([{
      agentId: 'agent-marketing',
      agentName: 'Ben Smith',
      role: 'marketing_manager',
      title: 'Marketing Director',
      department: 'Marketing',
      task: 'Create the campaign brief and coordinate the launch assets.',
      expectedOutcome: 'A review-ready campaign plan.',
    }]);
  });

  it('removes unsafe links and surfaces unavailable data sources', async () => {
    mocks.buildAdvisorContext.mockResolvedValue({
      ...baseContext,
      sourceHealth: [{
        source: 'marketScans',
        status: 'unavailable',
        count: 0,
        message: 'This source could not be read during this refresh.',
      }],
    });
    mocks.parsed = {
      actions: [{
        title: 'Review the campaign',
        why: 'It is the only grounded action.',
        link: 'https://example.com/unsafe',
        evidenceIds: ['campaign:campaign-1'],
      }],
      wins: [],
      alerts: [],
    };

    const result = await generateCeoBrief({
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    expect(result.actions[0]?.link).toBeUndefined();
    expect(result.alerts[0]?.what).toBe('Some company data was unavailable');
    expect(result.sourcesUsed.sourceHealth[0]?.status).toBe('unavailable');
  });

  it('adds a direct review action for a recently created autonomous campaign', async () => {
    const createdAt = new Date().toISOString();
    mocks.buildAdvisorContext.mockResolvedValue({
      ...baseContext,
      campaigns: [{
        id: 'campaign-1',
        name: 'AI: Summer learning program',
        status: 'ready',
        sourceType: 'ai_autonomous',
        bannerCount: 3,
        socialPlatforms: ['facebook', 'instagram', 'linkedin'],
        blogPostId: 'blog-1',
        createdAt,
      }],
    });
    mocks.parsed = {
      headline: 'Review what AI prepared',
      actions: [],
      wins: [],
      alerts: [],
    };

    const result = await generateCeoBrief({
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    expect(result.actions[0]).toMatchObject({
      title: 'Review campaign: Summer learning program',
      link: '/company-1/campaigns/campaign-1',
      confidence: 'high',
      actionKind: 'campaign',
    });
    expect(result.actions[0]?.why).toContain('3 banners');
    expect(result.actions[0]?.why).toContain('a blog draft');
  });

  it('does not duplicate an existing direct campaign action', async () => {
    mocks.buildAdvisorContext.mockResolvedValue({
      ...baseContext,
      campaigns: [{
        id: 'campaign-1',
        name: 'AI: Summer campaign',
        status: 'ready',
        sourceType: 'ai_autonomous',
        createdAt: new Date().toISOString(),
      }],
    });
    mocks.parsed = {
      actions: [{
        title: 'Open the summer campaign',
        why: 'It is ready for review.',
        link: '/company-1/campaigns/campaign-1',
        evidenceIds: ['campaign:campaign-1'],
      }],
      wins: [],
      alerts: [],
    };

    const result = await generateCeoBrief({
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    expect(result.actions.filter((action) =>
      action.link === '/company-1/campaigns/campaign-1')).toHaveLength(1);
  });

  it('adds a deterministic Growth Plan review action when strategy drift is detected', async () => {
    const driftEvidence = {
      id: 'business:growth-plan:drift',
      sourceType: 'business',
      label: 'Growth Plan update recommended',
      detail: 'A new market signal changes the current priorities.',
      link: '/company-1/growth-plan',
    };
    mocks.buildAdvisorContext.mockResolvedValue({
      ...baseContext,
      growthPlanHealth: {
        status: 'update_recommended',
        version: 2,
        baselineAt: '2026-01-01T00:00:00.000Z',
        ageDays: 95,
        score: 3,
        reasons: ['A new market signal changes the current priorities.'],
        signalIds: ['market:scan-1'],
        newSignals: 1,
      },
      evidence: [driftEvidence, ...baseContext.evidence],
    });
    mocks.parsed = {
      headline: 'The strategy needs review',
      actions: [],
      wins: [],
      alerts: [],
    };

    const result = await generateCeoBrief({
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    expect(result.actions[0]).toMatchObject({
      title: 'Review Growth Plan v3',
      link: '/company-1/growth-plan',
      confidence: 'high',
      actionKind: 'operations',
    });
  });
});
