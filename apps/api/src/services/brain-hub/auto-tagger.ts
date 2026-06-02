/**
 * Auto-tagger — single LLM pass per event to extract topic tags +
 * sentiment. Uses the cheapest model (gpt-4o-mini via llmGenerate
 * featureKey 'brain_hub_tag') so per-event cost stays around $0.0001.
 *
 * Returns safe defaults on any LLM failure — the event still ingests,
 * watchers (Phase B) just won't match on tags until a future re-tag run.
 */
import { llmGenerate, extractJSON } from '../../lib/llm';
import type { EventSentiment } from '@1person/core/db';

export interface AutoTagResult {
  topicTags: string[];
  sentiment: EventSentiment | null;
}

const PROMPT = `You are tagging a single business event for a B2B company's "Brain Hub".
Return JSON ONLY in this exact shape:
{
  "topic_tags": ["tag1", "tag2"],   // 1-3 short lowercase noun phrases, no hashtags
  "sentiment": "positive" | "negative" | "neutral" | "question" | "objection" | "praise"
}

Guidance:
- topic_tags should be the SUBJECT MATTER (e.g. "pricing", "competitor alchemy", "checkout bug"), not the action ("asked", "complained").
- sentiment "question" beats "neutral" if the event is asking something.
- sentiment "objection" if the event raises a concern that blocks a purchase.
- sentiment "praise" if the event is unsolicited positive feedback about the product.
- Use "neutral" only when none of the others fit.`;

export async function autoTag(input: { subject: string; content: string }): Promise<AutoTagResult> {
  const userMsg = `Subject: ${input.subject}\n\nContent:\n${input.content.slice(0, 4000)}`;

  try {
    const res = await llmGenerate(
      [
        { role: 'system', content: PROMPT },
        { role: 'user', content: userMsg },
      ],
      {
        featureKey: 'brain_hub_tag',
        tier: 'fast',
        json: true,
        maxTokens: 200,
        traceName: 'brain_hub.auto_tag',
      },
    );

    const parsed = extractJSON(res.text);
    if (!parsed) return { topicTags: [], sentiment: null };

    const rawTags = Array.isArray(parsed.topic_tags) ? parsed.topic_tags : [];
    const topicTags = rawTags
      .filter((t: unknown): t is string => typeof t === 'string' && t.length > 0)
      .map((t: string) => t.toLowerCase().trim())
      .slice(0, 3);

    const sentiment = isValidSentiment(parsed.sentiment) ? parsed.sentiment : null;

    return { topicTags, sentiment };
  } catch {
    return { topicTags: [], sentiment: null };
  }
}

function isValidSentiment(value: unknown): value is EventSentiment {
  return (
    value === 'positive' ||
    value === 'negative' ||
    value === 'neutral' ||
    value === 'question' ||
    value === 'objection' ||
    value === 'praise'
  );
}
