import { readObjectByKey } from './object-storage';

export const HOSTED_LANDING_SITE_HEADER = 'X-1Person-Landing-Site';

export function normalizeHostedLandingSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
}

export function hostedLandingPageVersionKey(slug: string, versionId: string) {
  return `sites/${normalizeHostedLandingSlug(slug)}/versions/${versionId}/index.html`;
}

export function hostedLandingPageCurrentKey(slug: string) {
  return `sites/${normalizeHostedLandingSlug(slug)}/index.html`;
}

export async function readHostedLandingPageHtml(slug: string) {
  const normalizedSlug = normalizeHostedLandingSlug(slug);
  if (!normalizedSlug) return null;
  try {
    return await readObjectByKey(hostedLandingPageCurrentKey(normalizedSlug));
  } catch (error) {
    const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    const errorName = (error as { name?: string }).name;
    // Missing hosted pages should behave like normal public pages: a clean 404,
    // not an internal error from the object storage SDK.
    if (statusCode === 404 || errorName === 'NoSuchKey' || errorName === 'NotFound') return null;
    throw error;
  }
}

export function createHostedLandingPageResponse(slug: string, html: Buffer) {
  const normalizedSlug = normalizeHostedLandingSlug(slug);
  return new Response(new Uint8Array(html), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, must-revalidate',
      [HOSTED_LANDING_SITE_HEADER]: normalizedSlug,
    },
  });
}
