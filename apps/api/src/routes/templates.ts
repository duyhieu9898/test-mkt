import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { templateService } from '../services/template-service';

const templatesRouter = new Hono();

// Apply auth to all routes
templatesRouter.use('*', authMiddleware);

// Schemas
const matchTemplateSchema = z.object({
  prompt: z.string().min(5).max(1000),
});

// List all templates
templatesRouter.get('/', async (c) => {
  const allTemplates = await templateService.getAllTemplates();
  return c.json({ data: allTemplates });
});

// Get template by ID
templatesRouter.get('/:id', async (c) => {
  const templateId = c.req.param('id');

  const template = await templateService.getTemplate(templateId);

  if (!template) {
    throw new HTTPException(404, { message: 'Template not found' });
  }

  return c.json(template);
});

// Get template by slug
templatesRouter.get('/slug/:slug', async (c) => {
  const slug = c.req.param('slug');

  const template = await templateService.getTemplateBySlug(slug);

  if (!template) {
    throw new HTTPException(404, { message: 'Template not found' });
  }

  return c.json(template);
});

// Match prompt to template
templatesRouter.post(
  '/match',
  zValidator('json', matchTemplateSchema),
  async (c) => {
    const { prompt } = c.req.valid('json');

    const match = await templateService.matchTemplate(prompt);

    if (!match) {
      throw new HTTPException(404, {
        message: 'No matching template found',
      });
    }

    return c.json({
      templateId: match.templateId,
      score: match.score,
      template: match.template,
    });
  }
);

// Get playbook for a template
templatesRouter.get('/:id/playbook', async (c) => {
  const templateId = c.req.param('id');

  const template = await templateService.getTemplate(templateId);

  if (!template) {
    throw new HTTPException(404, { message: 'Template not found' });
  }

  const playbook = await templateService.getPlaybookForTemplate(templateId);

  if (!playbook) {
    throw new HTTPException(404, { message: 'No playbook found for this template' });
  }

  return c.json(playbook);
});

// Seed default templates (admin only - for now just authenticated)
templatesRouter.post('/seed', async (c) => {
  try {
    await templateService.seedDefaultTemplates();
    return c.json({
      success: true,
      message: 'Default templates seeded successfully',
    });
  } catch (error) {
    throw new HTTPException(500, {
      message: 'Failed to seed templates',
    });
  }
});

export default templatesRouter;
