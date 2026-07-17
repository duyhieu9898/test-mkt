import { and, eq, sql } from 'drizzle-orm';
import {
  assetLibrary,
  banners,
  blogPosts,
  campaignLaunches,
  socialPosts,
} from '@1person/core/db';
import { db } from '../lib/db';
import { deleteObjectByPublicUrl } from './object-storage';

async function hasRowReference(tableQuery: Promise<unknown[]>): Promise<boolean> {
  const rows = await tableQuery;
  return rows.length > 0;
}

function referenceNeedles(url: string): { exact: string; storagePath: string } {
  try {
    const parsed = new URL(url);
    return {
      exact: url,
      storagePath: `${parsed.origin}${parsed.pathname}`,
    };
  } catch {
    return { exact: url, storagePath: url };
  }
}

/**
 * Deletes an object-storage URL only after checking the app's known content
 * tables. This is intentionally conservative because uploaded assets can be
 * reused by blog content, social posts, or campaign banners.
 */
export async function deleteStoredAssetIfUnreferenced(
  url?: string | null,
  options: { companyId?: string } = {},
): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return false;

  const companyFilter = options.companyId
    ? <T extends { companyId: any }>(table: T) => eq(table.companyId, options.companyId!)
    : null;
  const needles = referenceNeedles(url);
  const likeExactUrl = `%${needles.exact}%`;
  const likeStoragePath = `%${needles.storagePath}%`;

  const checks = [
    hasRowReference(
      db.select({ id: banners.id })
        .from(banners)
        .where(and(
          ...(companyFilter ? [companyFilter(banners)] : []),
          sql`(${banners.imageUrl} = ${needles.exact} OR ${banners.imageUrl} LIKE ${likeStoragePath} OR ${banners.design}::text LIKE ${likeExactUrl} OR ${banners.design}::text LIKE ${likeStoragePath})`,
        ))
        .limit(1),
    ),
    hasRowReference(
      db.select({ id: socialPosts.id })
        .from(socialPosts)
        .where(and(
          ...(companyFilter ? [companyFilter(socialPosts)] : []),
          sql`(${socialPosts.mediaUrls}::text LIKE ${likeExactUrl} OR ${socialPosts.mediaUrls}::text LIKE ${likeStoragePath})`,
        ))
        .limit(1),
    ),
    hasRowReference(
      db.select({ id: blogPosts.id })
        .from(blogPosts)
        .where(and(
          ...(companyFilter ? [companyFilter(blogPosts)] : []),
          sql`(${blogPosts.content} LIKE ${likeExactUrl} OR ${blogPosts.content} LIKE ${likeStoragePath} OR COALESCE(${blogPosts.cmsPostUrl}, '') = ${needles.exact} OR COALESCE(${blogPosts.cmsPostUrl}, '') LIKE ${likeStoragePath})`,
        ))
        .limit(1),
    ),
    hasRowReference(
      db.select({ id: assetLibrary.id })
        .from(assetLibrary)
        .where(and(
          ...(companyFilter ? [companyFilter(assetLibrary)] : []),
          sql`(${assetLibrary.url} = ${needles.exact} OR ${assetLibrary.url} LIKE ${likeStoragePath} OR COALESCE(${assetLibrary.thumbnailUrl}, '') = ${needles.exact} OR COALESCE(${assetLibrary.thumbnailUrl}, '') LIKE ${likeStoragePath} OR ${assetLibrary.metadata}::text LIKE ${likeExactUrl} OR ${assetLibrary.metadata}::text LIKE ${likeStoragePath})`,
        ))
        .limit(1),
    ),
    hasRowReference(
      db.select({ id: campaignLaunches.id })
        .from(campaignLaunches)
        .where(and(
          ...(companyFilter ? [companyFilter(campaignLaunches)] : []),
          sql`(${campaignLaunches.heroImageUrl} = ${needles.exact} OR ${campaignLaunches.heroImageUrl} LIKE ${likeStoragePath} OR ${campaignLaunches.steps}::text LIKE ${likeExactUrl} OR ${campaignLaunches.steps}::text LIKE ${likeStoragePath})`,
        ))
        .limit(1),
    ),
  ];

  if ((await Promise.all(checks)).some(Boolean)) return false;

  await deleteObjectByPublicUrl(url);
  return true;
}

export async function deleteStoredAssetsIfUnreferenced(
  urls: Array<string | null | undefined>,
  options: { companyId?: string } = {},
): Promise<number> {
  const uniqueUrls = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  const results = await Promise.all(
    uniqueUrls.map((url) => deleteStoredAssetIfUnreferenced(url, options).catch(() => false)),
  );
  return results.filter(Boolean).length;
}
