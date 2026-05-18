import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { env } from './lib/env';
import { errorHandler } from './middleware/error';

// Routes
import authRouter from './routes/auth';
import companiesRouter from './routes/companies';
import agentsRouter from './routes/agents';
import tasksRouter from './routes/tasks';
import commandsRouter from './routes/commands';
// strategyRouter deleted — OKR surface retired in doc 10 IA restructure
import inboxRouter from './routes/inbox';
import budgetRouter from './routes/budget';
import auditRouter from './routes/audit';
import communicationsRouter from './routes/communications';
import conflictsRouter from './routes/conflicts';
import eventsRouter from './routes/events';
import economyRouter from './routes/economy';
import marketplaceRouter from './routes/marketplace';
import simulationRouter from './routes/simulation';
import ftuxRouter from './routes/ftux';
import templatesRouter from './routes/templates';
import playbooksRouter from './routes/playbooks';
import guidanceRouter from './routes/guidance';
import { landingPagesRouter } from './routes/landing-pages';
import { deploymentsRouter } from './routes/deployments';
import executionRouter from './routes/execution';
import brandRouter from './routes/brand';
import assetsRouter from './routes/assets';
import assetsLibraryRouter from './routes/assets-library';
import executionMetricsRouter from './routes/execution-metrics';
import distributionRouter from './routes/distribution';
import workflowsRouter from './routes/workflows';
import outreachRouter from './routes/outreach';
import adsRouter from './routes/ads';
import leadCaptureRouter from './routes/lead-capture';
import trackingRouter from './routes/tracking';
import enginesRouter from './routes/engines';
import dashboardRouter from './routes/dashboard';
import integrationsRouter from './routes/integrations';
import knowledgeRouter from './routes/knowledge';
import marketingEngineRouter from './routes/marketing-engine';
import chatbotRouter from './routes/chatbot';
import meetingsRouter from './routes/meetings';
import leadsRouter from './routes/leads';
import tenantAIRouter from './routes/tenant-ai';
import campaignsRouter from './routes/campaigns';
import brainRouter from './routes/brain';
import seoEngineRouter from './routes/seo-engine';
import blogRouter from './routes/blog';
import adminRouter from './routes/admin';
import billingRouter from './routes/billing';
import exportRouter from './routes/export';
import deploymentModeRouter from './routes/deployment-mode';
import adminConfigRouter from './routes/admin-config';
import adminPublishRouter from './routes/admin-publish';
import creditsRouter from './routes/credits';
import adminCreditsRouter from './routes/admin-credits';
import insightsRouter from './routes/insights';
import imageProvidersRouter from './routes/image-providers';
import marketRouter from './routes/market';
import salesRouter from './routes/sales';
import channelsRouter from './routes/channels';
import webhooksRouter from './routes/webhooks';
import omnichannelRouter, { messengerWebhookRouter } from './routes/omnichannel';
import socialRouter from './routes/social';
import gamificationRouter from './routes/gamification';
import geoRouter from './routes/geo';
import contentEditorRouter from './routes/content-editor';
import adminSetupRouter from './routes/admin-setup';
import brandIqRouter from './routes/brand-iq';
import teamRouter from './routes/team';

// Initialize platform registry (registers all providers at startup)
import './services/platforms';

// Create app
const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use(
  '*',
  cors({
    origin: [env.WEB_URL, 'http://localhost:3004'],
    credentials: true,
  })
);

// Error handling
app.onError(errorHandler);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Serve uploaded assets (images, videos) as static files
app.get('/uploads/*', async (c) => {
  const filePath = c.req.path.replace('/uploads/', '');
  const fs = await import('fs');
  const path = await import('path');
  const fullPath = path.join(process.cwd(), '..', '..', 'deploy', 'assets', filePath);

  if (!fs.existsSync(fullPath)) {
    return c.json({ error: 'File not found' }, 404);
  }

  const ext = path.extname(fullPath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.webm': 'video/webm',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const fileBuffer = fs.readFileSync(fullPath);

  return new Response(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

// Serve published landing pages (built-in hosting)
app.get('/pages/:companyId/:slug', async (c) => {
  const companyId = c.req.param('companyId');
  const slug = c.req.param('slug');
  const fs = await import('fs');
  const path = await import('path');
  const fullPath = path.join(process.cwd(), '..', '..', 'deploy', 'pages', companyId, `${slug}.html`);

  if (!fs.existsSync(fullPath)) {
    return c.html('<html><body><h1>Page not found</h1></body></html>', 404);
  }

  const html = fs.readFileSync(fullPath, 'utf-8');
  return c.html(html);
});

// Public webhooks (no auth — platforms call these directly)
app.route('/webhooks', webhooksRouter);
// Block 6: Omnichannel webhooks (mounted at /webhooks/omnichannel/* — Meta calls these without auth)
app.route('/webhooks/omnichannel', messengerWebhookRouter);

// API routes
const api = new Hono();
api.route('/auth', authRouter);
api.route('/companies', companiesRouter);
api.route('/agents', agentsRouter);
api.route('/tasks', tasksRouter);
api.route('/commands', commandsRouter);
// /strategy route removed — see docs/architecture/10-venture-ceo-ia.md
api.route('/inbox', inboxRouter);
api.route('/budget', budgetRouter);
api.route('/audit', auditRouter);
api.route('/communications', communicationsRouter);
api.route('/conflicts', conflictsRouter);
api.route('/events', eventsRouter);
api.route('/economy', economyRouter);
api.route('/marketplace', marketplaceRouter);
api.route('/simulation', simulationRouter);
api.route('/ftux', ftuxRouter);
api.route('/templates', templatesRouter);
api.route('/playbooks', playbooksRouter);
api.route('/guidance', guidanceRouter);
api.route('/landing-pages', landingPagesRouter);
api.route('/deployments', deploymentsRouter);
api.route('/execution', executionRouter);
api.route('/brand', brandRouter);
api.route('/assets', assetsRouter);
api.route('/assets-library', assetsLibraryRouter);
api.route('/execution-metrics', executionMetricsRouter);
api.route('/distribution', distributionRouter);
api.route('/workflows', workflowsRouter);
api.route('/outreach', outreachRouter);
api.route('/ads', adsRouter);
api.route('/lead-capture', leadCaptureRouter);
api.route('/tracking', trackingRouter);
api.route('/engines', enginesRouter);
api.route('/dashboard', dashboardRouter);
api.route('/integrations', integrationsRouter);
api.route('/knowledge', knowledgeRouter);
api.route('/marketing', marketingEngineRouter);
api.route('/chatbot', chatbotRouter);
api.route('/meetings', meetingsRouter);
api.route('/leads', leadsRouter);
api.route('/tenant-ai', tenantAIRouter);
api.route('/campaigns', campaignsRouter);
api.route('/brain', brainRouter);
api.route('/seo-engine', seoEngineRouter);
api.route('/blog', blogRouter);
api.route('/admin', adminRouter);
api.route('/billing', billingRouter);
api.route('/export', exportRouter);
api.route('/deployment-mode', deploymentModeRouter);
api.route('/admin/config', adminConfigRouter);
api.route('/admin/publish', adminPublishRouter);
api.route('/credits', creditsRouter);
api.route('/image-providers', imageProvidersRouter);
api.route('/market', marketRouter);
api.route('/admin/credits', adminCreditsRouter);
api.route('/insights', insightsRouter);
api.route('/sales', salesRouter);
api.route('/channels', channelsRouter);
api.route('/omnichannel', omnichannelRouter);
api.route('/social', socialRouter);
api.route('/gamification', gamificationRouter);
api.route('/geo', geoRouter);
api.route('/content-editor', contentEditorRouter);
api.route('/admin/setup', adminSetupRouter);
api.route('/brand-iq', brandIqRouter);
api.route('/team', teamRouter);

// Mount API
app.route('/api/v1', api);

// 404 handler
app.notFound((c) =>
  c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      },
    },
    404
  )
);

// Start server
const port = env.API_PORT;
console.log(`
🚀 AI Company OS API
━━━━━━━━━━━━━━━━━━━━
📍 Server:  http://localhost:${port}
📚 API:     http://localhost:${port}/api/v1
❤️  Health:  http://localhost:${port}/health
━━━━━━━━━━━━━━━━━━━━
`);

serve({
  fetch: app.fetch,
  port,
});

// Auto-seed admin account on startup
import { seedAdmin } from './lib/seed';
seedAdmin();

// Start BullMQ task worker (event-driven, no DB polling)
import { taskWorker } from './workers/task-worker';
taskWorker.start().catch((err) => {
  console.warn('⚠️  Task worker failed (Redis may be down — tasks stay pending):', err.message);
});

// Start feedback loop cron (checks every 30 min for optimization opportunities)
import { feedbackCron } from './workers/feedback-cron';
feedbackCron.start().catch((err) => {
  console.warn('⚠️  Feedback cron failed:', err.message);
});
