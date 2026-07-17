import { CMSIntegration } from './cms-integration';
import { decryptMaybe } from '../lib/crypto';

export type WebsitePublisherType = 'wordpress' | 'custom_api' | 'github';

export interface WebsitePublishingSettings {
  destinationType?: WebsitePublisherType;
  destinationName?: string;
  customApi?: {
    endpointUrl?: string;
    authHeaderName?: string;
    authHeaderValue?: string;
    payloadTemplate?: string;
    responseIdPath?: string;
    responseUrlPath?: string;
  };
  github?: {
    repository?: string;
    branch?: string;
    contentFolder?: string;
    fileFormat?: 'markdown' | 'mdx';
    token?: string;
  };
}

export interface PublishWebsitePostInput {
  title: string;
  slug: string;
  contentHtml: string;
  contentMarkdown?: string;
  excerpt?: string | null;
  metaDescription?: string | null;
  tags?: string[];
  categories?: number[];
  status: 'draft' | 'publish';
  featuredMediaId?: number;
  images?: Array<{ url: string; alt?: string; role?: 'hero' | 'inline' }>;
  wordpressPlacement?: {
    type: 'post_category' | 'child_page';
    parentPageId?: number;
  };
}

export interface PublishWebsitePostResult {
  destinationType: WebsitePublisherType;
  destinationName: string;
  externalId?: string | number;
  url?: string;
  status: 'draft' | 'published' | 'sent';
  message: string;
  raw?: unknown;
}

export function getWebsitePublishingSettings(companySettings: unknown): WebsitePublishingSettings {
  const settings = (companySettings || {}) as Record<string, any>;
  const publishing = (settings.publishing || {}) as WebsitePublishingSettings;

  if (
    publishing.destinationType === 'wordpress'
    || publishing.destinationType === 'custom_api'
    || publishing.destinationType === 'github'
  ) {
    return publishing;
  }
  if (settings.wordpress?.siteUrl) {
    return {
      destinationType: 'wordpress',
      destinationName: settings.wordpress.siteUrl,
    };
  }

  return {
    destinationType: 'wordpress',
    destinationName: 'WordPress',
  };
}

export function getDestinationLabel(settings: WebsitePublishingSettings): string {
  if (settings.destinationName) return settings.destinationName;
  switch (settings.destinationType) {
    case 'wordpress':
      return 'WordPress';
    case 'custom_api':
      return 'Custom website API';
    case 'github':
      return 'GitHub repository';
    default:
      return 'WordPress';
  }
}

export function isPlaceholderEndpointUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const sampleHosts = ['com', 'org', 'net'].map((tld) => ['example', tld].join('.'));
    return sampleHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export const DEFAULT_CUSTOM_API_PAYLOAD_TEMPLATE = `{
  "title": "{{title}}",
  "slug": "{{slug}}",
  "contentHtml": "{{contentHtml}}",
  "contentMarkdown": "{{contentMarkdown}}",
  "excerpt": "{{excerpt}}",
  "metaDescription": "{{metaDescription}}",
  "status": "{{status}}",
  "tags": {{tagsJson}},
  "images": {{imagesJson}}
}`;

function jsonStringContent(value: unknown): string {
  return JSON.stringify(value ?? '').slice(1, -1);
}

function buildTemplateContext(input: PublishWebsitePostInput): Record<string, string> {
  const heroImage = input.images?.find((image) => image.role === 'hero');
  return {
    title: jsonStringContent(input.title),
    slug: jsonStringContent(input.slug),
    contentHtml: jsonStringContent(input.contentHtml),
    contentMarkdown: jsonStringContent(input.contentMarkdown || ''),
    excerpt: jsonStringContent(input.excerpt || ''),
    metaDescription: jsonStringContent(input.metaDescription || ''),
    status: jsonStringContent('draft'),
    heroImageUrl: jsonStringContent(heroImage?.url || ''),
    tagsJson: JSON.stringify(input.tags || []),
    imagesJson: JSON.stringify(input.images || []),
  };
}

export function renderCustomApiPayload(template: string | undefined, input: PublishWebsitePostInput): unknown {
  const source = template?.trim() || DEFAULT_CUSTOM_API_PAYLOAD_TEMPLATE;
  const context = buildTemplateContext(input);
  const rendered = source.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in context)) {
      throw new Error(`Unknown Custom API payload placeholder: ${key}`);
    }
    return context[key]!;
  });

  try {
    return JSON.parse(rendered);
  } catch {
    throw new Error('Custom API payload template must render to valid JSON.');
  }
}

function getPathValue(source: unknown, path?: string): unknown {
  if (!path) return undefined;
  return path
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<unknown>((value, part) => {
      if (value == null || typeof value !== 'object') return undefined;
      return (value as Record<string, unknown>)[part];
    }, source);
}

function parseGitHubRepository(repository?: string): { owner: string; repo: string } {
  const match = repository?.trim().match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) throw new Error('GitHub repository must use the owner/repository format.');
  return { owner: match[1]!, repo: match[2]! };
}

function encodeGitHubPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function toBase64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

async function githubRequest<T>(args: {
  token: string;
  method: string;
  path: string;
  body?: unknown;
}): Promise<T> {
  const response = await fetch(`https://api.github.com${args.path}`, {
    method: args.method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${args.token}`,
      'Content-Type': 'application/json',
      'User-Agent': '1person-website-publisher',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(async () => ({ message: await response.text().catch(() => '') }));
  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : `HTTP ${response.status}`;
    throw new Error(`GitHub API failed: ${message}`);
  }
  return payload as T;
}

function safeYamlString(value: unknown): string {
  return JSON.stringify(String(value ?? ''));
}

function buildGitHubPostFile(input: PublishWebsitePostInput): string {
  const tags = JSON.stringify(input.tags || []);
  const images = JSON.stringify(input.images || []);
  const body = input.contentMarkdown || input.contentHtml;
  return `---
title: ${safeYamlString(input.title)}
slug: ${safeYamlString(input.slug)}
description: ${safeYamlString(input.metaDescription || input.excerpt || '')}
status: "draft"
date: ${safeYamlString(new Date().toISOString())}
tags: ${tags}
images: ${images}
---

${body}
`;
}

export async function publishWebsitePost(args: {
  companySettings: unknown;
  input: PublishWebsitePostInput;
}): Promise<PublishWebsitePostResult> {
  const allSettings = (args.companySettings || {}) as Record<string, any>;
  const destination = getWebsitePublishingSettings(allSettings);
  const destinationType = destination.destinationType || 'wordpress';
  const destinationName = getDestinationLabel(destination);

  if (destinationType === 'wordpress') {
    const wp = allSettings.wordpress as
      | { siteUrl?: string; username?: string; appPassword?: string }
      | undefined;
    if (!wp?.siteUrl || !wp?.username || !wp?.appPassword) {
      throw new Error('WordPress is not connected for this company.');
    }

    const cms = new CMSIntegration();
    if (args.input.wordpressPlacement?.type === 'child_page') {
      const result = await cms.publishPage(wp.siteUrl, wp.username, decryptMaybe(wp.appPassword), {
        title: args.input.title,
        content: args.input.contentHtml,
        status: args.input.status,
        parent: args.input.wordpressPlacement.parentPageId,
        slug: args.input.slug,
      });

      return {
        destinationType,
        destinationName: wp.siteUrl,
        externalId: result.id,
        url: result.url,
        status: args.input.status === 'publish' ? 'published' : 'draft',
        message: `Created ${args.input.status === 'publish' ? 'published page' : 'draft page'} on WordPress`,
        raw: result,
      };
    }

    const result = await cms.publishPost(wp.siteUrl, wp.username, decryptMaybe(wp.appPassword), {
      title: args.input.title,
      content: args.input.contentHtml,
      excerpt: args.input.excerpt || undefined,
      status: args.input.status,
      tags: args.input.tags,
      categories: args.input.categories,
      featuredMediaId: args.input.featuredMediaId,
    });

    return {
      destinationType,
      destinationName: wp.siteUrl,
      externalId: result.id,
      url: result.url,
      status: args.input.status === 'publish' ? 'published' : 'draft',
      message: `Created ${args.input.status === 'publish' ? 'published post' : 'draft'} on WordPress`,
      raw: result,
    };
  }

  if (destinationType === 'custom_api') {
    const custom = destination.customApi;
    if (!custom?.endpointUrl) {
      throw new Error('Custom API destination is missing an endpoint URL.');
    }
    if (isPlaceholderEndpointUrl(custom.endpointUrl)) {
      throw new Error('Custom API endpoint is still using a sample URL. Enter the real website API endpoint in Website Publishing settings.');
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (custom.authHeaderName && custom.authHeaderValue) {
      headers[custom.authHeaderName] = decryptMaybe(custom.authHeaderValue);
    }

    const requestPayload = renderCustomApiPayload(custom.payloadTemplate, {
      ...args.input,
      status: 'draft',
    });

    const response = await fetch(custom.endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestPayload),
      signal: AbortSignal.timeout(30000),
    });

    const raw = await response.json().catch(async () => ({ text: await response.text().catch(() => '') }));
    if (!response.ok) {
      throw new Error(`Custom API publish failed (HTTP ${response.status}).`);
    }

    const payload = raw as Record<string, any>;
    const externalId = getPathValue(payload, custom.responseIdPath) ?? payload.id ?? payload.externalId;
    const url = getPathValue(payload, custom.responseUrlPath) ?? payload.url ?? payload.link;
    return {
      destinationType,
      destinationName,
      externalId: typeof externalId === 'string' || typeof externalId === 'number' ? externalId : undefined,
      url: typeof url === 'string' ? url : undefined,
      status: 'sent',
      message: 'Sent draft article payload to the custom website API',
      raw,
    };
  }

  if (destinationType === 'github') {
    const github = destination.github;
    if (!github?.repository) {
      throw new Error('GitHub destination is missing a repository.');
    }
    if (!github.token) {
      throw new Error('GitHub destination is missing an access token.');
    }

    const { owner, repo } = parseGitHubRepository(github.repository);
    const token = decryptMaybe(github.token);
    const baseBranch = github.branch || 'main';
    const folder = (github.contentFolder || 'content/blog').replace(/^\/+|\/+$/g, '');
    const extension = github.fileFormat === 'mdx' ? 'mdx' : 'md';
    const filePath = `${folder}/${args.input.slug}.${extension}`;
    const draftBranch = `1person/${args.input.slug.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60)}-${Date.now()}`;
    const fileContent = buildGitHubPostFile({ ...args.input, status: 'draft' });

    const baseRef = await githubRequest<{ object: { sha: string } }>({
      token,
      method: 'GET',
      path: `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
    });
    await githubRequest({
      token,
      method: 'POST',
      path: `/repos/${owner}/${repo}/git/refs`,
      body: {
        ref: `refs/heads/${draftBranch}`,
        sha: baseRef.object.sha,
      },
    });
    await githubRequest({
      token,
      method: 'PUT',
      path: `/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}`,
      body: {
        message: `Add draft blog post: ${args.input.title}`,
        content: toBase64(fileContent),
        branch: draftBranch,
      },
    });
    const pull = await githubRequest<{ number: number; html_url: string }>({
      token,
      method: 'POST',
      path: `/repos/${owner}/${repo}/pulls`,
      body: {
        title: `Draft blog post: ${args.input.title}`,
        head: draftBranch,
        base: baseBranch,
        body: 'Draft blog post generated by 1Person. Review and merge when ready to publish.',
      },
    });

    return {
      destinationType,
      destinationName,
      externalId: pull.number,
      url: pull.html_url,
      status: 'sent',
      message: 'Created a GitHub pull request with the draft article file',
      raw: {
        repository: github.repository,
        branch: draftBranch,
        filePath,
        pullRequestUrl: pull.html_url,
      },
    };
  }

  throw new Error(`Unsupported website publishing destination: ${destinationType}`);
}
