/**
 * Deployment Service
 *
 * Handles deploying landing pages to various hosting providers
 * Currently supports: Vercel, Cloudflare Pages
 */

import { db } from '../lib/db';
import { eq, desc, and } from 'drizzle-orm';
import {
  landingPages,
  landingPageSections,
  landingPageDeployments,
  landingPageVersions,
} from '@1person/core/db';
import { pageRendererService } from './page-renderer-service';
import { deleteObjectByKey, saveObject } from './object-storage';
import {
  hostedLandingPageCurrentKey,
  hostedLandingPageVersionKey,
} from './landing-site-hosting';

// =============================================================================
// TYPES
// =============================================================================

export interface DeployOptions {
  provider: 'vercel' | 'cloudflare' | 'custom';
  subdomain?: string;
  customDomain?: string;
}

export interface DeployResult {
  success: boolean;
  deploymentId: string;
  url?: string;
  status: 'pending' | 'building' | 'deploying' | 'live' | 'failed';
  message?: string;
}

export interface DomainConfig {
  domain: string;
  verified: boolean;
  sslStatus: 'pending' | 'active' | 'failed';
  sslExpiresAt?: Date;
}

// =============================================================================
// SERVICE
// =============================================================================

export class DeploymentService {
  /**
   * Create a new version snapshot of the page
   */
  async createVersion(pageId: string, publishedBy?: string): Promise<string> {
    const page = await db.query.landingPages.findFirst({
      where: eq(landingPages.id, pageId),
      with: { sections: true },
    });

    if (!page) {
      throw new Error('Page not found');
    }

    // Get the latest version number
    const latestVersion = await db.query.landingPageVersions.findFirst({
      where: eq(landingPageVersions.pageId, pageId),
      orderBy: [desc(landingPageVersions.version)],
    });

    const newVersionNumber = (latestVersion?.version || 0) + 1;

    // Create snapshot
    const sectionsSnapshot = (page.sections || []).map((s) => ({
      type: s.type,
      order: s.order,
      content: s.content as Record<string, unknown>,
      backgroundColor: s.backgroundColor ?? undefined,
    }));

    const pageSettingsSnapshot = {
      primaryColor: page.primaryColor ?? undefined,
      secondaryColor: page.secondaryColor ?? undefined,
      fontFamily: page.fontFamily ?? undefined,
      style: page.style ?? undefined,
      seo: page.seo as unknown as Record<string, unknown> | undefined,
    };

    const [version] = await db
      .insert(landingPageVersions)
      .values({
        pageId,
        version: newVersionNumber,
        name: `Version ${newVersionNumber}`,
        sectionsSnapshot,
        pageSettingsSnapshot,
        publishedBy: publishedBy || undefined,
        publishedAt: new Date(),
      })
      .returning();
    if (!version) throw new Error('Could not create a landing page version.');

    return version.id;
  }

  /**
   * Deploy a landing page to a hosting provider
   */
  async deploy(pageId: string, options: DeployOptions): Promise<DeployResult> {
    const page = await db.query.landingPages.findFirst({
      where: eq(landingPages.id, pageId),
    });

    if (!page) {
      throw new Error('Page not found');
    }

    // Create a version snapshot
    const versionId = await this.createVersion(pageId);

    // Generate subdomain if not provided
    const subdomain = options.subdomain || `${page.slug}-${Date.now().toString(36)}`;

    // Create deployment record
    const [deployment] = await db
      .insert(landingPageDeployments)
      .values({
        pageId,
        versionId,
        provider: options.provider,
        subdomain,
        customDomain: options.customDomain,
        status: 'pending',
      })
      .returning();
    if (!deployment) throw new Error('Could not create a landing page deployment.');

    try {
      // Generate static HTML
      const bundle = await pageRendererService.generateStaticBundle(pageId);

      // Deploy based on provider
      let result: { url: string; externalId: string };

      switch (options.provider) {
        case 'vercel':
          result = await this.deployToVercel(bundle, subdomain);
          break;
        case 'cloudflare':
          result = await this.deployToCloudflare(bundle, subdomain, versionId);
          break;
        default:
          // For custom/development, just mark as live with a local URL
          result = {
            url: `https://${subdomain}.pages.1person.ai`,
            externalId: deployment.id,
          };
      }

      // Update deployment record
      await db
        .update(landingPageDeployments)
        .set({
          status: 'live',
          url: result.url,
          externalDeploymentId: result.externalId,
          buildLogs: JSON.stringify({ publicationStatus: 'publish' }),
          deployedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(landingPageDeployments.id, deployment.id));
      if (page.deploymentId && page.deploymentId !== deployment.id) {
        await db.update(landingPageDeployments)
          .set({ status: 'rolled_back', updatedAt: new Date() })
          .where(eq(landingPageDeployments.id, page.deploymentId));
      }

      // Update page status and URL
      await db
        .update(landingPages)
        .set({
          status: 'published',
          subdomain,
          publishedUrl: result.url,
          deploymentProvider: options.provider,
          deploymentId: deployment.id,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, pageId));

      return {
        success: true,
        deploymentId: deployment.id,
        url: result.url,
        status: 'live',
      };
    } catch (error) {
      // Update deployment as failed
      await db
        .update(landingPageDeployments)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Deployment failed',
          updatedAt: new Date(),
        })
        .where(eq(landingPageDeployments.id, deployment.id));

      return {
        success: false,
        deploymentId: deployment.id,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Deployment failed',
      };
    }
  }

  /**
   * Deploy to Vercel (placeholder - needs actual API integration)
   */
  private async deployToVercel(
    bundle: { html: string; assets: Array<{ filename: string; content: string }> },
    subdomain: string
  ): Promise<{ url: string; externalId: string }> {
    // TODO: Implement Vercel API integration
    // For now, return a mock result
    console.log(`[DeploymentService] Would deploy to Vercel: ${subdomain}`);

    return {
      url: `https://${subdomain}.vercel.app`,
      externalId: `vercel_${Date.now()}`,
    };
  }

  /**
   * Publish static HTML to object storage. The public URL is a stable path
   * such as /sites/<slug>, while the actual HTML lives at sites/<slug>/index.html.
   */
  private async deployToCloudflare(
    bundle: { html: string; assets: Array<{ filename: string; content: string }> },
    subdomain: string,
    versionId: string,
  ): Promise<{ url: string; externalId: string }> {
    const publicBaseUrl = process.env.LANDING_PAGE_PUBLIC_BASE_URL
      ?.trim()
      .replace(/\/+$/, '');
    const urlMode = process.env.LANDING_PAGE_PUBLIC_URL_MODE?.trim().toLowerCase()
      || (publicBaseUrl ? 'path' : 'subdomain');
    const baseDomain = process.env.LANDING_PAGE_PUBLIC_BASE_DOMAIN
      ?.trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');
    if (urlMode === 'path' && !publicBaseUrl) {
      throw new Error('Missing LANDING_PAGE_PUBLIC_BASE_URL for path-based hosted landing pages.');
    }
    if (urlMode === 'subdomain' && !baseDomain) {
      throw new Error('Missing LANDING_PAGE_PUBLIC_BASE_DOMAIN for subdomain-based hosted landing pages.');
    }

    await saveObject({
      key: hostedLandingPageVersionKey(subdomain, versionId),
      body: Buffer.from(bundle.html, 'utf8'),
      contentType: 'text/html; charset=utf-8',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    const current = await saveObject({
      key: hostedLandingPageCurrentKey(subdomain),
      body: Buffer.from(bundle.html, 'utf8'),
      contentType: 'text/html; charset=utf-8',
      cacheControl: 'public, max-age=60, must-revalidate',
    });

    const url = urlMode === 'path'
      ? `${publicBaseUrl}/${subdomain}`
      : `https://${subdomain}.${baseDomain}`;
    await this.verifyHostedWebsite(url, subdomain, versionId);

    return {
      url,
      externalId: current.key,
    };
  }

  private async verifyHostedWebsite(
    url: string,
    subdomain: string,
    versionId: string,
  ): Promise<void> {
    let lastStatus: number | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const separator = url.includes('?') ? '&' : '?';
        const response = await fetch(
          `${url}${separator}_1person_version=${encodeURIComponent(versionId)}`,
          {
            headers: { Accept: 'text/html' },
            signal: AbortSignal.timeout(10000),
          },
        );
        lastStatus = response.status;
        if (
          response.ok
          && response.headers.get('x-1person-landing-site') === subdomain
        ) {
          return;
        }
      } catch {
        // Retry short-lived propagation and network errors.
      }
    }

    throw new Error(
      `Landing Page HTML was uploaded to object storage, but the public URL did not serve it`
      + `${lastStatus ? ` (HTTP ${lastStatus})` : ''}. Confirm nginx proxies /sites/ to the API `
      + 'and LANDING_PAGE_PUBLIC_BASE_URL points to the same /sites path.',
    );
  }

  async unpublishHostedPage(pageId: string): Promise<void> {
    const page = await db.query.landingPages.findFirst({
      where: eq(landingPages.id, pageId),
    });
    if (!page) throw new Error('Page not found');

    const deployment = page.deploymentId
      ? await db.query.landingPageDeployments.findFirst({
        where: eq(landingPageDeployments.id, page.deploymentId),
      })
      : null;
    if (deployment?.provider === 'cloudflare' && deployment.externalDeploymentId) {
      await deleteObjectByKey(deployment.externalDeploymentId);
      await db.update(landingPageDeployments)
        .set({ status: 'rolled_back', updatedAt: new Date() })
        .where(eq(landingPageDeployments.id, deployment.id));
    }
  }

  /**
   * Get deployments for a page
   */
  async getDeployments(pageId: string) {
    return db.query.landingPageDeployments.findMany({
      where: eq(landingPageDeployments.pageId, pageId),
      orderBy: [desc(landingPageDeployments.createdAt)],
    });
  }

  /**
   * Get versions for a page
   */
  async getVersions(pageId: string) {
    return db.query.landingPageVersions.findMany({
      where: eq(landingPageVersions.pageId, pageId),
      orderBy: [desc(landingPageVersions.version)],
    });
  }

  /**
   * Rollback to a previous version
   */
  async rollback(pageId: string, versionId: string): Promise<void> {
    const version = await db.query.landingPageVersions.findFirst({
      where: and(
        eq(landingPageVersions.id, versionId),
        eq(landingPageVersions.pageId, pageId)
      ),
    });

    if (!version) {
      throw new Error('Version not found');
    }

    // Delete current sections
    await db.delete(landingPageSections).where(eq(landingPageSections.pageId, pageId));

    // Restore sections from snapshot
    const snapshot = version.sectionsSnapshot as Array<{
      type: string;
      order: number;
      content: Record<string, unknown>;
      backgroundColor?: string;
    }>;

    if (snapshot && snapshot.length > 0) {
      await db.insert(landingPageSections).values(
        snapshot.map((s) => ({
          pageId,
          type: s.type as any,
          order: s.order,
          content: s.content,
          backgroundColor: s.backgroundColor,
        }))
      );
    }

    // Restore page settings
    const settings = version.pageSettingsSnapshot as {
      primaryColor?: string;
      secondaryColor?: string;
      fontFamily?: string;
      style?: string;
    };

    if (settings) {
      await db
        .update(landingPages)
        .set({
          primaryColor: settings.primaryColor,
          secondaryColor: settings.secondaryColor,
          fontFamily: settings.fontFamily,
          style: settings.style as any,
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, pageId));
    }
  }

  /**
   * Configure custom domain
   */
  async configureDomain(pageId: string, domain: string): Promise<DomainConfig> {
    // Update page with custom domain
    await db
      .update(landingPages)
      .set({
        customDomain: domain,
        updatedAt: new Date(),
      })
      .where(eq(landingPages.id, pageId));

    // TODO: Implement actual DNS verification and SSL provisioning
    return {
      domain,
      verified: false,
      sslStatus: 'pending',
    };
  }
}

export const deploymentService = new DeploymentService();
