import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  missingFacebookPublishPermissions,
  resolveFacebookPageAccess,
} from './facebook-page-access';

describe('resolveFacebookPageAccess', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges a Facebook user token for the selected Page token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { permission: 'pages_read_engagement', status: 'granted' },
          { permission: 'pages_manage_posts', status: 'granted' },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { id: 'page-1', name: 'First Page', access_token: 'page-token-1' },
          {
            id: 'page-2',
            name: 'Selected Page',
            access_token: 'page-token-2',
            tasks: ['CREATE_CONTENT'],
          },
        ],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveFacebookPageAccess('user-token', 'page-2');

    expect(result).toEqual({
      accessToken: 'page-token-2',
      pageName: 'Selected Page',
      pageTasks: ['CREATE_CONTENT'],
      permissions: ['pages_read_engagement', 'pages_manage_posts'],
      resolvedPageToken: true,
      requestedPageFound: true,
      availablePages: [
        { id: 'page-1', name: 'First Page', tasks: [] },
        { id: 'page-2', name: 'Selected Page', tasks: ['CREATE_CONTENT'] },
      ],
    });
  });

  it('keeps an existing Page token when no replacement is returned', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'page-1',
        name: 'Selected Page',
      }), { status: 200 })));

    const result = await resolveFacebookPageAccess('page-token', 'page-1');

    expect(result.accessToken).toBe('page-token');
    expect(result.resolvedPageToken).toBe(false);
    expect(result.requestedPageFound).toBe(true);
  });

  it('recognizes a direct Page token even when accounts returns other rows', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ permission: 'pages_read_engagement', status: 'granted' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: 'another-page', name: 'Another Page' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'selected-page',
        name: 'Selected Page',
      }), { status: 200 })));

    const result = await resolveFacebookPageAccess('page-token', 'selected-page');

    expect(result.accessToken).toBe('page-token');
    expect(result.requestedPageFound).toBe(true);
    expect(result.pageName).toBe('Selected Page');
  });
});

describe('missingFacebookPublishPermissions', () => {
  it('reports missing permissions only when Facebook returned a permission list', () => {
    expect(missingFacebookPublishPermissions(['pages_read_engagement']))
      .toEqual(['pages_manage_posts']);
    expect(missingFacebookPublishPermissions([])).toEqual([]);
  });
});
