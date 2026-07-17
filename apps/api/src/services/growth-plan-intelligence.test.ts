import { describe, expect, it } from 'vitest';
import type { BusinessPlan, GrowthMasterPlan } from '@1person/core/db';
import {
  approveGrowthPlanVersion,
  assessGrowthPlanHealth,
  createGrowthPlanVersion,
} from './growth-plan-intelligence';

const plan: GrowthMasterPlan = {
  seoGrowthPlan: {
    title: 'SEO',
    description: 'SEO plan',
    items: [],
  },
  contentPlan: {
    title: 'Content',
    description: 'Content plan',
    items: [],
  },
  socialMediaPlan: {
    title: 'Social',
    description: 'Social plan',
    items: [],
  },
};

const businessPlan: BusinessPlan = {
  vision: 'Vision',
  mission: 'Mission',
  targetAudience: { demographics: ['Founders'], painPoints: [] },
  valueProposition: 'Value',
  revenueModel: 'Subscription',
  competitors: [],
  suggestedAgents: [],
  growthPlan: plan,
  growthPlanVersion: 1,
  growthPlanGeneratedAt: '2026-01-01T00:00:00.000Z',
  growthPlanApprovedAt: '2026-01-02T00:00:00.000Z',
};

describe('growth-plan-intelligence', () => {
  it('recommends an update when a newer market signal exists', () => {
    const health = assessGrowthPlanHealth({
      businessPlan,
      now: new Date('2026-02-01T00:00:00.000Z'),
      signals: [{
        id: 'market:1',
        sourceType: 'market',
        label: 'Competitor shift',
        detail: 'A competitor launched a lower-priced offer.',
        occurredAt: '2026-01-20T00:00:00.000Z',
      }],
    });

    expect(health.status).toBe('update_recommended');
    expect(health.score).toBe(3);
    expect(health.signalIds).toEqual(['market:1']);
  });

  it('keeps the approved plan active while creating a reviewable draft', () => {
    const next = createGrowthPlanVersion({
      businessPlan,
      plan: {
        ...plan,
        contentPlan: { ...plan.contentPlan, description: 'Updated content plan' },
      },
      reasons: ['New market evidence'],
      generatedAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    expect(next.growthPlanVersion).toBe(1);
    expect(next.growthPlanApprovedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(next.growthPlanDraft?.version).toBe(2);
    expect(next.growthPlan?.contentPlan.description).toBe('Content plan');
  });

  it('regenerates the same unapproved draft version without duplicating history', () => {
    const draft = createGrowthPlanVersion({
      businessPlan,
      plan,
      reasons: ['First draft'],
    });
    const regenerated = createGrowthPlanVersion({
      businessPlan: draft,
      plan,
      reasons: ['Regenerated draft'],
    });

    expect(regenerated.growthPlanDraft?.version).toBe(2);
    expect(regenerated.growthPlanHistory).toBeUndefined();
  });

  it('promotes an approved draft and archives the previous version', () => {
    const draft = createGrowthPlanVersion({
      businessPlan,
      plan,
      reasons: ['New evidence'],
    });
    const approved = approveGrowthPlanVersion({
      businessPlan: draft,
      approvedAt: new Date('2026-02-02T00:00:00.000Z'),
    });

    expect(approved.growthPlanVersion).toBe(2);
    expect(approved.growthPlanDraft).toBeUndefined();
    expect(approved.growthPlanApprovedAt).toBe('2026-02-02T00:00:00.000Z');
    expect(approved.growthPlanHistory?.[0]?.version).toBe(1);
  });
});
