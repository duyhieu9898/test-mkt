const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

export const FACEBOOK_PUBLISH_PERMISSIONS = [
  'pages_read_engagement',
  'pages_manage_posts',
] as const;

interface FacebookPageAccount {
  id?: string;
  name?: string;
  access_token?: string;
  tasks?: string[];
}

interface FacebookPermission {
  permission?: string;
  status?: string;
}

async function readJson(response: Response): Promise<any> {
  return response.json().catch(() => ({}));
}

export async function getGrantedFacebookPermissions(accessToken: string): Promise<string[]> {
  const url = new URL(`${GRAPH_API_BASE}/me/permissions`);
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) return [];

  const payload = await readJson(response);
  return ((payload.data ?? []) as FacebookPermission[])
    .filter((entry) => entry.status === 'granted' && entry.permission)
    .map((entry) => entry.permission as string);
}

/**
 * Facebook Login returns a user token. Page publishing needs the Page token
 * returned by /me/accounts for the selected Page.
 */
export async function resolveFacebookPageAccess(
  accessToken: string,
  pageId: string,
): Promise<{
  accessToken: string;
  pageName?: string;
  pageTasks?: string[];
  permissions: string[];
  resolvedPageToken: boolean;
  requestedPageFound: boolean;
  availablePages: Array<{ id: string; name?: string; tasks: string[] }>;
}> {
  const permissions = await getGrantedFacebookPermissions(accessToken);
  const url = new URL(`${GRAPH_API_BASE}/me/accounts`);
  url.searchParams.set('fields', 'id,name,access_token,tasks');
  url.searchParams.set('limit', '100');
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  let managedPages: FacebookPageAccount[] = [];
  if (response.ok) {
    const payload = await readJson(response);
    managedPages = (payload.data ?? []) as FacebookPageAccount[];
    const page = managedPages.find((entry) => entry.id === pageId);
    if (page?.access_token) {
      return {
        accessToken: page.access_token,
        pageName: page.name,
        pageTasks: page.tasks,
        permissions,
        resolvedPageToken: page.access_token !== accessToken,
        requestedPageFound: true,
        availablePages: managedPages
          .filter((entry): entry is FacebookPageAccount & { id: string } => Boolean(entry.id))
          .map((entry) => ({
            id: entry.id,
            name: entry.name,
            tasks: entry.tasks ?? [],
          })),
      };
    }
  }

  // A Page token identifies the Page as /me and generally has no managed Page
  // list. A user token with managed Pages must match one of /me/accounts.
  const identityUrl = new URL(`${GRAPH_API_BASE}/me`);
  identityUrl.searchParams.set('fields', 'id,name');
  identityUrl.searchParams.set('access_token', accessToken);
  const identityResponse = await fetch(identityUrl, {
    signal: AbortSignal.timeout(15000),
  });
  const identity = identityResponse.ok ? await readJson(identityResponse) : {};
  // A Page token identifies the Page through /me. Some Graph API versions may
  // still return rows from /me/accounts, so the identity match is the reliable
  // signal; a user ID cannot legitimately equal the configured Page ID.
  const isDirectPageToken = identity.id === pageId;

  return {
    accessToken,
    pageName: isDirectPageToken ? identity.name : undefined,
    permissions,
    resolvedPageToken: false,
    requestedPageFound: isDirectPageToken,
    availablePages: managedPages
      .filter((entry): entry is FacebookPageAccount & { id: string } => Boolean(entry.id))
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        tasks: entry.tasks ?? [],
      })),
  };
}

export function missingFacebookPublishPermissions(permissions: string[]): string[] {
  if (permissions.length === 0) return [];
  return FACEBOOK_PUBLISH_PERMISSIONS.filter(
    (permission) => !permissions.includes(permission),
  );
}

export function canCreateFacebookPageContent(tasks: string[] | undefined): boolean {
  if (!tasks?.length) return true;
  return tasks.includes('CREATE_CONTENT')
    || tasks.includes('PROFILE_PLUS_CREATE_CONTENT')
    || tasks.includes('PROFILE_PLUS_FULL_CONTROL');
}
