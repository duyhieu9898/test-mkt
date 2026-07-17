const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface FacebookPostInsights {
  impressions: number;
  reach: number;
  clicks: number;
  clicksMeasured: boolean;
  reactions: number;
  comments: number;
  shares: number;
  engagements: number;
  engagementRate: number;
  fetchedAt: string;
}

async function facebookGet<T>(
  path: string,
  accessToken: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${GRAPH_API_BASE}/${path.replace(/^\/+/, '')}`);
  url.searchParams.set('access_token', accessToken);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      `Facebook insights failed (${response.status}): ${payload.error?.message || 'Unknown error'}`,
    );
  }
  return payload as T;
}

function readInsightValue(
  rows: Array<{ name?: string; values?: Array<{ value?: number }> }>,
  names: string[],
): number {
  const row = rows.find((item) => item.name && names.includes(item.name));
  return Number(row?.values?.[0]?.value ?? 0);
}

/**
 * Fetch organic Facebook Page post metrics.
 *
 * Engagement counts and post insights are fetched separately so a metric that
 * is unavailable for a particular post type does not hide the basic results.
 */
export async function fetchFacebookPostInsights(
  accessToken: string,
  platformPostId: string,
): Promise<FacebookPostInsights> {
  const postId = encodeURIComponent(platformPostId);
  const basic = await facebookGet<{
    reactions?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
    shares?: { count?: number };
  }>(postId, accessToken, {
    fields: 'reactions.limit(0).summary(true),comments.limit(0).summary(true),shares',
  });

  let insightRows: Array<{ name?: string; values?: Array<{ value?: number }> }> = [];
  let clicksMeasured = true;
  try {
    const insights = await facebookGet<{ data?: typeof insightRows }>(
      `${postId}/insights`,
      accessToken,
      { metric: 'post_impressions,post_impressions_unique,post_clicks' },
    );
    insightRows = insights.data ?? [];
  } catch {
    // Some Page/post combinations do not expose post_clicks. Retry the stable
    // reach metrics so the user still gets useful real performance data.
    clicksMeasured = false;
    const insights = await facebookGet<{ data?: typeof insightRows }>(
      `${postId}/insights`,
      accessToken,
      { metric: 'post_impressions,post_impressions_unique' },
    ).catch(() => ({ data: [] }));
    insightRows = insights.data ?? [];
  }

  const reactions = Number(basic.reactions?.summary?.total_count ?? 0);
  const comments = Number(basic.comments?.summary?.total_count ?? 0);
  const shares = Number(basic.shares?.count ?? 0);
  const impressions = readInsightValue(insightRows, ['post_impressions']);
  const reach = readInsightValue(insightRows, ['post_impressions_unique', 'post_reach']);
  const clicks = clicksMeasured
    ? readInsightValue(insightRows, ['post_clicks'])
    : 0;
  const engagements = reactions + comments + shares;

  return {
    impressions,
    reach,
    clicks,
    clicksMeasured,
    reactions,
    comments,
    shares,
    engagements,
    engagementRate: reach > 0 ? Number(((engagements / reach) * 100).toFixed(2)) : 0,
    fetchedAt: new Date().toISOString(),
  };
}
