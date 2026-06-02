/**
 * Watcher seeder — idempotently installs the default watcher library
 * for a company. Safe to call on every Brain Hub page load (it's an
 * indexed SELECT + only inserts the missing slugs).
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../lib/db';
import { brainWatchers } from '@1person/core/db';
import { DEFAULT_WATCHERS, templateToWatcher } from './watcher-library';

export async function ensureDefaultWatchers(companyId: string): Promise<{ inserted: number }> {
  const slugs = DEFAULT_WATCHERS.map((w) => w.slug);

  const existing = await db
    .select({ slug: brainWatchers.slug })
    .from(brainWatchers)
    .where(and(eq(brainWatchers.companyId, companyId), inArray(brainWatchers.slug, slugs)));

  const have = new Set(existing.map((e) => e.slug));
  const toInsert = DEFAULT_WATCHERS.filter((t) => !have.has(t.slug));

  if (toInsert.length === 0) return { inserted: 0 };

  await db.insert(brainWatchers).values(toInsert.map((t) => templateToWatcher(companyId, t)));
  return { inserted: toInsert.length };
}
