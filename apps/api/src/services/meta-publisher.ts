/**
 * Meta Publisher — Real Facebook/Instagram Ads creation
 *
 * Bridges a 1Person marketing `campaign` (with banners + targeting) into a
 * real, PAUSED Meta Marketing API campaign → adset → creative → ad.
 *
 * All ads are created PAUSED. The user must un-pause them manually in
 * Meta Ads Manager so we never spend money on their behalf by accident.
 *
 * Scope (P0-B5):
 *   1. Look up Meta ad connection for the company
 *   2. Create 1 Meta campaign (OUTCOME_AWARENESS / OUTCOME_TRAFFIC)
 *   3. Create 1 adset with targeting from campaign.targeting
 *   4. Upload first banner background as an ad image (if possible)
 *   5. Create 1 ad creative + 1 ad
 *   6. Persist platformCampaignId on ad_campaigns (if a row exists)
 */

import { db } from '../lib/db';
import { decryptMaybe } from '../lib/crypto';
import { eq, and, desc } from 'drizzle-orm';
import {
  campaigns as mktCampaigns,
  banners as mktBanners,
  adConnections,
  adCampaigns,
} from '@1person/core/db';
import { promises as fs } from 'node:fs';

// Hardcoded here because env.ts is being modified by another agent.
// Keep in sync with providers/facebook.ts when possible.
const META_GRAPH_VERSION = 'v21.0';
const META_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublishCampaignToMetaResult {
  metaCampaignId: string;
  metaAdSetId: string;
  metaAdId?: string;
  metaCreativeId?: string;
  previewUrl?: string;
  warnings?: string[];
}

interface MetaError {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_user_msg?: string;
  };
}

// ---------------------------------------------------------------------------
// HTTP helper with 5xx retry
// ---------------------------------------------------------------------------

async function metaFetch<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {}
): Promise<T> {
  const { accessToken, ...rest } = init;
  const url = new URL(`${META_BASE_URL}/${path.replace(/^\//, '')}`);
  if (accessToken && !url.searchParams.has('access_token')) {
    url.searchParams.set('access_token', accessToken);
  }

  const doCall = async () =>
    fetch(url.toString(), {
      ...rest,
      signal: AbortSignal.timeout(30_000),
    });

  let res = await doCall();
  if (res.status >= 500 && res.status < 600) {
    // Single retry with small backoff
    await new Promise((r) => setTimeout(r, 500));
    res = await doCall();
  }

  if (!res.ok) {
    let body: MetaError = {};
    try {
      body = (await res.json()) as MetaError;
    } catch {
      // ignore json parse errors
    }
    const msg =
      body.error?.error_user_msg ||
      body.error?.message ||
      res.statusText ||
      `HTTP ${res.status}`;
    throw new Error(`Meta API error (${res.status}): ${msg}`);
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Image resolution — turn a banner.design.backgroundValue into a Buffer (if possible)
// ---------------------------------------------------------------------------

interface ResolvedImage {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

async function resolveBannerImage(
  banner: { imageUrl?: string | null; design?: Record<string, unknown> | null }
): Promise<ResolvedImage | null> {
  const design = (banner.design ?? {}) as {
    backgroundType?: string;
    backgroundValue?: string;
    backgroundImageUrl?: string;
  };

  const candidate =
    design.backgroundImageUrl ||
    (design.backgroundType === 'image' ? design.backgroundValue : undefined) ||
    banner.imageUrl ||
    undefined;

  if (!candidate || typeof candidate !== 'string') return null;

  // Skip gradients / solid colors
  if (
    candidate.startsWith('linear-gradient') ||
    candidate.startsWith('radial-gradient') ||
    candidate.startsWith('#')
  ) {
    return null;
  }

  // data: URL
  if (candidate.startsWith('data:')) {
    const match = candidate.match(/^data:([^;,]+)[^,]*,(.*)$/);
    if (!match) return null;
    const mimeType = match[1] || 'image/png';
    const base64 = match[2] || '';
    const buffer = Buffer.from(base64, 'base64');
    const ext = mimeType.split('/')[1] || 'png';
    return { buffer, filename: `banner.${ext}`, mimeType };
  }

  // file:// path
  if (candidate.startsWith('file://')) {
    try {
      const path = candidate.replace(/^file:\/\//, '');
      const buffer = await fs.readFile(path);
      const ext = path.split('.').pop() || 'png';
      return { buffer, filename: `banner.${ext}`, mimeType: `image/${ext}` };
    } catch {
      return null;
    }
  }

  // http(s) URL — download
  if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
    try {
      const res = await fetch(candidate, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const mimeType = res.headers.get('content-type') || 'image/png';
      const ext = mimeType.split('/')[1]?.split(';')[0] || 'png';
      return { buffer, filename: `banner.${ext}`, mimeType };
    } catch {
      return null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Meta Marketing API primitives
// ---------------------------------------------------------------------------

async function createMetaCampaign(params: {
  adAccountId: string;
  accessToken: string;
  name: string;
  objective: 'OUTCOME_AWARENESS' | 'OUTCOME_TRAFFIC';
}): Promise<{ id: string }> {
  const form = new URLSearchParams({
    name: params.name,
    objective: params.objective,
    status: 'PAUSED',
    special_ad_categories: JSON.stringify([]),
    access_token: params.accessToken,
  });

  return metaFetch<{ id: string }>(`act_${params.adAccountId}/campaigns`, {
    method: 'POST',
    body: form,
  });
}

async function createMetaAdSet(params: {
  adAccountId: string;
  accessToken: string;
  campaignId: string;
  name: string;
  dailyBudgetCents: number;
  targeting: Record<string, unknown>;
  objective: 'OUTCOME_AWARENESS' | 'OUTCOME_TRAFFIC';
}): Promise<{ id: string }> {
  // Optimization goal depends on objective. REACH is valid for awareness,
  // LINK_CLICKS for traffic.
  const optimizationGoal =
    params.objective === 'OUTCOME_TRAFFIC' ? 'LINK_CLICKS' : 'REACH';

  const form = new URLSearchParams({
    name: params.name,
    campaign_id: params.campaignId,
    daily_budget: String(params.dailyBudgetCents),
    billing_event: 'IMPRESSIONS',
    optimization_goal: optimizationGoal,
    targeting: JSON.stringify(params.targeting),
    status: 'PAUSED',
    access_token: params.accessToken,
  });

  return metaFetch<{ id: string }>(`act_${params.adAccountId}/adsets`, {
    method: 'POST',
    body: form,
  });
}

async function uploadMetaAdImage(params: {
  adAccountId: string;
  accessToken: string;
  image: ResolvedImage;
}): Promise<string | null> {
  try {
    const form = new FormData();
    form.append('access_token', params.accessToken);
    form.append(
      'source',
      new Blob([new Uint8Array(params.image.buffer)], { type: params.image.mimeType }),
      params.image.filename
    );

    const res = await metaFetch<{
      images?: Record<string, { hash?: string }>;
    }>(`act_${params.adAccountId}/adimages`, {
      method: 'POST',
      body: form,
    });

    const first = res.images ? Object.values(res.images)[0] : undefined;
    return first?.hash ?? null;
  } catch {
    return null;
  }
}

async function createMetaAdCreative(params: {
  adAccountId: string;
  accessToken: string;
  name: string;
  pageId: string;
  message: string;
  link: string;
  imageHash?: string;
}): Promise<{ id: string }> {
  const linkData: Record<string, unknown> = {
    link: params.link,
    message: params.message,
  };
  if (params.imageHash) linkData.image_hash = params.imageHash;

  const form = new URLSearchParams({
    name: params.name,
    object_story_spec: JSON.stringify({
      page_id: params.pageId,
      link_data: linkData,
    }),
    access_token: params.accessToken,
  });

  return metaFetch<{ id: string }>(`act_${params.adAccountId}/adcreatives`, {
    method: 'POST',
    body: form,
  });
}

async function createMetaAd(params: {
  adAccountId: string;
  accessToken: string;
  name: string;
  adSetId: string;
  creativeId: string;
}): Promise<{ id: string }> {
  const form = new URLSearchParams({
    name: params.name,
    adset_id: params.adSetId,
    creative: JSON.stringify({ creative_id: params.creativeId }),
    status: 'PAUSED',
    access_token: params.accessToken,
  });

  return metaFetch<{ id: string }>(`act_${params.adAccountId}/ads`, {
    method: 'POST',
    body: form,
  });
}

// ---------------------------------------------------------------------------
// Targeting translation
// ---------------------------------------------------------------------------

function buildTargetingFromCampaign(
  targeting: {
    geo?: string[];
    ageRange?: string;
    interests?: string[];
    keywords?: string[];
  } | null | undefined
): Record<string, unknown> {
  const t = targeting ?? {};
  const out: Record<string, unknown> = {};

  const countries = (t.geo ?? []).filter((g) => typeof g === 'string' && g.length === 2);
  out.geo_locations = {
    countries: countries.length ? countries : ['US'],
  };

  if (t.ageRange && /^\d+-\d+$/.test(t.ageRange)) {
    const parts = t.ageRange.split('-').map((n) => parseInt(n, 10));
    const min = parts[0];
    const max = parts[1];
    if (typeof min === 'number' && !Number.isNaN(min)) out.age_min = Math.max(13, min);
    if (typeof max === 'number' && !Number.isNaN(max)) out.age_max = Math.min(65, max);
  } else {
    out.age_min = 18;
    out.age_max = 65;
  }

  const interests = (t.interests ?? []).filter((i) => typeof i === 'string' && i.length > 0);
  if (interests.length) {
    out.flexible_spec = [{ interests: interests.map((name) => ({ name })) }];
  }

  return out;
}

function mapObjective(goal: string | null | undefined): 'OUTCOME_AWARENESS' | 'OUTCOME_TRAFFIC' {
  if (!goal) return 'OUTCOME_TRAFFIC';
  const g = goal.toLowerCase();
  if (g.includes('aware') || g.includes('brand') || g.includes('reach')) return 'OUTCOME_AWARENESS';
  return 'OUTCOME_TRAFFIC';
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Publish a 1Person marketing campaign to Meta Ads.
 *
 * Creates a PAUSED campaign + adset + ad on Meta. The user un-pauses manually
 * in Ads Manager. Returns the Meta IDs.
 *
 * @throws if no Meta connection exists for the company, or if core API calls fail.
 */
export async function publishCampaignToMeta(
  campaignId: string
): Promise<PublishCampaignToMetaResult> {
  const warnings: string[] = [];

  // 1. Load the marketing campaign
  const campaign = await db.query.campaigns.findFirst({
    where: eq(mktCampaigns.id, campaignId),
  });
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  // 2. Load active Meta ad connection for the company
  const connection = await db.query.adConnections.findFirst({
    where: and(
      eq(adConnections.companyId, campaign.companyId),
      eq(adConnections.platform, 'facebook'),
      eq(adConnections.status, 'connected')
    ),
  });
  if (!connection) {
    throw new Error('No Meta Ads account connected. Connect one in Settings.');
  }
  if (!connection.platformAccountId) {
    throw new Error('Meta Ads connection is missing an ad account ID. Reconnect in Settings.');
  }

  const adAccountId = connection.platformAccountId.replace(/^act_/, '');
  const accessToken = decryptMaybe(connection.accessToken);

  // 3. Budget validation
  const dailyBudget = Number(campaign.budgetDaily ?? 0);
  if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) {
    throw new Error('Campaign daily budget must be greater than 0 to publish to Meta.');
  }
  // Meta minimum is roughly $1/day for most currencies. Enforce a soft floor.
  if (dailyBudget < 1) {
    throw new Error('Meta requires a minimum daily budget of at least 1.00.');
  }
  const dailyBudgetCents = Math.round(dailyBudget * 100);

  // 4. Load the first banner (for creative). Newest first.
  const banner = await db.query.banners.findFirst({
    where: eq(mktBanners.campaignId, campaignId),
    orderBy: [desc(mktBanners.createdAt)],
  });

  // 5. Create Meta campaign
  const objective = mapObjective(campaign.goal);
  const metaCampaign = await createMetaCampaign({
    adAccountId,
    accessToken,
    name: campaign.name || `1Person Campaign ${campaignId.slice(0, 8)}`,
    objective,
  });

  // 6. Create adset
  const targeting = buildTargetingFromCampaign(campaign.targeting);
  const metaAdSet = await createMetaAdSet({
    adAccountId,
    accessToken,
    campaignId: metaCampaign.id,
    name: `${campaign.name || 'Ad Set'} — Default`,
    dailyBudgetCents,
    targeting,
    objective,
  });

  // 7. Try to create a creative + ad using the first banner.
  //    If no banner or no page_id, skip ad creation and return partial success.
  let metaAdId: string | undefined;
  let metaCreativeId: string | undefined;

  const pageId = connection.platformBusinessId ?? undefined;

  if (!banner) {
    warnings.push('No banner found for campaign — created campaign + adset only.');
  } else if (!pageId) {
    warnings.push('Meta connection has no Facebook Page ID — cannot create ad creative.');
  } else {
    try {
      let imageHash: string | null = null;
      const resolved = await resolveBannerImage(banner);
      if (resolved) {
        imageHash = await uploadMetaAdImage({ adAccountId, accessToken, image: resolved });
        if (!imageHash) {
          warnings.push('Banner image upload failed — creating text-only ad.');
        }
      } else {
        warnings.push('Banner uses a gradient/solid background — creating text-only ad.');
      }

      const headline = banner.copy?.headline || campaign.name || 'Learn more';
      const link = campaign.landingPageUrl || 'https://example.com';

      const creative = await createMetaAdCreative({
        adAccountId,
        accessToken,
        name: `Creative — ${banner.name || banner.id.slice(0, 8)}`,
        pageId,
        message: headline,
        link,
        imageHash: imageHash ?? undefined,
      });
      metaCreativeId = creative.id;

      const ad = await createMetaAd({
        adAccountId,
        accessToken,
        name: `Ad — ${banner.name || banner.id.slice(0, 8)}`,
        adSetId: metaAdSet.id,
        creativeId: creative.id,
      });
      metaAdId = ad.id;
    } catch (err) {
      warnings.push(
        `Ad creation failed: ${err instanceof Error ? err.message : 'unknown error'}. Campaign + adset were still created.`
      );
    }
  }

  // 8. Persist platformCampaignId on ad_campaigns row if one already exists for this marketing campaign.
  //    The ad_campaigns table is keyed by companyId + name; we do a best-effort update by name match.
  try {
    const existingAdCampaign = await db.query.adCampaigns.findFirst({
      where: and(
        eq(adCampaigns.companyId, campaign.companyId),
        eq(adCampaigns.name, campaign.name)
      ),
    });
    if (existingAdCampaign) {
      await db
        .update(adCampaigns)
        .set({
          platformCampaignId: metaCampaign.id,
          updatedAt: new Date(),
        })
        .where(eq(adCampaigns.id, existingAdCampaign.id));
    }
  } catch {
    // Non-fatal — Meta side succeeded, local bookkeeping is best-effort.
  }

  // 9. Touch the connection's lastUsedAt as a lightweight audit trail.
  //    (The TenantAI logAction trail lives at a higher layer and will be
  //     wired in by the launch-flow agent.)
  try {
    await db
      .update(adConnections)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(adConnections.id, connection.id));
  } catch {
    // ignore
  }

  return {
    metaCampaignId: metaCampaign.id,
    metaAdSetId: metaAdSet.id,
    metaAdId,
    metaCreativeId,
    previewUrl: metaAdId
      ? `https://www.facebook.com/ads/manager/manage/ads?act=${adAccountId}&selected_ad_ids=${metaAdId}`
      : `https://www.facebook.com/ads/manager/manage/campaigns?act=${adAccountId}&selected_campaign_ids=${metaCampaign.id}`,
    warnings: warnings.length ? warnings : undefined,
  };
}
