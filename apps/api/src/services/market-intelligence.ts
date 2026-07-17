import type { Signal } from './market-scan';

export type CompetitiveThreatLevel = 'critical' | 'high' | 'medium' | 'low';

export type CompetitorCategory =
  | 'direct_product'
  | 'pricing_pressure'
  | 'content_positioning'
  | 'growth_signal'
  | 'brand_awareness'
  | 'general_market';

export interface MarketContextEntity {
  id?: string;
  name: string;
  description?: string | null;
}

export interface CompetitiveSignal extends Signal {
  competitorId: string;
  competitorName: string;
  threatLevel: CompetitiveThreatLevel;
  competitorCategory: CompetitorCategory;
  affectedProducts: string[];
  affectedAudiences: string[];
  counterMove: string;
  campaignRecommendation?: {
    goal: string;
    audience: string;
    offer?: string;
    publicTopic?: string;
    contentAngle?: string;
    channels: string[];
    assets: string[];
    expectedOutcome: string;
  };
}

function words(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\u00c0-\u1ef9\s]/gi, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 3),
  );
}

function overlapScore(left: string, right: string): number {
  const a = words(left);
  const b = words(right);
  let score = 0;
  for (const word of a) {
    if (b.has(word)) score += 1;
  }
  return score;
}

function matchEntities(signalText: string, entities: MarketContextEntity[], fallbackCount = 1): string[] {
  const ranked = entities
    .map((entity) => ({
      name: entity.name,
      score: overlapScore(signalText, `${entity.name} ${entity.description ?? ''}`),
    }))
    .filter((entity) => entity.name.trim().length > 0)
    .sort((left, right) => right.score - left.score);

  const matched = ranked.filter((entity) => entity.score > 0).map((entity) => entity.name);
  if (matched.length > 0) return matched.slice(0, 3);
  return ranked.slice(0, fallbackCount).map((entity) => entity.name);
}

function classifyThreat(signal: Signal): CompetitiveThreatLevel {
  const type = signal.type.toLowerCase();
  const text = signal.text.toLowerCase();

  if (
    type.includes('product_launch')
    || /\b(launch|released|new product|new feature|expands?|funding|raised|acquires?)\b/i.test(text)
  ) {
    return 'high';
  }
  if (
    type.includes('pricing')
    || /\b(price|pricing|discount|free plan|cheaper|bundle|promotion)\b/i.test(text)
  ) {
    return 'high';
  }
  if (type.includes('hire') || /\b(hiring|appointed|new ceo|new cmo|team expansion)\b/i.test(text)) {
    return 'medium';
  }
  if (type.includes('content') || /\b(report|guide|webinar|case study|blog|whitepaper)\b/i.test(text)) {
    return 'medium';
  }
  if (type.includes('news')) return 'low';
  return 'medium';
}

function classifyCategory(signal: Signal): CompetitorCategory {
  const type = signal.type.toLowerCase();
  const text = signal.text.toLowerCase();

  if (type.includes('pricing') || /\b(price|pricing|discount|free plan|bundle)\b/i.test(text)) {
    return 'pricing_pressure';
  }
  if (type.includes('product_launch') || /\b(launch|released|new feature|new product)\b/i.test(text)) {
    return 'direct_product';
  }
  if (type.includes('content') || /\b(blog|guide|webinar|report|case study|whitepaper)\b/i.test(text)) {
    return 'content_positioning';
  }
  if (type.includes('hire') || /\b(hiring|funding|raised|expansion|acquires?)\b/i.test(text)) {
    return 'growth_signal';
  }
  if (type.includes('news')) return 'brand_awareness';
  return 'general_market';
}

function counterMove(args: {
  competitorName: string;
  signal: Signal;
  category: CompetitorCategory;
  products: string[];
  audiences: string[];
}) {
  const product = args.products[0] ?? 'your offer';
  const audience = args.audiences[0] ?? 'your best-fit customers';

  switch (args.category) {
    case 'direct_product':
      return {
        counterMove: `Create a campaign that explains why ${product} is still the better fit for ${audience}, using the competitor launch as urgency.`,
        campaignRecommendation: {
          goal: `Respond to ${args.competitorName}'s product move with a differentiated campaign`,
          audience,
          offer: product,
          publicTopic: `Why ${product} is still the right fit`,
          contentAngle: `Help ${audience} understand the practical reasons to choose ${product} even when a competitor is launching something new.`,
          channels: ['facebook', 'linkedin'],
          assets: ['blog', 'social_posts', 'comparison_landing_page'],
          expectedOutcome: 'Protect demand by clarifying your unique value before prospects compare alternatives.',
        },
      };
    case 'pricing_pressure':
      return {
        counterMove: `Publish a value-led comparison that explains total value, support, quality, and fit instead of competing only on price.`,
        campaignRecommendation: {
          goal: `Defend against ${args.competitorName}'s pricing pressure`,
          audience,
          offer: product,
          publicTopic: `Why ${product} is worth choosing beyond the lowest price`,
          contentAngle: `Show ${audience} how to compare total value, support, quality, and fit instead of deciding by discount alone.`,
          channels: ['facebook', 'linkedin'],
          assets: ['landing_page', 'social_posts'],
          expectedOutcome: 'Reduce price-shopping risk and help prospects understand why your offer is worth choosing.',
        },
      };
    case 'content_positioning':
      return {
        counterMove: `Create counter-content with a clearer, more practical point of view for ${audience}.`,
        campaignRecommendation: {
          goal: `Publish differentiated content against ${args.competitorName}'s market narrative`,
          audience,
          offer: product,
          publicTopic: `A practical guide to choosing ${product}`,
          contentAngle: `Give ${audience} a clearer, more useful answer than the competitor narrative, grounded in your brand position.`,
          channels: ['blog', 'linkedin'],
          assets: ['blog', 'social_posts'],
          expectedOutcome: 'Win attention on the same topic with a sharper answer grounded in your brand position.',
        },
      };
    case 'growth_signal':
      return {
        counterMove: `Monitor the competitor's growth signal and prepare a positioning update if they start targeting your core audience.`,
        campaignRecommendation: undefined,
      };
    case 'brand_awareness':
      return {
        counterMove: `Use this signal as context for your next market update, but do not overreact unless it affects your target audience or offer.`,
        campaignRecommendation: undefined,
      };
    default:
      return {
        counterMove: `Track this signal and compare it against your current positioning before changing campaign priorities.`,
        campaignRecommendation: undefined,
      };
  }
}

export function enrichMarketSignals(args: {
  competitorId: string;
  competitorName: string;
  signals: Signal[];
  products?: MarketContextEntity[];
  audiences?: MarketContextEntity[];
}): CompetitiveSignal[] {
  const products = args.products ?? [];
  const audiences = args.audiences ?? [];

  return args.signals.map((signal) => {
    const category = classifyCategory(signal);
    const affectedProducts = matchEntities(signal.text, products);
    const affectedAudiences = matchEntities(signal.text, audiences);
    const recommendation = counterMove({
      competitorName: args.competitorName,
      signal,
      category,
      products: affectedProducts,
      audiences: affectedAudiences,
    });

    return {
      ...signal,
      competitorId: args.competitorId,
      competitorName: args.competitorName,
      threatLevel: classifyThreat(signal),
      competitorCategory: category,
      affectedProducts,
      affectedAudiences,
      counterMove: recommendation.counterMove,
      campaignRecommendation: recommendation.campaignRecommendation,
    };
  });
}

export function summarizeCompetitiveStrategy(signals: CompetitiveSignal[]): string {
  const important = signals
    .filter((signal) => signal.threatLevel === 'critical' || signal.threatLevel === 'high')
    .slice(0, 3);
  const source = important.length > 0 ? important : signals.slice(0, 3);

  return source
    .map((signal) => {
      const product = signal.affectedProducts[0] ? ` for ${signal.affectedProducts[0]}` : '';
      return `${signal.competitorName} ${signal.competitorCategory.replace(/_/g, ' ')}${product}: ${signal.counterMove}`;
    })
    .join(' ');
}
