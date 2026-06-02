/**
 * Content Grader — Block 4 (Real-time Semantic Grader).
 *
 * Given a chunk of content + a target keyword, computes a 0-100 score
 * across 5 sub-dimensions plus a ranked list of concrete suggestions
 * the founder can apply to improve the page before publish.
 *
 *   1. entity_coverage         — % of top-SERP entities present in content
 *   2. topic_coverage          — does the content cover the topic fully (LLM judge)
 *   3. brand_voice             — match against company's brand voice (if set)
 *   4. ai_citation_likelihood  — heuristic: structured paragraphs, Q&A, schema-friendly
 *   5. readability             — Flesch reading ease approximation
 *
 * Parity target: Surfer SEO Content Editor, Clearscope, Frase.
 */

import { db } from '../lib/db';
import { contentGrades } from '@1person/core/db';
import type { GradeBreakdown, GradeSuggestion, GradeSeverity } from '@1person/core/db';
import { llmGenerate, extractJSON } from '../lib/llm';
import { getTopSerpResults } from './serp-scraper';
import { buildBusinessContext } from './business-context';

export interface GradeResult {
  id: string;
  score: number;
  breakdown: GradeBreakdown;
  suggestions: GradeSuggestion[];
  missingEntities: string[];
  serpEntities: string[];
  createdAt: string;
}

// ─── Sub-score helpers ─────────────────────────────────────────────

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  const matches = word.match(/[aeiouy]+/g);
  let syl = matches ? matches.length : 1;
  if (word.endsWith('e') && syl > 1) syl -= 1;
  return Math.max(1, syl);
}

function fleschScore(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) || []).length);
  const words = tokenize(text);
  const wordCount = Math.max(1, words.length);
  const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
  // Flesch Reading Ease: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
  const score = 206.835 - 1.015 * (wordCount / sentences) - 84.6 * (syllables / wordCount);
  // Clamp to 0-100 for grading
  return Math.max(0, Math.min(100, Math.round(score)));
}

function entityCoverageScore(content: string, serpEntities: string[]): { score: number; missing: string[] } {
  if (serpEntities.length === 0) return { score: 60, missing: [] };
  const lower = content.toLowerCase();
  const missing: string[] = [];
  let hit = 0;
  for (const e of serpEntities) {
    const eLower = e.toLowerCase().trim();
    if (!eLower) continue;
    if (lower.includes(eLower)) hit += 1;
    else missing.push(e);
  }
  const pct = Math.round((hit / serpEntities.length) * 100);
  return { score: pct, missing };
}

function citationLikelihoodScore(content: string): number {
  // Structured content scores higher in AI overviews: question headings,
  // short scannable paragraphs, numbered/bulleted lists.
  const lines = content.split(/\n+/);
  const paras = lines.filter((l) => l.trim().length > 0);
  const avgParaLen = paras.length
    ? paras.reduce((s, p) => s + tokenize(p).length, 0) / paras.length
    : 0;
  const hasHeadings = /^#{1,6}\s|^[A-Z][^.\n]{6,80}\?$/m.test(content);
  const hasQuestions = (content.match(/\?/g) || []).length >= 2;
  const hasLists = /(^|\n)\s*([-*]|\d+\.)\s+/.test(content);

  let score = 40;
  if (hasHeadings) score += 15;
  if (hasQuestions) score += 15;
  if (hasLists) score += 15;
  if (avgParaLen > 0 && avgParaLen <= 60) score += 15;
  else if (avgParaLen > 100) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function brandVoiceScore(content: string, brandVoice: string[]): number {
  if (!brandVoice.length || (brandVoice.length === 1 && brandVoice[0] === 'professional')) {
    // No real brand profile — neutral baseline so we never block on missing data.
    return 60;
  }
  const lower = content.toLowerCase();
  let hits = 0;
  for (const v of brandVoice) {
    if (lower.includes(v.toLowerCase())) hits += 1;
  }
  // Presence of voice keywords is a weak signal; LLM judge below adds rigor.
  return Math.min(100, 55 + hits * 10);
}

// ─── LLM judge for topic coverage + extra suggestions ──────────────

async function llmJudge(args: {
  content: string;
  targetKeyword: string;
  serpEntities: string[];
  brandVoice: string[];
}): Promise<{ topicCoverage: number; suggestions: GradeSuggestion[] }> {
  const prompt = `You are a senior SEO + content quality editor. Grade the draft below for the target keyword "${args.targetKeyword}".

Top-SERP entities competitors cover: ${args.serpEntities.slice(0, 20).join(', ') || '(none)'}
Brand voice cues: ${args.brandVoice.join(', ') || 'neutral'}

DRAFT:
"""
${args.content.slice(0, 6000)}
"""

Return ONLY valid JSON:
{
  "topic_coverage": <0-100 integer: how comprehensively does the draft cover the topic vs what competitors cover>,
  "suggestions": [
    {"category": "entity|structure|voice|hook|depth|cta", "severity": "high|medium|low", "text": "concrete actionable suggestion, 1 sentence"}
  ]
}

Return 4-7 suggestions, ranked by severity (high first). Each suggestion must be specific (mention which section/paragraph/missing entity) — no generic advice like "improve SEO".`;

  try {
    const { text } = await llmGenerate(
      [{ role: 'user', content: prompt }],
      { featureKey: 'content_grade', maxTokens: 1500 }
    );
    const parsed = extractJSON(text);
    if (!parsed) return { topicCoverage: 50, suggestions: [] };
    const topic = Number(parsed.topic_coverage);
    const suggestions: GradeSuggestion[] = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter((s: any) => s && typeof s.text === 'string')
          .slice(0, 7)
          .map((s: any) => ({
            category: typeof s.category === 'string' ? s.category : 'general',
            severity: (['high', 'medium', 'low'].includes(s.severity) ? s.severity : 'medium') as GradeSeverity,
            text: String(s.text).slice(0, 280),
          }))
      : [];
    return {
      topicCoverage: Number.isFinite(topic) ? Math.max(0, Math.min(100, Math.round(topic))) : 50,
      suggestions,
    };
  } catch (err) {
    console.warn('[content-grader] LLM judge failed:', err);
    return { topicCoverage: 50, suggestions: [] };
  }
}

// ─── Main entry point ──────────────────────────────────────────────

export async function gradeContent(args: {
  companyId: string;
  contentText: string;
  targetKeyword: string;
}): Promise<GradeResult> {
  const { companyId, contentText, targetKeyword } = args;

  if (!contentText.trim()) throw new Error('Content is empty');
  if (!targetKeyword.trim()) throw new Error('Target keyword is required');

  // 1. SERP + brand context in parallel.
  const [serp, ctx] = await Promise.all([
    getTopSerpResults(targetKeyword, 10),
    buildBusinessContext(companyId).catch(() => null),
  ]);

  // 2. Aggregate SERP entities (dedupe, keep most frequent first).
  const entityFreq = new Map<string, number>();
  for (const r of serp) {
    for (const e of r.entities_extracted) {
      const k = e.trim();
      if (!k) continue;
      entityFreq.set(k, (entityFreq.get(k) || 0) + 1);
    }
  }
  const serpEntities = Array.from(entityFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, 25);

  // 3. Heuristic sub-scores.
  const { score: entityScore, missing } = entityCoverageScore(contentText, serpEntities);
  const citation = citationLikelihoodScore(contentText);
  const readability = fleschScore(contentText);
  const voice = brandVoiceScore(contentText, ctx?.brandVoice ?? []);

  // 4. LLM judge for topic coverage + qualitative suggestions.
  const { topicCoverage, suggestions: llmSuggestions } = await llmJudge({
    content: contentText,
    targetKeyword,
    serpEntities,
    brandVoice: ctx?.brandVoice ?? [],
  });

  // 5. Compose final suggestions: top missing entities first (high severity),
  //    then LLM-generated qualitative ones.
  const entitySuggestions: GradeSuggestion[] = missing.slice(0, 4).map((e) => {
    const freq = entityFreq.get(e) || 1;
    return {
      category: 'entity',
      severity: (freq >= 5 ? 'high' : freq >= 3 ? 'medium' : 'low') as GradeSeverity,
      text: `Add a section about "${e}" — appears in ${freq}/${serp.length} top-ranking results.`,
    };
  });
  const allSuggestions: GradeSuggestion[] = [...entitySuggestions, ...llmSuggestions]
    .slice(0, 10);

  // 6. Weighted overall score. Weights chosen to match founder-impact priority:
  //    topic + entity coverage dominate, brand voice + citation are amplifiers,
  //    readability is a tie-breaker.
  const breakdown: GradeBreakdown = {
    entity_coverage: entityScore,
    topic_coverage: topicCoverage,
    brand_voice: voice,
    ai_citation_likelihood: citation,
    readability,
  };
  const overall = Math.round(
    breakdown.entity_coverage * 0.3 +
      breakdown.topic_coverage * 0.3 +
      breakdown.brand_voice * 0.15 +
      breakdown.ai_citation_likelihood * 0.15 +
      breakdown.readability * 0.1
  );

  // 7. Persist for past-grades panel.
  const inserted = await db
    .insert(contentGrades)
    .values({
      companyId,
      contentText,
      targetKeyword,
      score: overall,
      breakdown,
      suggestions: allSuggestions,
    })
    .returning();
  const saved = inserted[0];
  if (!saved) throw new Error('Failed to persist grade');

  return {
    id: saved.id,
    score: overall,
    breakdown,
    suggestions: allSuggestions,
    missingEntities: missing.slice(0, 10),
    serpEntities: serpEntities.slice(0, 15),
    createdAt: saved.createdAt.toISOString(),
  };
}
