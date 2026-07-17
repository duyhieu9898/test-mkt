/** Channel CRUD + OAuth for chatbot platform connections */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { chatbotChannels } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';

const channelsRouter = new Hono();

// Facebook OAuth callback (NO auth — redirect from Facebook)
channelsRouter.get('/oauth/facebook/callback', async (c) => {
  const code = c.req.query('code'), state = c.req.query('state');
  if (!code || !state) return c.json({ error: 'Missing code or state' }, 400);
  const botId = state.replace('botId:', '');
  const appId = process.env.FACEBOOK_APP_ID, appSecret = process.env.FACEBOOK_APP_SECRET;
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1').replace(/\/api\/v1\/?$/, '');
  const redirectUri = `${apiBase}/api/v1/channels/oauth/facebook/callback`;
  if (!appId || !appSecret) return c.json({ error: 'Facebook not configured' }, 503);
  try {
    const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`);
    const td = await tokenRes.json() as any;
    if (!td.access_token) return c.json({ error: 'Token exchange failed' }, 400);
    const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${td.access_token}`);
    const pages = ((await pagesRes.json()) as any).data || [];
    if (pages.length === 0) return c.html('<html><body><h2>No Pages found</h2><script>setTimeout(()=>window.close(),3000)</script></body></html>');
    const page = pages[0];
    await db.insert(chatbotChannels).values({ botId, platform: 'messenger', config: { pageId: page.id, pageName: page.name, accessToken: page.access_token } });
    return c.html(`<html><body><h2>Connected: ${page.name}</h2><script>window.opener?.postMessage({type:'channel-connected',platform:'messenger'},'*');setTimeout(()=>window.close(),2000)</script></body></html>`);
  } catch (err) { console.error('FB OAuth error:', err); return c.json({ error: 'OAuth failed' }, 500); }
});

// Platform readiness (lightweight, no auth needed)
channelsRouter.get('/platforms/status', async (c) => {
  return c.json({ messenger: !!process.env.FACEBOOK_APP_ID, instagram: !!process.env.FACEBOOK_APP_ID, zalo_oa: !!process.env.ZALO_APP_ID, widget: true });
});

// --- Authenticated routes below ---
const authed = new Hono();
authed.use('*', authMiddleware);

authed.get('/:companyId/bot/:botId', async (c) => {
  const channels = await db.select().from(chatbotChannels).where(eq(chatbotChannels.botId, c.req.param('botId')));
  return c.json({ data: channels });
});

authed.post('/:companyId/bot/:botId/connect', zValidator('json', z.object({
  platform: z.enum(['messenger', 'zalo_oa', 'instagram']),
  config: z.record(z.unknown()).default({}),
})), async (c) => {
  const { platform, config } = c.req.valid('json');
  const [ch] = await db.insert(chatbotChannels).values({ botId: c.req.param('botId'), platform, config, connectedBy: (c.get('user') as any).userId }).returning();
  return c.json(ch);
});

authed.delete('/:companyId/bot/:botId/:channelId', async (c) => {
  await db.delete(chatbotChannels).where(eq(chatbotChannels.id, c.req.param('channelId')));
  return c.json({ deleted: true });
});

authed.post('/:companyId/bot/:botId/zalo/connect', zValidator('json', z.object({
  oaId: z.string().min(1), refreshToken: z.string().min(1),
})), async (c) => {
  const { oaId, refreshToken } = c.req.valid('json');
  let accessToken = refreshToken;
  const zaloAppId = process.env.ZALO_APP_ID, zaloSecret = process.env.ZALO_APP_SECRET;
  if (zaloAppId && zaloSecret) {
    try {
      const r = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', secret_key: zaloSecret }, body: `refresh_token=${refreshToken}&app_id=${zaloAppId}&grant_type=refresh_token` });
      const d = await r.json() as any; if (d.access_token) accessToken = d.access_token;
    } catch { /* fallback */ }
  }
  const [ch] = await db.insert(chatbotChannels).values({ botId: c.req.param('botId'), platform: 'zalo_oa', config: { oaId, accessToken, refreshToken }, connectedBy: (c.get('user') as any).userId }).returning();
  return c.json(ch);
});

channelsRouter.route('/', authed);
export default channelsRouter;
