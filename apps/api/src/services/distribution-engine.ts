import { eq, and, lte, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  socialConnections,
  scheduledPosts,
  postEngagements,
  marketingCampaigns,
  type SocialConnection,
  type ScheduledPost,
  type NewScheduledPost,
} from '@1person/core/db';
import { platformRegistry } from './platforms';
import type { PlatformConnection, PostContent } from './platforms';

// ============================================
// DISTRIBUTION ENGINE SERVICE
// ============================================

export class DistributionEngine {
  /**
   * Connect a social media account
   */
  async connectAccount(
    companyId: string,
    platform: string,
    accessToken: string,
    options: {
      refreshToken?: string;
      tokenExpiresAt?: Date;
      platformUserId?: string;
      platformPageId?: string;
      platformAccountName?: string;
      permissions?: string[];
    }
  ): Promise<string> {
    // Check if connection already exists
    const existing = await db.query.socialConnections.findFirst({
      where: and(
        eq(socialConnections.companyId, companyId),
        eq(socialConnections.platform, platform)
      ),
    });

    if (existing) {
      // Update existing connection
      await db
        .update(socialConnections)
        .set({
          accessToken,
          refreshToken: options.refreshToken,
          tokenExpiresAt: options.tokenExpiresAt,
          platformUserId: options.platformUserId,
          platformPageId: options.platformPageId,
          platformAccountName: options.platformAccountName,
          permissions: options.permissions || [],
          status: 'connected',
          connectedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(socialConnections.id, existing.id));

      console.log(`[Distribution] Updated ${platform} connection for company ${companyId}`);
      return existing.id;
    }

    // Create new connection
    const result = await db
      .insert(socialConnections)
      .values({
        companyId,
        platform,
        accessToken,
        refreshToken: options.refreshToken,
        tokenExpiresAt: options.tokenExpiresAt,
        platformUserId: options.platformUserId,
        platformPageId: options.platformPageId,
        platformAccountName: options.platformAccountName,
        permissions: options.permissions || [],
        status: 'connected',
      })
      .returning({ id: socialConnections.id });

    const connection = result[0];
    if (!connection) {
      throw new Error('Failed to create connection');
    }

    console.log(`[Distribution] Connected ${platform} for company ${companyId}`);
    return connection.id;
  }

  /**
   * Get all connections for a company
   */
  async getConnections(companyId: string): Promise<SocialConnection[]> {
    return db.query.socialConnections.findMany({
      where: eq(socialConnections.companyId, companyId),
      orderBy: desc(socialConnections.connectedAt),
    });
  }

  /**
   * Create a scheduled post
   */
  async createPost(data: {
    companyId: string;
    connectionId: string;
    platform: string;
    contentText: string;
    hashtags?: string[];
    mediaUrls?: string[];
    scheduledFor: Date;
    campaignId?: string;
    campaignName?: string;
    createdByAgentId?: string;
  }): Promise<string> {
    const [post] = await db
      .insert(scheduledPosts)
      .values({
        companyId: data.companyId,
        connectionId: data.connectionId,
        platform: data.platform,
        contentText: data.contentText,
        hashtags: data.hashtags || [],
        mediaUrls: data.mediaUrls || [],
        scheduledFor: data.scheduledFor,
        campaignId: data.campaignId,
        campaignName: data.campaignName,
        createdByAgentId: data.createdByAgentId,
        status: 'scheduled',
      })
      .returning({ id: scheduledPosts.id });

    if (!post) {
      throw new Error('Failed to create post');
    }

    console.log(`[Distribution] Created scheduled post ${post.id} for ${data.scheduledFor}`);
    return post.id;
  }

  /**
   * Publish a post immediately
   */
  async publishPost(postId: string): Promise<{
    success: boolean;
    platformPostId?: string;
    platformPostUrl?: string;
    error?: string;
  }> {
    // Get post and connection
    const post = await db.query.scheduledPosts.findFirst({
      where: eq(scheduledPosts.id, postId),
    });

    if (!post) {
      return { success: false, error: 'Post not found' };
    }

    const connection = await db.query.socialConnections.findFirst({
      where: eq(socialConnections.id, post.connectionId),
    });

    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    if (connection.status !== 'connected') {
      return { success: false, error: `Connection status: ${connection.status}` };
    }

    // Update status to publishing
    await db
      .update(scheduledPosts)
      .set({ status: 'publishing', updatedAt: new Date() })
      .where(eq(scheduledPosts.id, postId));

    try {
      // Get the provider from registry — works for ALL platforms, no if/else
      if (!platformRegistry.hasSocialProvider(post.platform)) {
        return { success: false, error: `Platform ${post.platform} not supported. Available: ${platformRegistry.getSupportedSocialPlatforms().join(', ')}` };
      }

      const provider = platformRegistry.getSocialProvider(post.platform);

      // Build platform-agnostic connection and content
      const conn: PlatformConnection = {
        id: connection.id,
        companyId: connection.companyId,
        platform: connection.platform,
        status: connection.status,
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
        tokenExpiresAt: connection.tokenExpiresAt,
        platformAccountId: connection.platformUserId || connection.platformPageId || undefined,
        platformPageId: connection.platformPageId,
        platformAccountName: connection.platformAccountName,
      };

      const content: PostContent = {
        text: post.contentText,
        hashtags: (post.hashtags as string[]) || [],
        mediaUrls: (post.mediaUrls as string[]) || [],
      };

      // Publish via the provider
      const result = await provider.publishPost(conn, content);

      if (result.success) {
        // Update post with platform response
        await db
          .update(scheduledPosts)
          .set({
            status: 'published',
            publishedAt: new Date(),
            platformPostId: result.platformPostId,
            platformPostUrl: result.platformPostUrl,
            updatedAt: new Date(),
          })
          .where(eq(scheduledPosts.id, postId));

        // Update connection last used
        await db
          .update(socialConnections)
          .set({ lastUsedAt: new Date() })
          .where(eq(socialConnections.id, connection.id));

        console.log(`[Distribution] Published post ${postId} to ${post.platform}: ${result.platformPostId}`);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update post with error
      await db
        .update(scheduledPosts)
        .set({
          status: 'failed',
          lastError: errorMessage,
          retryCount: (post.retryCount || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(scheduledPosts.id, postId));

      console.error(`[Distribution] Failed to publish post ${postId}:`, error);

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get posts due for publishing
   */
  async getDuePosts(): Promise<ScheduledPost[]> {
    const now = new Date();

    return db.query.scheduledPosts.findMany({
      where: and(
        eq(scheduledPosts.status, 'scheduled'),
        lte(scheduledPosts.scheduledFor, now)
      ),
      orderBy: scheduledPosts.scheduledFor,
    });
  }

  /**
   * Process all due posts (called by scheduler)
   */
  async processDuePosts(): Promise<{
    processed: number;
    published: number;
    failed: number;
  }> {
    const duePosts = await this.getDuePosts();
    let published = 0;
    let failed = 0;

    for (const post of duePosts) {
      const result = await this.publishPost(post.id);
      if (result.success) {
        published++;
      } else {
        failed++;
      }
    }

    console.log(`[Distribution] Processed ${duePosts.length} posts: ${published} published, ${failed} failed`);

    return {
      processed: duePosts.length,
      published,
      failed,
    };
  }

  /**
   * Fetch and store engagement metrics for a post
   */
  async fetchEngagement(postId: string): Promise<void> {
    const post = await db.query.scheduledPosts.findFirst({
      where: eq(scheduledPosts.id, postId),
    });

    if (!post || post.status !== 'published' || !post.platformPostId) {
      return;
    }

    const connection = await db.query.socialConnections.findFirst({
      where: eq(socialConnections.id, post.connectionId),
    });

    if (!connection) return;

    try {
      if (!platformRegistry.hasSocialProvider(post.platform)) return;

      const provider = platformRegistry.getSocialProvider(post.platform);
      const conn: PlatformConnection = {
        id: connection.id,
        companyId: connection.companyId,
        platform: connection.platform,
        status: connection.status,
        accessToken: connection.accessToken,
        platformAccountId: connection.platformUserId || connection.platformPageId || undefined,
        platformPageId: connection.platformPageId,
      };

      const engagement = await provider.getPostEngagement(conn, post.platformPostId);

      const totalEngagements = engagement.likes + engagement.comments + engagement.shares;
      const engagementRate =
        engagement.reach > 0 ? ((totalEngagements / engagement.reach) * 100).toFixed(2) : '0';

      await db.insert(postEngagements).values({
        postId: post.id,
        companyId: post.companyId,
        likes: engagement.likes,
        comments: engagement.comments,
        shares: engagement.shares,
        impressions: engagement.impressions,
        reach: engagement.reach,
        saves: engagement.saves,
        videoViews: engagement.videoViews,
        engagementRate,
        rawMetrics: engagement.raw || engagement,
      });

      console.log(`[Distribution] Fetched engagement for ${post.platform} post ${postId}: ${totalEngagements} engagements`);
    } catch (error) {
      console.error(`[Distribution] Failed to fetch engagement for post ${postId}:`, error);
    }
  }

  /**
   * Get engagement history for a post
   */
  async getEngagementHistory(postId: string) {
    return db.query.postEngagements.findMany({
      where: eq(postEngagements.postId, postId),
      orderBy: desc(postEngagements.fetchedAt),
    });
  }

  /**
   * Get company's scheduled posts
   */
  async getScheduledPosts(
    companyId: string,
    options?: {
      status?: 'draft' | 'scheduled' | 'published' | 'failed';
      platform?: string;
      limit?: number;
    }
  ): Promise<ScheduledPost[]> {
    const conditions = [eq(scheduledPosts.companyId, companyId)];

    if (options?.status) {
      conditions.push(eq(scheduledPosts.status, options.status));
    }
    if (options?.platform) {
      conditions.push(eq(scheduledPosts.platform, options.platform));
    }

    return db.query.scheduledPosts.findMany({
      where: and(...conditions),
      orderBy: desc(scheduledPosts.scheduledFor),
      limit: options?.limit || 50,
    });
  }

  /**
   * Cancel a scheduled post
   */
  async cancelPost(postId: string): Promise<boolean> {
    const post = await db.query.scheduledPosts.findFirst({
      where: eq(scheduledPosts.id, postId),
    });

    if (!post || post.status !== 'scheduled') {
      return false;
    }

    await db
      .update(scheduledPosts)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(scheduledPosts.id, postId));

    return true;
  }

  /**
   * Get distribution metrics summary
   */
  async getMetricsSummary(
    companyId: string,
    options?: { startDate?: Date; endDate?: Date }
  ): Promise<{
    totalPosts: number;
    publishedPosts: number;
    scheduledPosts: number;
    failedPosts: number;
    totalImpressions: number;
    totalEngagements: number;
    avgEngagementRate: number;
  }> {
    const posts = await db.query.scheduledPosts.findMany({
      where: eq(scheduledPosts.companyId, companyId),
    });

    const engagements = await db.query.postEngagements.findMany({
      where: eq(postEngagements.companyId, companyId),
    });

    // Latest engagement per post
    const latestEngagements = new Map<string, typeof engagements[0]>();
    for (const e of engagements) {
      const existing = latestEngagements.get(e.postId);
      if (!existing || e.fetchedAt > existing.fetchedAt) {
        latestEngagements.set(e.postId, e);
      }
    }

    let totalImpressions = 0;
    let totalEngagementsCount = 0;
    let totalEngagementRate = 0;

    for (const e of latestEngagements.values()) {
      totalImpressions += e.impressions || 0;
      totalEngagementsCount += (e.likes || 0) + (e.comments || 0) + (e.shares || 0);
      totalEngagementRate += parseFloat(e.engagementRate || '0');
    }

    return {
      totalPosts: posts.length,
      publishedPosts: posts.filter((p) => p.status === 'published').length,
      scheduledPosts: posts.filter((p) => p.status === 'scheduled').length,
      failedPosts: posts.filter((p) => p.status === 'failed').length,
      totalImpressions,
      totalEngagements: totalEngagementsCount,
      avgEngagementRate:
        latestEngagements.size > 0 ? totalEngagementRate / latestEngagements.size : 0,
    };
  }
}

// Export singleton
export const distributionEngine = new DistributionEngine();
