import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFacebookPostInsights } from './facebook-post-insights';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchFacebookPostInsights', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('combines engagement counts with Facebook post insights', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        reactions: { summary: { total_count: 12 } },
        comments: { summary: { total_count: 4 } },
        shares: { count: 2 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [
          { name: 'post_impressions', values: [{ value: 1000 }] },
          { name: 'post_impressions_unique', values: [{ value: 800 }] },
          { name: 'post_clicks', values: [{ value: 25 }] },
        ],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchFacebookPostInsights('page-token', 'page_post');

    expect(result).toMatchObject({
      impressions: 1000,
      reach: 800,
      clicks: 25,
      clicksMeasured: true,
      reactions: 12,
      comments: 4,
      shares: 2,
      engagements: 18,
      engagementRate: 2.25,
    });
  });

  it('keeps reach data when post clicks are unavailable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        reactions: { summary: { total_count: 3 } },
        comments: { summary: { total_count: 1 } },
      }))
      .mockResolvedValueOnce(jsonResponse({
        error: { message: 'Unsupported metric: post_clicks' },
      }, 400))
      .mockResolvedValueOnce(jsonResponse({
        data: [
          { name: 'post_impressions', values: [{ value: 400 }] },
          { name: 'post_impressions_unique', values: [{ value: 300 }] },
        ],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchFacebookPostInsights('page-token', 'page_post');

    expect(result).toMatchObject({
      impressions: 400,
      reach: 300,
      clicks: 0,
      clicksMeasured: false,
      engagements: 4,
    });
  });
});
