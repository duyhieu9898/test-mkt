/**
 * Distribution Scheduler
 *
 * Handles scheduled tasks for the Distribution Engine:
 * 1. Publishes due posts every minute
 * 2. Fetches engagement metrics every 15 minutes
 */

import { eq, and, lt, gte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  socialConnections,
  scheduledPosts,
  postEngagements,
  type SocialConnection,
  type ScheduledPost,
} from '@1person/core/db';

// Database connection
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client);

// Types for Facebook API responses
interface FacebookPostResponse {
  id: string;
  post_id?: string;
}

interface FacebookError {
  error?: {
    message?: string;
  };
}

interface FacebookEngagementResponse {
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
}

interface FacebookInsight {
  name: string;
  values?: Array<{ value?: number }>;
}

interface FacebookInsightsResponse {
  data?: FacebookInsight[];
}

/**
 * Facebook API client for direct posting
 */
class FacebookClient {
  constructor(private accessToken: string, private pageId: string) {}

  async postText(message: string): Promise<FacebookPostResponse> {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${this.pageId}/feed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          access_token: this.accessToken,
        }),
      }
    );

    if (!response.ok) {
      const error = (await response.json()) as FacebookError;
      throw new Error(error.error?.message || 'Facebook API error');
    }

    return response.json() as Promise<FacebookPostResponse>;
  }

  async postWithImage(message: string, imageUrl: string): Promise<FacebookPostResponse> {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${this.pageId}/photos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: imageUrl,
          caption: message,
          access_token: this.accessToken,
        }),
      }
    );

    if (!response.ok) {
      const error = (await response.json()) as FacebookError;
      throw new Error(error.error?.message || 'Facebook API error');
    }

    return response.json() as Promise<FacebookPostResponse>;
  }

  async getPostEngagement(postId: string): Promise<{
    likes: number;
    comments: number;
    shares: number;
    impressions: number;
    reach: number;
  }> {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${postId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${this.accessToken}`
    );

    if (!response.ok) {
      const error = (await response.json()) as FacebookError;
      throw new Error(error.error?.message || 'Facebook API error');
    }

    const data = (await response.json()) as FacebookEngagementResponse;

    // Get insights for impressions/reach
    let impressions = 0;
    let reach = 0;
    try {
      const insightsResponse = await fetch(
        `https://graph.facebook.com/v18.0/${postId}/insights?metric=post_impressions,post_impressions_unique&access_token=${this.accessToken}`
      );
      if (insightsResponse.ok) {
        const insights = (await insightsResponse.json()) as FacebookInsightsResponse;
        for (const insight of insights.data || []) {
          if (insight.name === 'post_impressions') {
            impressions = insight.values?.[0]?.value || 0;
          }
          if (insight.name === 'post_impressions_unique') {
            reach = insight.values?.[0]?.value || 0;
          }
        }
      }
    } catch {
      // Insights may not be available for all posts
    }

    return {
      likes: data.likes?.summary?.total_count || 0,
      comments: data.comments?.summary?.total_count || 0,
      shares: data.shares?.count || 0,
      impressions,
      reach,
    };
  }
}

/**
 * Process all due posts and publish them
 */
export async function processDuePosts(): Promise<{
  processed: number;
  published: number;
  failed: number;
  errors: string[];
}> {
  const result = {
    processed: 0,
    published: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    const now = new Date();

    // Get all scheduled posts that are due
    const duePosts = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.status, 'scheduled'),
          lt(scheduledPosts.scheduledFor, now)
        )
      );

    console.log(`[Distribution] Found ${duePosts.length} posts due for publishing`);

    for (const post of duePosts) {
      result.processed++;

      try {
        // Get the connection for this post
        const [connection] = await db
          .select()
          .from(socialConnections)
          .where(eq(socialConnections.id, post.connectionId))
          .limit(1);

        if (!connection || connection.status !== 'connected') {
          throw new Error('Connection not found or not active');
        }

        // Mark as publishing
        await db
          .update(scheduledPosts)
          .set({
            status: 'publishing',
            updatedAt: new Date(),
          })
          .where(eq(scheduledPosts.id, post.id));

        let platformPostId: string | undefined;
        let platformPostUrl: string | undefined;

        if (post.platform === 'facebook') {
          const client = new FacebookClient(
            connection.accessToken,
            connection.platformPageId || ''
          );

          const mediaUrls = post.mediaUrls as string[] | null;
          let fbResult: FacebookPostResponse;

          if (mediaUrls && mediaUrls.length > 0) {
            fbResult = await client.postWithImage(post.contentText, mediaUrls[0]);
          } else {
            fbResult = await client.postText(post.contentText);
          }

          platformPostId = fbResult.id || fbResult.post_id;
          platformPostUrl = `https://facebook.com/${platformPostId}`;
        } else {
          // Other platforms - simulate for now
          console.log(`[Distribution] Simulating post to ${post.platform}`);
          platformPostId = `sim_${Date.now()}`;
        }

        // Mark as published
        await db
          .update(scheduledPosts)
          .set({
            status: 'published',
            publishedAt: new Date(),
            platformPostId,
            platformPostUrl,
            updatedAt: new Date(),
          })
          .where(eq(scheduledPosts.id, post.id));

        // Update connection last used
        await db
          .update(socialConnections)
          .set({
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(socialConnections.id, connection.id));

        result.published++;
        console.log(`[Distribution] Published post ${post.id} to ${post.platform}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.failed++;
        result.errors.push(`Post ${post.id}: ${errorMessage}`);

        // Mark as failed
        await db
          .update(scheduledPosts)
          .set({
            status: 'failed',
            lastError: errorMessage,
            retryCount: (post.retryCount || 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(scheduledPosts.id, post.id));

        console.error(`[Distribution] Failed to publish post ${post.id}:`, errorMessage);
      }
    }
  } catch (error) {
    console.error('[Distribution] Error processing due posts:', error);
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return result;
}

/**
 * Fetch engagement metrics for recently published posts
 */
export async function fetchEngagementMetrics(): Promise<{
  fetched: number;
  failed: number;
}> {
  const result = { fetched: 0, failed: 0 };

  try {
    // Get posts published in the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const publishedPosts = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.status, 'published'),
          gte(scheduledPosts.publishedAt, sevenDaysAgo)
        )
      );

    console.log(`[Distribution] Fetching engagement for ${publishedPosts.length} posts`);

    for (const post of publishedPosts) {
      if (!post.platformPostId) continue;

      try {
        const [connection] = await db
          .select()
          .from(socialConnections)
          .where(eq(socialConnections.id, post.connectionId))
          .limit(1);

        if (!connection || connection.status !== 'connected') {
          continue;
        }

        let engagement: {
          likes: number;
          comments: number;
          shares: number;
          impressions: number;
          reach: number;
        } | null = null;

        if (post.platform === 'facebook') {
          const client = new FacebookClient(
            connection.accessToken,
            connection.platformPageId || ''
          );
          engagement = await client.getPostEngagement(post.platformPostId);
        }

        if (engagement) {
          // Calculate engagement rate
          const totalEngagements = engagement.likes + engagement.comments + engagement.shares;
          const engagementRate = engagement.reach > 0
            ? (totalEngagements / engagement.reach * 100).toFixed(2)
            : '0';

          // Insert engagement record
          await db.insert(postEngagements).values({
            postId: post.id,
            companyId: post.companyId,
            likes: engagement.likes,
            comments: engagement.comments,
            shares: engagement.shares,
            impressions: engagement.impressions,
            reach: engagement.reach,
            engagementRate,
            fetchedAt: new Date(),
          });

          result.fetched++;
        }
      } catch (error) {
        result.failed++;
        console.error(`[Distribution] Failed to fetch engagement for post ${post.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[Distribution] Error fetching engagement metrics:', error);
  }

  return result;
}

/**
 * Start the distribution scheduler
 */
export function startDistributionScheduler(): {
  stop: () => void;
} {
  console.log('[Distribution] Starting scheduler...');

  // Process due posts every minute
  const postInterval = setInterval(async () => {
    try {
      const result = await processDuePosts();
      if (result.processed > 0) {
        console.log(
          `[Distribution] Processed ${result.processed} posts: ${result.published} published, ${result.failed} failed`
        );
      }
    } catch (error) {
      console.error('[Distribution] Post processing error:', error);
    }
  }, 60 * 1000); // 1 minute

  // Fetch engagement every 15 minutes
  const engagementInterval = setInterval(async () => {
    try {
      const result = await fetchEngagementMetrics();
      if (result.fetched > 0 || result.failed > 0) {
        console.log(
          `[Distribution] Fetched engagement: ${result.fetched} success, ${result.failed} failed`
        );
      }
    } catch (error) {
      console.error('[Distribution] Engagement fetch error:', error);
    }
  }, 15 * 60 * 1000); // 15 minutes

  // Run initial check
  setTimeout(async () => {
    console.log('[Distribution] Running initial post check...');
    await processDuePosts();
  }, 5000);

  console.log('[Distribution] Scheduler started');
  console.log('   - Post publishing: every 1 minute');
  console.log('   - Engagement fetch: every 15 minutes');

  return {
    stop: () => {
      clearInterval(postInterval);
      clearInterval(engagementInterval);
      console.log('[Distribution] Scheduler stopped');
    },
  };
}
