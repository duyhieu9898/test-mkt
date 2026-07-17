function trimSlashes(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function joinStorageUrl(baseUrl, key) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/${key
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')}`;
}

function getSiteSlug(request, env) {
  const url = new URL(request.url);
  if (String(env.URL_MODE || '').toLowerCase() === 'path') {
    const [slug] = url.pathname.split('/').filter(Boolean);
    return slug && /^[a-z0-9-]{3,60}$/.test(slug) ? slug : null;
  }

  const baseDomain = trimSlashes(env.PUBLIC_BASE_DOMAIN).toLowerCase();
  const suffix = `.${baseDomain}`;
  if (!url.hostname.endsWith(suffix)) return null;

  const slug = url.hostname.slice(0, -suffix.length);
  return /^[a-z0-9-]{3,60}$/.test(slug) ? slug : null;
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const slug = getSiteSlug(request, env);
    if (!slug) return new Response('Website not found', { status: 404 });

    const prefix = trimSlashes(env.SITE_STORAGE_PREFIX);
    const key = [prefix, 'sites', slug, 'index.html'].filter(Boolean).join('/');
    const storageBaseUrl = String(env.SITE_STORAGE_PUBLIC_BASE_URL || '').trim();
    if (!storageBaseUrl) {
      return new Response('Website storage is not configured', { status: 500 });
    }

    const object = await fetch(joinStorageUrl(storageBaseUrl, key), {
      method: request.method,
      headers: { Accept: 'text/html' },
    });
    if (!object.ok) return new Response('Website not found', { status: 404 });

    const headers = new Headers(object.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=60, must-revalidate');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-1Person-Landing-Site', slug);

    return new Response(request.method === 'HEAD' ? null : object.body, {
      headers,
      status: 200,
    });
  },
};
