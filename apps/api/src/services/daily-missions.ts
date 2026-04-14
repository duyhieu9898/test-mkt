/**
 * Daily Missions Service — CEO Motivation Engine
 *
 * Generates 3–5 daily missions from the latest CEO Advisor brief.
 * Falls back to Growth Score gap-based missions when no brief exists.
 * Manages mission completion and streak tracking.
 */

import { db } from '../lib/db';
import { eq, and } from 'drizzle-orm';
import {
  ceoDailyMissions,
  ceoStreaks,
  type Mission,
  type MissionCategory,
} from '@1person/core/db';
import { getTenantAI } from '../lib/tenant-ai';
import { computeGrowthScore, type GrowthScoreResult } from './growth-score';
import { randomUUID } from 'crypto';

// === Types ===

interface MissionsResult {
  id: string;
  date: string;
  missions: Mission[];
  completedCount: number;
  totalCount: number;
}

interface StreakResult {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  totalMissionsCompleted: number;
}

// === Helpers ===

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0]!;
}

/** Map CEO Advisor brief action link (e.g. "/campaigns") to mission category */
function linkToCategory(link?: string): MissionCategory {
  if (!link) return 'growth';
  if (link.includes('campaign')) return 'growth';
  if (link.includes('landing') || link.includes('knowledge') || link.includes('blog')) return 'content';
  if (link.includes('brain') || link.includes('agent')) return 'automation';
  if (link.includes('sale') || link.includes('lead') || link.includes('market')) return 'revenue';
  return 'optimization';
}

// === Gap-based fallback missions (zero LLM cost) ===

function generateFallbackMissions(score: GrowthScoreResult, companyId: string): Mission[] {
  const missions: Mission[] = [];
  const prefix = `/${companyId}`;

  const scored = [
    { key: 'marketing' as const, score: score.subscores.marketing.score },
    { key: 'seo' as const, score: score.subscores.seo.score },
    { key: 'automation' as const, score: score.subscores.automation.score },
    { key: 'revenue' as const, score: score.subscores.revenue.score },
  ].sort((a, b) => a.score - b.score);

  const missionTemplates: Record<string, Mission[]> = {
    marketing: [
      { id: randomUUID(), title: 'Create your first campaign', why: 'Campaigns drive traffic and leads to your business.', impact: 'Potential +500 visitors/month', category: 'growth', link: `${prefix}/campaigns`, status: 'pending', completedAt: null },
      { id: randomUUID(), title: 'Publish a landing page', why: 'Every campaign needs a destination to convert visitors.', impact: '+20% conversion potential', category: 'content', link: `${prefix}/landing-pages`, status: 'pending', completedAt: null },
    ],
    seo: [
      { id: randomUUID(), title: 'Add knowledge to your AI brain', why: 'More knowledge = better content and advice from AI.', impact: 'Improves all AI outputs', category: 'content', link: `${prefix}/knowledge`, status: 'pending', completedAt: null },
      { id: randomUUID(), title: 'Generate an SEO blog post', why: 'Consistent content builds organic traffic over time.', impact: 'Potential +200 organic visits/month', category: 'content', link: `${prefix}/blog`, status: 'pending', completedAt: null },
    ],
    automation: [
      { id: randomUUID(), title: 'Review your AI agent team', why: 'Ensure your agents are active and performing well.', impact: 'Optimize task throughput', category: 'automation', link: `${prefix}/agents`, status: 'pending', completedAt: null },
      { id: randomUUID(), title: 'Check task completion status', why: 'Monitor which tasks succeeded and which need attention.', impact: 'Reduce failed task rate', category: 'automation', link: `${prefix}/tasks`, status: 'pending', completedAt: null },
    ],
    revenue: [
      { id: randomUUID(), title: 'Add a competitor to track', why: 'Understanding your market helps AI make better recommendations.', impact: 'Better market positioning', category: 'revenue', link: `${prefix}/market`, status: 'pending', completedAt: null },
      { id: randomUUID(), title: 'Review your lead pipeline', why: 'Following up on leads drives revenue.', impact: 'Potential new deals', category: 'revenue', link: `${prefix}/sales`, status: 'pending', completedAt: null },
    ],
  };

  // Lowest score area gets 2 missions, others get 1
  const lowest = scored[0]!;
  const lowMissions = missionTemplates[lowest.key] ?? [];
  missions.push(...lowMissions.slice(0, 2));

  for (let i = 1; i < scored.length && missions.length < 4; i++) {
    const area = scored[i]!;
    const areaMissions = missionTemplates[area.key] ?? [];
    const first = areaMissions[0];
    if (first) {
      missions.push(first);
    }
  }

  return missions.slice(0, 5);
}

// === Core functions ===

export async function getDailyMissions(
  companyId: string,
  tenantId: string,
): Promise<MissionsResult> {
  const today = todayStr();

  // Check if today's missions exist
  const existing = await db
    .select()
    .from(ceoDailyMissions)
    .where(and(eq(ceoDailyMissions.companyId, companyId), eq(ceoDailyMissions.date, today)))
    .limit(1);

  const row = existing[0];
  if (row) {
    return {
      id: row.id,
      date: today,
      missions: row.missions,
      completedCount: row.completedCount,
      totalCount: row.totalCount,
    };
  }

  // Generate new missions for today
  return generateDailyMissions(companyId, tenantId);
}

async function generateDailyMissions(
  companyId: string,
  tenantId: string,
): Promise<MissionsResult> {
  const today = todayStr();
  let missions: Mission[] = [];
  let briefId: string | null = null;

  // Try to derive missions from latest CEO Advisor brief
  try {
    const brief = await getTenantAI().ceoAdvisor.latest(tenantId);
    if (brief && brief.actions && brief.actions.length > 0) {
      briefId = brief.id;
      missions = brief.actions.slice(0, 5).map((action) => ({
        id: randomUUID(),
        title: action.title,
        why: action.why,
        impact: action.impact ?? 'Improves your business',
        category: linkToCategory(action.link),
        link: action.link ?? `/${companyId}/insights`,
        status: 'pending' as const,
        completedAt: null,
      }));
    }
  } catch {
    // Brief not available, fall through to fallback
  }

  // Fallback: generate from Growth Score gaps
  if (missions.length === 0) {
    const score = await computeGrowthScore(companyId);
    missions = generateFallbackMissions(score, companyId);
  }

  // Save to DB
  const rows = await db
    .insert(ceoDailyMissions)
    .values({
      companyId,
      date: today,
      missions,
      completedCount: 0,
      totalCount: missions.length,
      sourceAdvisorBriefId: briefId,
    })
    .onConflictDoNothing()
    .returning();

  const inserted = rows[0];

  // Handle race condition: re-read if conflict
  if (!inserted) {
    return getDailyMissions(companyId, tenantId);
  }

  return {
    id: inserted.id,
    date: today,
    missions: inserted.missions,
    completedCount: inserted.completedCount,
    totalCount: inserted.totalCount,
  };
}

export async function completeMission(
  companyId: string,
  missionId: string,
): Promise<{ mission: Mission; streak: StreakResult }> {
  const today = todayStr();

  const rows = await db
    .select()
    .from(ceoDailyMissions)
    .where(and(eq(ceoDailyMissions.companyId, companyId), eq(ceoDailyMissions.date, today)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error('No missions for today');
  }

  const missions: Mission[] = [...row.missions];
  const idx = missions.findIndex((m) => m.id === missionId);
  if (idx === -1) throw new Error('Mission not found');

  const current = missions[idx]!;
  if (current.status === 'completed') throw new Error('Mission already completed');

  const updated: Mission = {
    ...current,
    status: 'completed',
    completedAt: new Date().toISOString(),
  };
  missions[idx] = updated;

  const completedCount = missions.filter((m) => m.status === 'completed').length;

  await db
    .update(ceoDailyMissions)
    .set({ missions, completedCount, updatedAt: new Date() })
    .where(eq(ceoDailyMissions.id, row.id));

  // Update streak
  const streak = await updateStreak(companyId);

  return { mission: updated, streak };
}

export async function skipMission(
  companyId: string,
  missionId: string,
): Promise<Mission> {
  const today = todayStr();

  const rows = await db
    .select()
    .from(ceoDailyMissions)
    .where(and(eq(ceoDailyMissions.companyId, companyId), eq(ceoDailyMissions.date, today)))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error('No missions for today');

  const missions: Mission[] = [...row.missions];
  const idx = missions.findIndex((m) => m.id === missionId);
  if (idx === -1) throw new Error('Mission not found');

  const updated: Mission = { ...missions[idx]!, status: 'skipped' };
  missions[idx] = updated;

  await db
    .update(ceoDailyMissions)
    .set({ missions, updatedAt: new Date() })
    .where(eq(ceoDailyMissions.id, row.id));

  return updated;
}

// === Streak management ===

async function updateStreak(companyId: string): Promise<StreakResult> {
  const today = todayStr();
  const yesterday = yesterdayStr();

  const existing = await db
    .select()
    .from(ceoStreaks)
    .where(eq(ceoStreaks.companyId, companyId))
    .limit(1);

  const streak = existing[0];

  if (!streak) {
    // First ever completion — create streak record
    const inserted = await db
      .insert(ceoStreaks)
      .values({
        companyId,
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: today,
        totalMissionsCompleted: 1,
        weeklyCompletionRates: [],
      })
      .returning();

    const created = inserted[0]!;
    return {
      currentStreak: created.currentStreak,
      longestStreak: created.longestStreak,
      lastActiveDate: today,
      totalMissionsCompleted: created.totalMissionsCompleted,
    };
  }

  let newStreak = streak.currentStreak;

  if (streak.lastActiveDate === today) {
    // Already active today, just increment total
  } else if (streak.lastActiveDate === yesterday) {
    // Consecutive day — extend streak
    newStreak = streak.currentStreak + 1;
  } else {
    // Streak broken — reset to 1
    newStreak = 1;
  }

  const newLongest = Math.max(streak.longestStreak, newStreak);
  const newTotal = streak.totalMissionsCompleted + 1;

  await db
    .update(ceoStreaks)
    .set({
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastActiveDate: today,
      totalMissionsCompleted: newTotal,
      updatedAt: new Date(),
    })
    .where(eq(ceoStreaks.id, streak.id));

  return {
    currentStreak: newStreak,
    longestStreak: newLongest,
    lastActiveDate: today,
    totalMissionsCompleted: newTotal,
  };
}

export async function getStreak(companyId: string): Promise<StreakResult> {
  const rows = await db
    .select()
    .from(ceoStreaks)
    .where(eq(ceoStreaks.companyId, companyId))
    .limit(1);

  const streak = rows[0];
  if (!streak) {
    return { currentStreak: 0, longestStreak: 0, lastActiveDate: null, totalMissionsCompleted: 0 };
  }

  // Check if streak is still active (last active was today or yesterday)
  const today = todayStr();
  const yesterday = yesterdayStr();
  const stillActive = streak.lastActiveDate === today || streak.lastActiveDate === yesterday;

  return {
    currentStreak: stillActive ? streak.currentStreak : 0,
    longestStreak: streak.longestStreak,
    lastActiveDate: streak.lastActiveDate,
    totalMissionsCompleted: streak.totalMissionsCompleted,
  };
}
