/**
 * Content Autopilot (P8) — daily, unattended blog generation for a company.
 *
 * When enabled, it draws the next topic from `keywordQueue`, runs the Campaign
 * Launcher (blog → images → WordPress DRAFT → GEO seed → optional social drafts),
 * rotates the keyword into `usedKeywords`, and schedules the next run from the
 * cadence (`postsPerDay`). Default mode = WP draft, so a human approves in
 * WordPress before anything goes public (human-in-the-loop).
 *
 * Only companies that explicitly turned autopilot ON are ever touched.
 */
import { and, eq, lte, isNotNull } from 'drizzle-orm';
import { db } from '../lib/db';
import { contentAutopilot, type ContentAutopilot, type AutopilotTargets } from '@1person/core/db';
import { startLaunch } from './launch-orchestrator';

const DEFAULT_TARGETS: AutopilotTargets = { wordpress: true, facebook: false, linkedin: false, instagram: false };

/** Hours between posts, derived from cadence (1-4/day supported). */
function intervalMs(postsPerDay: number): number {
  const perDay = Math.min(Math.max(postsPerDay, 1), 4);
  return Math.round((24 / perDay) * 60 * 60 * 1000);
}

export async function getAutopilot(companyId: string): Promise<ContentAutopilot | null> {
  const row = await db.query.contentAutopilot.findFirst({
    where: eq(contentAutopilot.companyId, companyId),
  });
  return row ?? null;
}

export interface AutopilotPatch {
  enabled?: boolean;
  postsPerDay?: number;
  targets?: AutopilotTargets;
  mode?: 'draft' | 'autopublish';
  keywordQueue?: string[];
}

export async function upsertAutopilot(companyId: string, patch: AutopilotPatch): Promise<ContentAutopilot> {
  const existing = await getAutopilot(companyId);

  // When (re)enabling, schedule the first AUTO run one interval out — the founder
  // can use "Run now" to test immediately without waiting.
  const willBeEnabled = patch.enabled ?? existing?.enabled ?? false;
  const perDay = patch.postsPerDay ?? existing?.postsPerDay ?? 1;
  let nextRunAt = existing?.nextRunAt ?? null;
  if (willBeEnabled && (!existing?.enabled || patch.postsPerDay)) {
    nextRunAt = new Date(Date.now() + intervalMs(perDay));
  }
  if (!willBeEnabled) nextRunAt = null;

  if (existing) {
    const [updated] = await db
      .update(contentAutopilot)
      .set({
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.postsPerDay !== undefined ? { postsPerDay: perDay } : {}),
        ...(patch.targets !== undefined ? { targets: patch.targets } : {}),
        ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
        ...(patch.keywordQueue !== undefined ? { keywordQueue: patch.keywordQueue } : {}),
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(contentAutopilot.companyId, companyId))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(contentAutopilot)
    .values({
      companyId,
      enabled: willBeEnabled,
      postsPerDay: perDay,
      targets: patch.targets ?? DEFAULT_TARGETS,
      mode: patch.mode ?? 'draft',
      keywordQueue: patch.keywordQueue ?? [],
      usedKeywords: [],
      nextRunAt,
    })
    .returning();
  return created!;
}

export interface RunOnceResult {
  ran: boolean;
  reason?: string;
  keyword?: string;
  launchId?: string;
}

/**
 * Generate ONE post for a company right now (used by both the "Run now" button
 * and the scheduler). Pops the next keyword, fires a launch, rotates the queue,
 * and advances nextRunAt.
 */
export async function runAutopilotOnce(companyId: string, opts: { manual?: boolean } = {}): Promise<RunOnceResult> {
  const cfg = await getAutopilot(companyId);
  if (!cfg) return { ran: false, reason: 'Autopilot not configured' };
  if (!opts.manual && !cfg.enabled) return { ran: false, reason: 'Autopilot is off' };

  const queue = [...cfg.keywordQueue];
  if (queue.length === 0) {
    return { ran: false, reason: 'No keywords left in the queue — add more topics.' };
  }
  const keyword = queue.shift()!;

  const { launchId } = await startLaunch({
    companyId,
    keyword,
    targets: cfg.targets,
    source: 'autopilot',
  });

  const now = new Date();
  await db
    .update(contentAutopilot)
    .set({
      keywordQueue: queue,
      usedKeywords: [...cfg.usedKeywords, keyword],
      lastRunAt: now,
      nextRunAt: cfg.enabled ? new Date(now.getTime() + intervalMs(cfg.postsPerDay)) : cfg.nextRunAt,
      updatedAt: now,
    })
    .where(eq(contentAutopilot.companyId, companyId));

  return { ran: true, keyword, launchId };
}

/**
 * Scheduler entry — run every due autopilot. Called on an interval by the API
 * boot scheduler. Touches ONLY companies with autopilot enabled and due.
 */
export async function runDueAutopilots(): Promise<{ triggered: number }> {
  const due = await db
    .select({ companyId: contentAutopilot.companyId })
    .from(contentAutopilot)
    .where(
      and(
        eq(contentAutopilot.enabled, true),
        isNotNull(contentAutopilot.nextRunAt),
        lte(contentAutopilot.nextRunAt, new Date()),
      ),
    );

  let triggered = 0;
  for (const { companyId } of due) {
    try {
      const res = await runAutopilotOnce(companyId);
      if (res.ran) triggered++;
    } catch (e) {
      console.error(`[autopilot] run failed for company ${companyId}:`, (e as Error).message);
    }
  }
  return { triggered };
}
