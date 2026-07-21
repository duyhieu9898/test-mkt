import { and, desc, eq, sql } from 'drizzle-orm';
import { companies, landingPageDeployments, landingPages } from '@1person/core/db';
import { db } from '../lib/db';
import { decryptMaybe } from '../lib/crypto';
import { CMSIntegration } from './cms-integration';
import { deploymentService } from './deployment-service';
import { pageRendererService } from './page-renderer-service';
import {
  assertWordPressPageIdentity,
  resolveWordPressPageId,
} from './wordpress-page-identity';
import { normalizeHostedLandingSlug } from './landing-site-hosting';

export type LandingPagePublishTarget = 'hosted' | 'wordpress';

export interface PublishLandingPageInput {
  pageId: string;
  userId: string;
  target: LandingPagePublishTarget;
  subdomain?: string;
  wordpress?: {
    status: 'draft' | 'publish';
    parentPageId?: number;
    template?: string;
    menuId?: number;
  };
}

export interface LandingPagePublishResult {
  target: LandingPagePublishTarget;
  deploymentId: string;
  url: string;
  status: 'draft' | 'published';
  message: string;
}

function wordpressAdminEditUrl(siteUrl: string, pageId: number) {
  return `${siteUrl.replace(/\/+$/, '')}/wp-admin/post.php?post=${pageId}&action=edit`;
}

export class LandingPagePublisher {
  async publish(input: PublishLandingPageInput): Promise<LandingPagePublishResult> {
    const page = await db.query.landingPages.findFirst({
      where: eq(landingPages.id, input.pageId),
    });
    if (!page) throw new Error('Landing page not found');

    const expectedProvider = input.target === 'hosted' ? 'cloudflare' : 'wordpress';
    if (
      page.status === 'published'
      && page.deploymentProvider
      && page.deploymentProvider !== expectedProvider
    ) {
      throw new Error('Take the current published page offline before changing its destination.');
    }

    return input.target === 'hosted'
      ? this.publishHosted(input, page.slug)
      : this.publishWordPress(input);
  }

  private async publishHosted(
    input: PublishLandingPageInput,
    fallbackSlug: string,
  ): Promise<LandingPagePublishResult> {
    const subdomain = normalizeHostedLandingSlug(input.subdomain || fallbackSlug);
    if (subdomain.length < 3 || subdomain.length > 60) {
      throw new Error('Website address must be between 3 and 60 characters.');
    }
    const taken = await db.query.landingPages.findFirst({
      where: eq(landingPages.subdomain, subdomain),
      columns: { id: true },
    });
    if (taken && taken.id !== input.pageId) {
      throw new Error('That website address is already in use. Choose another one.');
    }

    const result = await deploymentService.deploy(input.pageId, {
      provider: 'cloudflare',
      subdomain,
    });
    if (!result.success || !result.url) {
      throw new Error(result.message || 'Could not publish the hosted website.');
    }

    return {
      target: 'hosted',
      deploymentId: result.deploymentId,
      url: result.url,
      status: 'published',
      message: 'Website published successfully.',
    };
  }

  private async publishWordPress(input: PublishLandingPageInput): Promise<LandingPagePublishResult> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.pageId}))`);
      return this.publishWordPressLocked(input);
    });
  }

  private async publishWordPressLocked(input: PublishLandingPageInput): Promise<LandingPagePublishResult> {
    const page = await db.query.landingPages.findFirst({
      where: eq(landingPages.id, input.pageId),
    });
    if (!page) throw new Error('Landing page not found');

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, page.companyId),
    });
    const wp = ((company?.settings || {}) as Record<string, any>).wordpress;
    if (!wp?.siteUrl || !wp?.username || !wp?.appPassword) {
      throw new Error('WordPress is not connected for this company.');
    }

    const options = input.wordpress || { status: 'draft' as const };
    const appPassword = decryptMaybe(wp.appPassword);
    const content = await pageRendererService.renderToWordPressHtml(page.id);
    const versionId = await deploymentService.createVersion(page.id, input.userId);
    const existing = page.deploymentProvider === 'wordpress' && page.deploymentId
      ? await db.query.landingPageDeployments.findFirst({
        where: and(
          eq(landingPageDeployments.id, page.deploymentId),
          eq(landingPageDeployments.pageId, page.id),
        ),
      })
      : await db.query.landingPageDeployments.findFirst({
        where: and(
          eq(landingPageDeployments.pageId, page.id),
          eq(landingPageDeployments.externalProjectId, 'wordpress'),
        ),
        orderBy: [desc(landingPageDeployments.createdAt)],
      });
    const cms = new CMSIntegration();

    let result: { id: number; url: string };
    const existingPageId = resolveWordPressPageId(existing);
    if (existingPageId !== null) {
      result = await cms.updatePage(wp.siteUrl, wp.username, appPassword, existingPageId, {
        title: page.name,
        content,
        status: options.status,
        parent: options.parentPageId || 0,
        slug: page.slug,
        template: options.template || '',
      });
      assertWordPressPageIdentity(existingPageId, result.id);
    } else {
      result = await cms.publishPage(wp.siteUrl, wp.username, appPassword, {
        title: page.name,
        content,
        status: options.status,
        parent: options.parentPageId,
        slug: page.slug,
        template: options.template,
      });
    }

    if (options.menuId && options.status === 'publish') {
      try {
        await cms.addPageToMenu(wp.siteUrl, wp.username, appPassword, {
          menuId: options.menuId,
          pageId: result.id,
          title: page.name,
        });
      } catch (error) {
        // Publishing the page is the primary operation. A theme can omit the
        // menu REST endpoints, so menu placement remains best-effort.
        console.warn('[LandingPagePublisher] Could not add page to WordPress menu:', error);
      }
    }

    const destinationUrl = options.status === 'publish'
      ? result.url
      : wordpressAdminEditUrl(wp.siteUrl, result.id);
    if (existing) {
      await db.update(landingPageDeployments)
        .set({ status: 'rolled_back', updatedAt: new Date() })
        .where(eq(landingPageDeployments.id, existing.id));
    }
    const [deployment] = await db.insert(landingPageDeployments)
      .values({
        pageId: page.id,
        versionId,
        provider: 'custom',
        externalProjectId: 'wordpress',
        externalDeploymentId: String(result.id),
        url: destinationUrl,
        status: 'live',
        buildLogs: JSON.stringify({ publicationStatus: options.status }),
        deployedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!deployment) throw new Error('Could not save the landing page deployment.');

    await db.update(landingPages)
      .set({
        status: options.status === 'publish' ? 'published' : 'ready',
        publishedUrl: destinationUrl || null,
        deploymentProvider: 'wordpress',
        deploymentId: deployment.id,
        publishedAt: options.status === 'publish' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(landingPages.id, page.id));

    return {
      target: 'wordpress',
      deploymentId: deployment.id,
      url: destinationUrl,
      status: options.status === 'publish' ? 'published' : 'draft',
      message: options.status === 'publish'
        ? 'Landing page published on WordPress.'
        : 'Landing page saved as a WordPress draft.',
    };
  }

  async unpublish(pageId: string): Promise<void> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${pageId}))`);
      await this.unpublishLocked(pageId);
    });
  }

  private async unpublishLocked(pageId: string): Promise<void> {
    const page = await db.query.landingPages.findFirst({
      where: eq(landingPages.id, pageId),
    });
    if (!page) throw new Error('Landing page not found');

    if (page.deploymentProvider === 'cloudflare') {
      await deploymentService.unpublishHostedPage(pageId);
    } else if (page.deploymentProvider === 'wordpress' && page.deploymentId) {
      const deployment = await db.query.landingPageDeployments.findFirst({
        where: eq(landingPageDeployments.id, page.deploymentId),
      });
      if (!deployment) {
        throw new Error('The WordPress deployment record is missing. Unpublish was stopped.');
      }
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, page.companyId),
      });
      const wp = ((company?.settings || {}) as Record<string, any>).wordpress;
      if (!wp?.siteUrl || !wp?.username || !wp?.appPassword) {
        throw new Error('WordPress is not connected. Unpublish was stopped to avoid leaving the external page live.');
      }
      const wordpressPageId = resolveWordPressPageId(deployment);
      if (wordpressPageId === null) throw new Error('The WordPress Page ID is missing.');

      const cms = new CMSIntegration();
      const result = await cms.updatePage(
        wp.siteUrl,
        wp.username,
        decryptMaybe(wp.appPassword),
        wordpressPageId,
        { status: 'draft' },
      );
      assertWordPressPageIdentity(wordpressPageId, result.id);
      await db.update(landingPageDeployments)
        .set({ status: 'rolled_back', updatedAt: new Date() })
        .where(eq(landingPageDeployments.id, deployment.id));
    }

    await db.update(landingPages)
      .set({
        status: 'ready',
        publishedUrl: null,
        publishedAt: null,
        deploymentProvider: null,
        deploymentId: null,
        updatedAt: new Date(),
      })
      .where(eq(landingPages.id, pageId));
  }
}

export const landingPagePublisher = new LandingPagePublisher();
