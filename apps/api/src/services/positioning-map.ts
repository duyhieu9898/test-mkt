/**
 * Positioning Map Service
 *
 * Generates a 2D positioning map (you + competitors) using:
 *   - Industry-aware axes chosen by the LLM
 *   - Business context for "you"
 *   - Competitor profiles from scan data
 *
 * Output is designed to render as a scatter plot on the frontend.
 */

import { buildBusinessContext } from './business-context';
import { llmGenerate, extractJSON } from '../lib/llm';
import { getTenantAI } from '../lib/tenant-ai';

export interface PositioningPoint {
  id: string; // 'you' or competitor id
  name: string;
  x: number; // 0–100
  y: number; // 0–100
  isYou: boolean;
  note: string;
}

export interface PositioningMap {
  xAxis: { label: string; lowLabel: string; highLabel: string };
  yAxis: { label: string; lowLabel: string; highLabel: string };
  points: PositioningPoint[];
  insight: string;
  recommendation: string;
  generatedAt: string;
  model: string;
}

function clamp(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : typeof n === 'string' ? parseFloat(n) : NaN;
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export async function generatePositioningMap(args: {
  companyId: string;
  tenantId: string;
}): Promise<PositioningMap> {
  const { companyId, tenantId } = args;
  const ai = getTenantAI();
  const ctx = await buildBusinessContext(companyId, 'admin');
  const competitors = await ai.market.listCompetitors(tenantId);

  const competitorBlob = competitors.length
    ? competitors
        .slice(0, 8)
        .map((c) => {
          const topSignal = c.latestSignals[0]?.text?.slice(0, 120) ?? '';
          return `- [id=${c.id}] ${c.name}${c.url ? ` (${c.url})` : ''}${topSignal ? ` — ${topSignal}` : ''}`;
        })
        .join('\n')
    : '(no competitors tracked)';

  const prompt = `You are a strategy consultant drawing a 2D positioning map for a CEO.

YOUR COMPANY:
- Name: ${ctx.companyName || 'Unknown'}
- Industry: ${ctx.industry || 'Unknown'}
- Description: ${ctx.description || 'N/A'}
- Products: ${ctx.products.slice(0, 3).join(' | ') || 'N/A'}
- Target audience: ${ctx.targetAudience.slice(0, 3).join(' | ') || 'N/A'}

COMPETITORS:
${competitorBlob}

Task:
1. Pick the TWO most relevant axes for this industry (e.g. Price vs Quality, B2C vs B2B, Specialist vs Generalist). Axes should be meaningful discriminators, not generic.
2. Place each company (including YOU) on these axes using a 0–100 scale.
3. Write a 1-sentence insight about where YOU sit relative to competitors, and 1 concrete recommendation.

Return ONLY valid JSON with this exact shape:
{
  "xAxis": {"label": "Axis name", "lowLabel": "Low end label", "highLabel": "High end label"},
  "yAxis": {"label": "Axis name", "lowLabel": "Low end label", "highLabel": "High end label"},
  "points": [
    {"id": "you", "name": "Your company name", "x": 70, "y": 40, "isYou": true, "note": "1-line explanation"},
    {"id": "<competitor_id>", "name": "Competitor name", "x": 30, "y": 80, "isYou": false, "note": "1-line explanation"}
  ],
  "insight": "1 sentence about your positioning",
  "recommendation": "1 sentence actionable move"
}

IMPORTANT: Use the exact competitor id values from the list above (e.g. "id=..." — copy just the UUID). Always include a point with id="you".`;

  const response = await llmGenerate(
    [{ role: 'user', content: prompt }],
    { featureKey: 'positioning_map', maxTokens: 2000 }
  );

  const parsed = extractJSON(response.text) as Record<string, unknown> | null;
  if (!parsed) throw new Error('LLM did not return a valid positioning map');

  const axis = (v: unknown, fallbackLabel: string) => {
    const a = (v ?? {}) as Record<string, unknown>;
    return {
      label: typeof a.label === 'string' ? a.label : fallbackLabel,
      lowLabel: typeof a.lowLabel === 'string' ? a.lowLabel : 'Low',
      highLabel: typeof a.highLabel === 'string' ? a.highLabel : 'High',
    };
  };

  const knownIds = new Set([...competitors.map((c) => c.id), 'you']);

  const rawPoints = Array.isArray(parsed.points) ? parsed.points : [];
  const points: PositioningPoint[] = [];

  for (const p of rawPoints) {
    if (!p || typeof p !== 'object') continue;
    const item = p as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : '';
    if (!id || !knownIds.has(id)) continue;

    const name = typeof item.name === 'string' ? item.name : id === 'you' ? ctx.companyName || 'You' : id;
    points.push({
      id,
      name,
      x: clamp(item.x, 50),
      y: clamp(item.y, 50),
      isYou: item.isYou === true || id === 'you',
      note: typeof item.note === 'string' ? item.note.slice(0, 200) : '',
    });
  }

  // Ensure "you" point exists even if LLM forgot
  if (!points.some((p) => p.isYou)) {
    points.unshift({
      id: 'you',
      name: ctx.companyName || 'You',
      x: 50,
      y: 50,
      isYou: true,
      note: '(default position — AI did not place you)',
    });
  }

  return {
    xAxis: axis(parsed.xAxis, 'Dimension X'),
    yAxis: axis(parsed.yAxis, 'Dimension Y'),
    points,
    insight: typeof parsed.insight === 'string' ? parsed.insight : '',
    recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : '',
    generatedAt: new Date().toISOString(),
    model: response.model,
  };
}
