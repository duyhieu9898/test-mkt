import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../lib/db';
import { authMiddleware } from '../middleware/auth';
import { companies } from '@1person/core/db';
import type { CompanySettings } from '@1person/core';
import { CMSIntegration } from '../services/cms-integration';
import { decryptMaybe, encryptSecret, maskSecret } from '../lib/crypto';
import type { WebsitePublishingSettings } from '../services/website-publisher';
import { getWebsitePublishingSettings, isPlaceholderEndpointUrl, renderCustomApiPayload } from '../services/website-publisher';

const publishingRouter = new Hono();
publishingRouter.use('*', authMiddleware);

const destinationType = z.enum(['wordpress', 'custom_api', 'github']);

const savePublishingSchema = z.object({
  destinationType,
  destinationName: z.string().max(200).optional(),
  customApi: z.object({
    endpointUrl: z.string().url().optional().or(z.literal('')),
    authHeaderName: z.string().max(80).optional().or(z.literal('')),
    authHeaderValue: z.string().max(2000).optional().or(z.literal('')),
    payloadTemplate: z.string().max(20000).optional().or(z.literal('')),
    responseIdPath: z.string().max(120).optional().or(z.literal('')),
    responseUrlPath: z.string().max(120).optional().or(z.literal('')),
  }).optional(),
  github: z.object({
    repository: z.string().max(200).optional().or(z.literal('')),
    branch: z.string().max(120).optional().or(z.literal('')),
    contentFolder: z.string().max(200).optional().or(z.literal('')),
    fileFormat: z.enum(['markdown', 'mdx']).default('markdown'),
    token: z.string().max(2000).optional().or(z.literal('')),
  }).optional(),
});
type SavePublishingInput = z.infer<typeof savePublishingSchema>;

function buildPublishingSettings(
  body: SavePublishingInput,
  currentPublishing: WebsitePublishingSettings,
  options: { encryptSecrets: boolean },
): WebsitePublishingSettings {
  const nextPublishing: WebsitePublishingSettings = {
    destinationType: body.destinationType,
    destinationName: body.destinationName || undefined,
  };

  const protectSecret = options.encryptSecrets ? encryptSecret : (value: string) => value;

  if (body.destinationType === 'custom_api') {
    nextPublishing.customApi = {
      endpointUrl: body.customApi?.endpointUrl || undefined,
      authHeaderName: body.customApi?.authHeaderName || undefined,
      authHeaderValue: body.customApi?.authHeaderValue
        ? protectSecret(body.customApi.authHeaderValue)
        : currentPublishing.customApi?.authHeaderValue,
      payloadTemplate: body.customApi?.payloadTemplate || undefined,
      responseIdPath: body.customApi?.responseIdPath || undefined,
      responseUrlPath: body.customApi?.responseUrlPath || undefined,
    };
  }

  if (body.destinationType === 'github') {
    nextPublishing.github = {
      repository: body.github?.repository || undefined,
      branch: body.github?.branch || 'main',
      contentFolder: body.github?.contentFolder || 'content/blog',
      fileFormat: body.github?.fileFormat || 'markdown',
      token: body.github?.token
        ? protectSecret(body.github.token)
        : currentPublishing.github?.token,
    };
  }

  return nextPublishing;
}

async function getCompanyForUser(companyId: string, userId: string) {
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  return company;
}

function sanitizePublishing(settings: WebsitePublishingSettings) {
  return {
    ...settings,
    customApi: settings.customApi
      ? {
        ...settings.customApi,
        authHeaderValue: settings.customApi.authHeaderValue
          ? maskSecret(decryptMaybe(settings.customApi.authHeaderValue))
          : '',
        hasAuthHeaderValue: !!settings.customApi.authHeaderValue,
      }
      : undefined,
    github: settings.github
      ? {
        ...settings.github,
        token: settings.github.token ? maskSecret(decryptMaybe(settings.github.token)) : '',
        hasToken: !!settings.github.token,
      }
      : undefined,
  };
}

publishingRouter.get('/:companyId', async (c) => {
  const { userId } = c.get('user');
  const company = await getCompanyForUser(c.req.param('companyId'), userId);
  const settings = (company.settings || {}) as Record<string, any>;
  const publishing = getWebsitePublishingSettings(settings);
  const wp = settings.wordpress;

  return c.json({
    data: sanitizePublishing(publishing),
    wordpress: wp
      ? {
        siteUrl: wp.siteUrl,
        username: wp.username,
        connected: !!wp.appPassword,
      }
      : null,
  });
});

publishingRouter.put(
  '/:companyId',
  zValidator('json', savePublishingSchema),
  async (c) => {
    const { userId } = c.get('user');
    const company = await getCompanyForUser(c.req.param('companyId'), userId);
    const body = c.req.valid('json');
    const settings = (company.settings || {}) as Record<string, any>;
    const currentPublishing = (settings.publishing || {}) as WebsitePublishingSettings;
    const nextPublishing = buildPublishingSettings(body, currentPublishing, { encryptSecrets: true });
    if (nextPublishing.destinationType === 'custom_api' && !nextPublishing.customApi?.endpointUrl) {
      return c.json({
        error: { code: 'MISSING_ENDPOINT', message: 'Custom API endpoint is required. Enter the website API endpoint before saving.' },
      }, 400);
    }
    if (nextPublishing.destinationType === 'custom_api' && isPlaceholderEndpointUrl(nextPublishing.customApi?.endpointUrl)) {
      return c.json({
        error: { code: 'INVALID_ENDPOINT', message: 'Custom API endpoint cannot use a sample URL. Enter the real website API endpoint.' },
      }, 400);
    }

    const nextSettings = {
      ...settings,
      publishing: nextPublishing,
    } as unknown as CompanySettings;

    await db.update(companies)
      .set({
        settings: nextSettings,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, company.id));

    return c.json({ data: sanitizePublishing(nextPublishing) });
  },
);

publishingRouter.post('/:companyId/test', async (c) => {
  const { userId } = c.get('user');
  const company = await getCompanyForUser(c.req.param('companyId'), userId);
  const settings = (company.settings || {}) as Record<string, any>;
  const currentPublishing = (settings.publishing || {}) as WebsitePublishingSettings;
  const rawBody = await c.req.json().catch(() => null);
  const parsedBody = rawBody ? savePublishingSchema.safeParse(rawBody) : null;

  if (rawBody && parsedBody && !parsedBody.success) {
    return c.json({ ok: false, message: 'Publishing test payload is invalid.' }, 400);
  }

  const publishing = parsedBody?.success
    ? buildPublishingSettings(parsedBody.data, currentPublishing, { encryptSecrets: false })
    : getWebsitePublishingSettings(settings);

  try {
    if (publishing.destinationType === 'wordpress') {
      const wp = settings.wordpress;
      if (!wp?.siteUrl || !wp?.username || !wp?.appPassword) {
        return c.json({ ok: false, destinationType: 'wordpress', message: 'WordPress is not connected.' }, 400);
      }
      const cms = new CMSIntegration();
      const result = await cms.testWordPressConnection(wp.siteUrl, wp.username, decryptMaybe(wp.appPassword));
      return c.json({ ok: result.success, destinationType: 'wordpress', message: result.error || `Connected to ${result.siteName || wp.siteUrl}` });
    }

    if (publishing.destinationType === 'custom_api') {
      const endpoint = publishing.customApi?.endpointUrl;
      if (!endpoint) return c.json({ ok: false, destinationType: 'custom_api', message: 'Custom API endpoint is missing.' }, 400);
      if (isPlaceholderEndpointUrl(endpoint)) {
        return c.json({ ok: false, destinationType: 'custom_api', message: 'Custom API endpoint cannot use a sample URL. Enter the real website API endpoint.' }, 400);
      }
      renderCustomApiPayload(publishing.customApi?.payloadTemplate, {
        title: 'Sample draft title',
        slug: 'sample-draft-title',
        contentHtml: '<p>Sample draft content.</p>',
        contentMarkdown: 'Sample draft content.',
        excerpt: 'Sample excerpt',
        metaDescription: 'Sample meta description',
        status: 'draft',
        tags: ['sample'],
        images: [],
      });
      return c.json({ ok: true, destinationType: 'custom_api', message: 'Custom API endpoint and payload template are configured.' });
    }

    if (publishing.destinationType === 'github') {
      if (!publishing.github?.repository) return c.json({ ok: false, destinationType: 'github', message: 'Repository is missing.' }, 400);
      if (!publishing.github?.token) return c.json({ ok: false, destinationType: 'github', message: 'GitHub access token is missing.' }, 400);
      const [owner, repo] = publishing.github.repository.split('/');
      if (!owner || !repo) return c.json({ ok: false, destinationType: 'github', message: 'Repository must use owner/repository format.' }, 400);
      const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${decryptMaybe(publishing.github.token)}`,
        'User-Agent': '1person-website-publisher',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      const repositoryInfo = await response.json().catch(() => null) as { permissions?: { push?: boolean } } | null;
      if (!response.ok) {
        return c.json({ ok: false, destinationType: 'github', message: `GitHub repository check failed (HTTP ${response.status}).` }, 400);
      }
      if (repositoryInfo?.permissions && repositoryInfo.permissions.push === false) {
        return c.json({ ok: false, destinationType: 'github', message: 'GitHub token can read the repository but does not have write access.' }, 400);
      }

      const branch = publishing.github.branch || 'main';
      const branchResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, {
        headers: {
          ...headers,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!branchResponse.ok) {
        return c.json({ ok: false, destinationType: 'github', message: `GitHub token can access the repository, but branch "${branch}" was not found or is not readable.` }, 400);
      }

      return c.json({ ok: true, destinationType: 'github', message: `Connected to ${owner}/${repo} on branch ${branch}.` });
    }

    return c.json({ ok: false, message: 'Choose a website publishing destination.' }, 400);
  } catch (err) {
    return c.json({ ok: false, destinationType: publishing.destinationType, message: err instanceof Error ? err.message : 'Could not test destination.' }, 400);
  }
});

export default publishingRouter;
