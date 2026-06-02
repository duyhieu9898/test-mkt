/**
 * Public image provider catalog for the banner tier picker.
 *
 * Returns only enabled, credential-ready providers. End users see the
 * label, description, tier (fast/balanced/premium), and credit cost so
 * they can make a "pay more for better quality" decision.
 *
 * Secrets never appear in this response.
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { listImageProvidersPublic } from '../lib/config-resolver';

const imageProvidersRouter = new Hono();
imageProvidersRouter.use('*', authMiddleware);

imageProvidersRouter.get('/', async (c) => {
  const all = await listImageProvidersPublic();
  // Only show providers that are enabled AND have credentials configured.
  const available = all.filter((p) => p.enabled && p.ready);
  // Sort cheapest first so the "Standard" tier lands at the top.
  available.sort((a, b) => a.creditCost - b.creditCost);
  return c.json({ providers: available });
});

export default imageProvidersRouter;
