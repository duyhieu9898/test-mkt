import { extractJSON, llmGenerate } from '../lib/llm';
import {
  buildAdvisorContext,
  type AdvisorContext,
} from './advisor-context-builder';

export interface LaunchSuggestion {
  id: string;
  title: string;
  keyword: string;
  brief: string;
  reason: string;
  audience: string;
}

export interface LaunchSuggestionPack {
  suggestions: LaunchSuggestion[];
  contextSummary: string;
  sources: string[];
}

function text(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object'
    ? value as Record<string, any>
    : {};
}

function normalizeSuggestion(value: unknown, index: number): LaunchSuggestion | null {
  const item = record(value);
  const keyword = text(item.keyword, 200);
  const brief = text(item.brief, 1200);
  if (keyword.length < 3 || brief.length < 10) return null;

  return {
    id: `suggestion-${index + 1}`,
    title: text(item.title, 100) || keyword,
    keyword,
    brief,
    reason: text(item.reason, 220) || 'Matches the company profile and current content opportunities.',
    audience: text(item.audience, 160) || 'Your target customers',
  };
}

function fallbackSuggestions(context: AdvisorContext): LaunchSuggestion[] {
  const business = record(context.business);
  const products = Array.isArray(business.products) ? business.products.map(record) : [];
  const personas = Array.isArray(business.personas) ? business.personas.map(record) : [];
  const themes = Array.isArray(record(business.marketingStrategy).themes)
    ? record(business.marketingStrategy).themes.map(record)
    : [];
  const productName = text(products[0]?.name, 80) || 'your services';
  const productBenefit = text(
    products[0]?.description
      || products[0]?.attributes?.benefits?.[0]
      || products[0]?.attributes?.features?.[0],
    180,
  );
  const audience = text(personas[0]?.name || personas[0]?.description, 120) || 'your ideal customers';
  const painPoint = text(
    personas[0]?.attributes?.painPoints?.[0]
      || personas[0]?.attributes?.goals?.[0],
    140,
  );
  const theme = text(themes[0]?.title, 100);
  const gap = text(context.coverageGaps[0], 180);

  const candidates = [
    {
      title: `Help customers discover ${productName}`,
      keyword: `${productName} for ${audience}`,
      brief: `Create a practical campaign for ${audience} that explains how ${productName} helps them${painPoint ? ` address ${painPoint}` : ''}. Focus on clear benefits, useful examples, and a simple next step.`,
      reason: productBenefit || 'Built from the primary product and customer persona in the company profile.',
      audience,
    },
    {
      title: theme ? `Build authority around ${theme}` : `Build trust in ${productName}`,
      keyword: theme || `benefits of ${productName}`,
      brief: `Create an educational campaign that positions the company as a trusted expert. Answer common customer questions, show practical value, and connect the topic naturally to ${productName}.`,
      reason: theme
        ? 'Uses a priority theme from the company marketing strategy.'
        : 'Creates helpful content around the company offering.',
      audience,
    },
    {
      title: `Turn customer interest into action`,
      keyword: `how to choose ${productName}`,
      brief: `Create a decision-stage campaign for ${audience}. Explain what to look for, common mistakes to avoid, and why the company is a strong choice. End with one clear, low-friction call to action.`,
      reason: gap || 'Adds a commercial campaign angle alongside educational content.',
      audience,
    },
  ];

  return candidates.map((item, index) => ({
    id: `suggestion-${index + 1}`,
    ...item,
  }));
}

function sourceLabels(context: AdvisorContext): string[] {
  const labels: string[] = [];
  if (context.business && Object.keys(context.business).length > 0) labels.push('Company profile');
  if (context.counts.brainEvents > 0 || context.counts.learnings > 0) labels.push('Brain Hub');
  if (context.counts.campaigns > 0) labels.push('Past campaigns');
  if (context.counts.blogs > 0) labels.push('Blog library');
  if (context.counts.marketScans > 0) labels.push('Market signals');
  return labels;
}

export async function generateLaunchSuggestions(args: {
  companyId: string;
  tenantId: string;
}): Promise<LaunchSuggestionPack> {
  const context = await buildAdvisorContext(args);
  const sources = sourceLabels(context);
  const promptContext = {
    business: context.business,
    recentCampaigns: context.campaigns.slice(0, 8),
    recentBlogs: context.blogs.slice(0, 10),
    marketSignals: context.marketSignals.slice(0, 5),
    coverageGaps: context.coverageGaps.slice(0, 6),
    evidence: context.evidence.slice(0, 30).map((item) => ({
      sourceType: item.sourceType,
      label: item.label,
      detail: item.detail,
    })),
  };

  let suggestions: LaunchSuggestion[] = [];
  try {
    const response = await llmGenerate(
      [
        {
          role: 'system',
          content: [
            'You are a campaign strategist helping a non-technical small-business owner.',
            'Create exactly 3 distinct, practical campaign ideas grounded only in the supplied company data.',
            'Each idea must be understandable without marketing jargon.',
            'The keyword must resemble a phrase a real customer might search or care about.',
            'The brief must clearly state audience, message angle, value, and desired action.',
            'Do not repeat an existing campaign or blog topic unless proposing a meaningfully different angle.',
            'Return JSON only.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Company context:
${JSON.stringify(promptContext, null, 2)}

Return:
{
  "suggestions": [{
    "title": "Short friendly campaign name",
    "keyword": "specific target phrase",
    "brief": "2-4 sentences describing audience, angle, value and call to action",
    "reason": "One short explanation tied to company data",
    "audience": "Plain-language audience"
  }]
}`,
        },
      ],
      {
        featureKey: 'campaign_launch_suggestions',
        traceName: 'campaign_launcher.suggestions',
        json: true,
        maxTokens: 1800,
        metadata: {
          companyId: args.companyId,
          evidenceCount: context.evidence.length,
        },
      },
    );
    const parsed = extractJSON(response.text);
    const rows = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions
      : Array.isArray(parsed)
        ? parsed
        : [];
    suggestions = rows
      .slice(0, 3)
      .map(normalizeSuggestion)
      .filter((item): item is LaunchSuggestion => Boolean(item));
  } catch (error) {
    console.warn('[campaign-launcher] AI suggestions unavailable, using company fallback:', error);
  }

  if (suggestions.length < 3) {
    const existingKeywords = new Set(suggestions.map((item) => item.keyword.toLowerCase()));
    for (const fallback of fallbackSuggestions(context)) {
      if (suggestions.length >= 3) break;
      if (existingKeywords.has(fallback.keyword.toLowerCase())) continue;
      suggestions.push(fallback);
    }
  }

  return {
    suggestions: suggestions.slice(0, 3).map((suggestion, index) => ({
      ...suggestion,
      id: `suggestion-${index + 1}`,
    })),
    contextSummary: sources.length > 0
      ? `Ideas use ${sources.join(', ')}.`
      : 'Add more company information in Brain Hub to improve future suggestions.',
    sources,
  };
}
