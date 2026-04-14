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
import type { Signal } from './market-scan';

export async function saveScanToBrain(args: {
  tenantId: string;
  competitorId: string;
  competitorName: string;
  signals: Signal[];
  aiSummary: string;
  recommendedAction: string;
  scanId: string;
}): Promise<void> {
  const { tenantId, competitorId, competitorName, signals, aiSummary, recommendedAction, scanId } = args;
  const ai = getTenantAI();

  // 1. Append one concise learning summarising the scan
  const topSignals = signals.slice(0, 3).map((s) => `[${s.type}] ${s.text}`).join(' | ');
  const lesson = [
    `[Competitor:${competitorName}]`,
    aiSummary.trim() || topSignals,
    recommendedAction ? `Recommended: ${recommendedAction}` : '',
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
    const snapshot = await ai.brain.getSnapshot(tenantId);
    const current = snapshot.marketPosition;

    const existingThreats = new Set(current?.swot?.threats ?? []);
    const existingOpportunities = new Set(current?.swot?.opportunities ?? []);

    const threats = new Set(existingThreats);
    const opportunities = new Set(existingOpportunities);

    for (const signal of signals.slice(0, 5)) {
      const text = signal.text.trim();
      if (!text) continue;
      const label = `${competitorName}: ${text}`.slice(0, 200);

      if (signal.type === 'product_launch' || signal.type === 'pricing_change' || signal.type === 'hire') {
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
