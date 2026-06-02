/**
 * Watcher evaluator — given a company, check every active watcher
 * against recent events, fire those whose condition matches, write a
 * Reaction row, respect cooldown.
 *
 * Called in two modes:
 *   1. event-driven — after every ingestEvent (cheap because each
 *      watcher is a single indexed query)
 *   2. on-demand — "Run all watchers now" button in the UI
 *
 * No cron. The user's memory `feedback_no_background_crons` explicitly
 * rules out background polling for user data. Event-driven + manual
 * is the same UX with zero idle cost.
 */
import { and, eq, gte, sql, desc } from 'drizzle-orm';
import { db } from '../../lib/db';
import {
  brainWatchers,
  brainReactions,
  dataEvents,
  dataSources,
  type BrainWatcher,
  type DataEvent,
  type WatcherCondition,
} from '@1person/core/db';
import { composeReaction } from './reaction-composer';

export interface EvaluateResult {
  watcherId: string;
  watcherName: string;
  fired: boolean;
  reactionId?: string;
  reason?: string;
}

/**
 * Evaluate every active watcher for a company. Returns one entry per
 * watcher checked, regardless of fire.
 */
export async function evaluateAllWatchers(companyId: string): Promise<EvaluateResult[]> {
  const watchers = await db.query.brainWatchers.findMany({
    where: and(
      eq(brainWatchers.companyId, companyId),
      eq(brainWatchers.status, 'active'),
    ),
  });
  const results: EvaluateResult[] = [];
  for (const w of watchers) {
    const r = await evaluateOne(w);
    results.push(r);
  }
  return results;
}

/**
 * Lightweight evaluator triggered from `ingestEvent` — same logic but
 * fire-and-forget; swallows errors so it never breaks the write path.
 */
export async function evaluateAfterIngest(companyId: string): Promise<void> {
  try {
    await evaluateAllWatchers(companyId);
  } catch (err) {
    console.warn('[brain-hub] evaluateAfterIngest failed:', err);
  }
}

/* ─── Per-watcher logic ────────────────────────────────────────── */

async function evaluateOne(w: BrainWatcher): Promise<EvaluateResult> {
  const groups = await matchGroups(w);
  if (groups.length === 0) {
    return { watcherId: w.id, watcherName: w.name, fired: false, reason: 'no match' };
  }

  // For watchers that produce multiple group matches (e.g. several
  // recurring topics at once), fire one reaction per group. Cooldown
  // is per (watcherId, groupKey).
  let lastReactionId: string | undefined;
  for (const g of groups) {
    if (await isInCooldown(w.id, w.companyId, g.key, w.cooldownHours)) continue;

    const composed = await composeReaction({
      watcher: w,
      groupKey: g.key,
      events: g.events,
    });

    const [row] = await db
      .insert(brainReactions)
      .values({
        companyId: w.companyId,
        watcherId: w.id,
        groupKey: g.key.slice(0, 200),
        headline: composed.headline.slice(0, 250),
        summary: composed.summary,
        triggerEventIds: g.events.slice(0, 20).map((e) => e.id),
        drafts: composed.drafts,
        status: 'suggested',
      })
      .returning({ id: brainReactions.id });

    if (row) lastReactionId = row.id;

    await db
      .update(brainWatchers)
      .set({
        lastFiredAt: new Date(),
        fireCount: (w.fireCount ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(brainWatchers.id, w.id));
  }

  return {
    watcherId: w.id,
    watcherName: w.name,
    fired: !!lastReactionId,
    reactionId: lastReactionId,
  };
}

interface MatchGroup {
  key: string;
  events: DataEvent[];
}

async function matchGroups(w: BrainWatcher): Promise<MatchGroup[]> {
  const cond = w.condition;
  const since = new Date(Date.now() - cond.windowHours * 60 * 60 * 1000);

  switch (cond.kind) {
    case 'recurring_topic':
      return matchRecurringTopic(w, cond, since);
    case 'event_spike':
      return matchEventSpike(w, cond, since);
    case 'keyword_match':
      return matchKeyword(w, cond, since);
  }
}

async function matchRecurringTopic(
  w: BrainWatcher,
  cond: Extract<WatcherCondition, { kind: 'recurring_topic' }>,
  since: Date,
): Promise<MatchGroup[]> {
  const events = await fetchEvents(w.companyId, since, {
    sentiment: cond.sentiment,
    sourceSubtypes: cond.sourceSubtypes,
  });
  if (events.length === 0) return [];

  // Group by each topic tag — an event with 2 tags counts toward both.
  const byTag = new Map<string, DataEvent[]>();
  for (const e of events) {
    for (const tag of e.topicTags ?? []) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push(e);
    }
  }

  const groups: MatchGroup[] = [];
  for (const [tag, evs] of byTag.entries()) {
    if (evs.length >= cond.minOccurrences) {
      groups.push({ key: tag, events: evs });
    }
  }
  return groups;
}

async function matchEventSpike(
  w: BrainWatcher,
  cond: Extract<WatcherCondition, { kind: 'event_spike' }>,
  since: Date,
): Promise<MatchGroup[]> {
  const events = await fetchEvents(w.companyId, since, {
    type: cond.type,
    sentiment: cond.sentiment,
    sourceSubtypes: cond.sourceSubtypes,
  });
  if (events.length < cond.minCount) return [];

  // One group: "<type> events" so cooldown collapses repeat fires.
  const key = cond.type ? `${cond.type} spike` : 'event spike';
  return [{ key, events }];
}

async function matchKeyword(
  w: BrainWatcher,
  cond: Extract<WatcherCondition, { kind: 'keyword_match' }>,
  since: Date,
): Promise<MatchGroup[]> {
  const events = await fetchEvents(w.companyId, since, {});
  if (events.length === 0) return [];

  const phrasesLower = cond.phrases.map((p) => p.toLowerCase());
  const matched = events.filter((e) => {
    const hay = (e.subject + ' ' + e.content).toLowerCase();
    return phrasesLower.some((p) => hay.includes(p));
  });
  if (matched.length < cond.minMatches) return [];

  // Group by which phrase matched first — so "cancel" and "refund"
  // produce two distinct reactions.
  const byPhrase = new Map<string, DataEvent[]>();
  for (const e of matched) {
    const hay = (e.subject + ' ' + e.content).toLowerCase();
    const phrase = cond.phrases.find((p) => hay.includes(p.toLowerCase()));
    if (!phrase) continue;
    if (!byPhrase.has(phrase)) byPhrase.set(phrase, []);
    byPhrase.get(phrase)!.push(e);
  }

  const groups: MatchGroup[] = [];
  for (const [phrase, evs] of byPhrase.entries()) {
    if (evs.length >= cond.minMatches) groups.push({ key: phrase, events: evs });
  }
  return groups;
}

/* ─── Shared event fetch + cooldown ────────────────────────────── */

interface EventFilters {
  type?: string;
  sentiment?: string;
  sourceSubtypes?: string[];
}

async function fetchEvents(
  companyId: string,
  since: Date,
  filters: EventFilters,
): Promise<DataEvent[]> {
  // Source subtype is on data_sources, not data_events. Join briefly
  // only when subtype filter is set.
  if (filters.sourceSubtypes?.length) {
    const rows = await db.execute<DataEvent & { source_subtype: string | null }>(
      sql`
        SELECT e.* FROM data_events e
        INNER JOIN data_sources s ON s.id = e.source_id
        WHERE e.company_id = ${companyId}
          AND e.occurred_at >= ${since.toISOString()}
          AND s.subtype = ANY(${sql.raw(`ARRAY[${filters.sourceSubtypes.map((x) => `'${x.replace(/'/g, "''")}'`).join(',')}]`)})
          ${filters.type ? sql`AND e.type = ${filters.type}` : sql``}
          ${filters.sentiment ? sql`AND e.sentiment = ${filters.sentiment}` : sql``}
        ORDER BY e.occurred_at DESC
        LIMIT 200
      `,
    );
    return rows as any as DataEvent[];
  }

  const conds = [
    eq(dataEvents.companyId, companyId),
    gte(dataEvents.occurredAt, since),
  ];
  if (filters.type) conds.push(eq(dataEvents.type, filters.type as any));
  if (filters.sentiment) conds.push(eq(dataEvents.sentiment, filters.sentiment as any));

  return await db
    .select()
    .from(dataEvents)
    .where(and(...conds))
    .orderBy(desc(dataEvents.occurredAt))
    .limit(200);
}

async function isInCooldown(
  watcherId: string,
  companyId: string,
  groupKey: string,
  cooldownHours: number,
): Promise<boolean> {
  if (cooldownHours <= 0) return false;
  const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
  const recent = await db.query.brainReactions.findFirst({
    where: and(
      eq(brainReactions.watcherId, watcherId),
      eq(brainReactions.companyId, companyId),
      eq(brainReactions.groupKey, groupKey.slice(0, 200)),
      gte(brainReactions.firedAt, since),
    ),
    columns: { id: true },
  });
  return !!recent;
}
