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
      seo: page.seo as Record<string, unknown> | undefined,
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
          result = await this.deployToCloudflare(bundle, subdomain);
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
          deployedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(landingPageDeployments.id, deployment.id));

      // Update page status and URL
      await db
        .update(landingPages)
        .set({
          status: 'published',
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
   * Deploy to Cloudflare Pages (placeholder - needs actual API integration)
   */
  private async deployToCloudflare(
    bundle: { html: string; assets: Array<{ filename: string; content: string }> },
    subdomain: string
  ): Promise<{ url: string; externalId: string }> {
    // TODO: Implement Cloudflare Pages API integration
    console.log(`[DeploymentService] Would deploy to Cloudflare: ${subdomain}`);

    return {
      url: `https://${subdomain}.pages.dev`,
      externalId: `cf_${Date.now()}`,
    };
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
