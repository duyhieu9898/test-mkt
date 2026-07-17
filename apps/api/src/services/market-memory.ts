/**
 * Market Memory Loop
 *
 * After each competitor scan, persist the useful signals into the
 * tenant Brain so they enrich:
 *   - CEO Advisor briefs (daily "what should I do today")
 *   - Daily Missions
 *   - Content generator prompts
 *   - Market Position SWOT
 *
 * Called from the scan endpoint after a successful scan completes.
 */

import { getTenantAI } from '../lib/tenant-ai';
import { buildBusinessContext } from './business-context';
import {
  enrichMarketSignals,
  summarizeCompetitiveStrategy,
  type MarketContextEntity,
} from './market-intelligence';
import type { Signal } from './market-scan';

export async function saveScanToBrain(args: {
  companyId: string;
  tenantId: string;
  competitorId: string;
  competitorName: string;
  signals: Signal[];
  aiSummary: string;
  recommendedAction: string;
  scanId: string;
}): Promise<void> {
  const { companyId, tenantId, competitorId, competitorName, signals, aiSummary, recommendedAction, scanId } = args;
  const ai = getTenantAI();
  const snapshot = await ai.brain.getSnapshot(tenantId).catch(() => null);
  const businessContext = await buildBusinessContext(companyId).catch(() => null);
  const products: MarketContextEntity[] = [
    ...(snapshot?.products ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      description: [
        product.description,
        ...(product.attributes?.features ?? []),
        ...(product.attributes?.benefits ?? []),
      ].filter(Boolean).join(' '),
    })),
    ...(businessContext?.products ?? []).map((product) => ({ name: product })),
  ];
  const audiences: MarketContextEntity[] = [
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
    ...(businessContext?.targetAudience ?? []).map((audience) => ({ name: audience })),
  ];
  const competitiveSignals = enrichMarketSignals({
    competitorId,
    competitorName,
    signals,
    products,
    audiences,
  });
  const strategySummary = summarizeCompetitiveStrategy(competitiveSignals);

  // 1. Append one concise learning summarising the scan
  const topSignals = signals.slice(0, 3).map((s) => `[${s.type}] ${s.text}`).join(' | ');
  const lesson = [
    `[Competitor:${competitorName}]`,
    aiSummary.trim() || topSignals,
    recommendedAction ? `Recommended: ${recommendedAction}` : '',
    strategySummary ? `Competitive strategy: ${strategySummary}` : '',
  ]
    .filter(Boolean)
    .join(' — ');

  try {
    await ai.brain.appendLearning(
      tenantId,
      {
        lesson,
        category: 'insight',
        metricSnapshot: {
          source: 'market-scan',
          scanId,
          competitorId,
          competitorName,
          signalCount: signals.length,
          competitiveStrategy: {
            summary: strategySummary,
            signals: competitiveSignals.slice(0, 6),
            recommendedCampaigns: competitiveSignals
              .map((signal) => signal.campaignRecommendation)
              .filter(Boolean)
              .slice(0, 3),
          },
          recordedAt: new Date().toISOString(),
        },
      },
      'system:market-intelligence',
    );
  } catch (e) {
    console.warn('[market-memory] appendLearning failed:', e);
  }

  // 2. Merge signals into MarketPosition SWOT if meaningful
  //    - product_launch / pricing_change → threats
  //    - hire → threats (they are scaling)
  //    - opportunity signals (from aiSummary keywords) → opportunities
  try {
    const current = snapshot?.marketPosition ?? null;

    const existingThreats = new Set(current?.swot?.threats ?? []);
    const existingOpportunities = new Set(current?.swot?.opportunities ?? []);

    const threats = new Set(existingThreats);
    const opportunities = new Set(existingOpportunities);

    for (const signal of competitiveSignals.slice(0, 5)) {
      const text = signal.text.trim();
      if (!text) continue;
      const label = `${competitorName} [${signal.threatLevel}/${signal.competitorCategory}]: ${text}`.slice(0, 220);

      if (signal.threatLevel === 'critical' || signal.threatLevel === 'high' || signal.type === 'hire') {
        threats.add(label);
      } else if (/weak|struggl|layoff|lawsuit|outage|decline|churn/i.test(text)) {
        opportunities.add(label);
      }
    }

    // Cap arrays to keep the brain tidy
    const capArr = (s: Set<string>) => Array.from(s).slice(-12);

    await ai.brain.upsertMarketPosition(
      tenantId,
      {
        swot: {
          strengths: current?.swot?.strengths ?? [],
          weaknesses: current?.swot?.weaknesses ?? [],
          opportunities: capArr(opportunities),
          threats: capArr(threats),
        },
        differentiation: current?.differentiation ?? null,
        positioningStatement: current?.positioningStatement ?? null,
        targetMarket: current?.targetMarket ?? null,
      },
      'system:market-intelligence',
    );
  } catch (e) {
    console.warn('[market-memory] upsertMarketPosition failed:', e);
  }
}
