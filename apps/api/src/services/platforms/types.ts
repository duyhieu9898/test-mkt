/**
 * Platform Provider Interfaces — The foundation of multi-platform integration
 *
 * Every platform (Facebook, TikTok, YouTube, LinkedIn, etc.) implements these
 * interfaces. No if/else chains, no hardcoded platform names. The registry
 * dispatches to the correct provider at runtime.
 *
 * Three provider types:
 * - ISocialPlatformProvider: Organic posting (text, image, video, schedule)
 * - IAdPlatformProvider: Paid campaigns (create, launch, pause, metrics)
 * - IOAuthProvider: Authorization (auth URL, code exchange, token refresh)
 */

// ============================================================================
// PLATFORM CONFIGURATION
// ============================================================================

export type PlatformFeature =
  | 'organic_post'
  | 'paid_ads'
  | 'stories'
  | 'reels'
  | 'video_upload'
  | 'carousel'
  | 'scheduling'
  | 'engagement_tracking'
  | 'analytics';

export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Environment variable name for client ID (e.g., 'FACEBOOK_CLIENT_ID') */
  clientIdEnvVar: string;
  /** Environment variable name for client secret */
  clientSecretEnvVar: string;
  supportsRefresh: boolean;
  /** Default token lifetime in seconds (e.g., Facebook = 5184000 for 60 days) */
  defaultExpiresInSeconds?: number;
  /** Additional params to include in auth URL */
  additionalAuthParams?: Record<string, string>;
  /** Whether this platform uses PKCE (e.g., Twitter) */
  usesPKCE?: boolean;
}

export interface PlatformConfig {
  platformId: string;
  displayName: string;
  description: string;
  iconUrl?: string;
  category: 'social' | 'ads' | 'both';
  oauthConfig: OAuthConfig;
  supportedFeatures: PlatformFeature[];
  /** Character limits per content type */
  limits?: {
    postTextMax?: number;
    headlineMax?: number;
    hashtagMax?: number;
    mediaMax?: number;
  };
  /** API base URL for this platform */
  apiBaseUrl: string;
  /** API version string */
  apiVersion?: string;
}

// ============================================================================
// CONNECTION TYPES (from DB)
// ============================================================================

export interface PlatformConnection {
  id: string;
  companyId: string;
  platform: string;
  status: string;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  platformAccountId?: string | null;
  platformPageId?: string | null;
  platformAccountName?: string | null;
  platformBusinessId?: string | null;
  permissions?: string[] | null;
}

// ============================================================================
// SOCIAL PLATFORM PROVIDER
// ============================================================================

export interface PostContent {
  text: string;
  hashtags?: string[];
  mediaUrls?: string[];
  mediaType?: 'image' | 'video' | 'carousel';
  linkUrl?: string;
  /** Platform-specific metadata */
  extra?: Record<string, unknown>;
}

export interface PostResult {
  success: boolean;
  platformPostId?: string;
  platformPostUrl?: string;
  error?: string;
}

export interface EngagementResult {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  impressions: number;
  reach: number;
  videoViews?: number;
  engagementRate?: number;
  raw?: Record<string, unknown>;
}

export interface ISocialPlatformProvider {
  readonly platformId: string;

  /** Publish a post immediately */
  publishPost(connection: PlatformConnection, content: PostContent): Promise<PostResult>;

  /** Schedule a post for later */
  schedulePost(connection: PlatformConnection, content: PostContent, scheduledTime: Date): Promise<PostResult>;

  /** Get engagement metrics for a published post */
  getPostEngagement(connection: PlatformConnection, platformPostId: string): Promise<EngagementResult>;

  /** Delete a published post */
  deletePost(connection: PlatformConnection, platformPostId: string): Promise<{ success: boolean; error?: string }>;

  /** Validate that a connection is still active (test API call) */
  validateConnection(connection: PlatformConnection): Promise<{ valid: boolean; error?: string }>;
}

// ============================================================================
// AD PLATFORM PROVIDER
// ============================================================================

export interface CreateCampaignInput {
  name: string;
  objective: string; // platform-agnostic: 'awareness' | 'traffic' | 'engagement' | 'leads' | 'sales'
  dailyBudget: number;
  currency?: string;
  startDate?: Date;
  endDate?: Date;
  targetAudience?: TargetAudience;
}

export interface TargetAudience {
  locations?: string[];
  ageMin?: number;
  ageMax?: number;
  genders?: string[];
  interests?: string[];
  behaviors?: string[];
  languages?: string[];
  /** Platform-specific targeting */
  extra?: Record<string, unknown>;
}

export interface CreateAdSetInput {
  campaignId: string;
  platformCampaignId: string;
  name: string;
  dailyBudget?: number;
  bidStrategy?: string;
  bidAmount?: number;
  targetAudience?: TargetAudience;
  placements?: string[];
  startDate?: Date;
  endDate?: Date;
}

export interface CreateAdInput {
  adSetId: string;
  platformAdSetId: string;
  name: string;
  type: 'image' | 'video' | 'carousel' | 'text';
  headline: string;
  primaryText: string;
  description?: string;
  callToAction: string;
  destinationUrl: string;
  imageUrl?: string;
  videoUrl?: string;
}

export interface PlatformCampaignResult {
  id: string;
  platformCampaignId: string;
  status: string;
}

export interface PlatformAdSetResult {
  id: string;
  platformAdSetId: string;
}

export interface PlatformAdResult {
  id: string;
  platformAdId: string;
  platformCreativeId?: string;
  reviewStatus?: string;
}

export interface CampaignInsights {
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas?: number;
  raw?: Record<string, unknown>;
}

export interface IAdPlatformProvider {
  readonly platformId: string;

  /** Create a campaign on the ad platform */
  createCampaign(connection: PlatformConnection, data: CreateCampaignInput): Promise<PlatformCampaignResult>;

  /** Activate or pause a campaign */
  updateCampaignStatus(connection: PlatformConnection, platformCampaignId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void>;

  /** Create an ad set within a campaign */
  createAdSet(connection: PlatformConnection, data: CreateAdSetInput): Promise<PlatformAdSetResult>;

  /** Create an individual ad */
  createAd(connection: PlatformConnection, data: CreateAdInput): Promise<PlatformAdResult>;

  /** Fetch performance insights for a campaign */
  getCampaignInsights(connection: PlatformConnection, platformCampaignId: string): Promise<CampaignInsights>;

  /** Map a generic objective to platform-specific objective string */
  mapObjective(objective: string): string;

  /** Build platform-specific targeting from generic audience */
  buildTargeting(audience: TargetAudience): Record<string, unknown>;
}

// ============================================================================
// OAUTH PROVIDER
// ============================================================================

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
  /** Platform-specific extras (e.g., page tokens, user IDs) */
  extra?: Record<string, unknown>;
}

export interface IOAuthProvider {
  readonly platformId: string;

  /** Generate the OAuth authorization URL */
  getAuthorizationUrl(state: string, redirectUri: string): string;

  /** Exchange authorization code for tokens */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;

  /** Refresh an expired access token */
  refreshToken(refreshToken: string): Promise<OAuthTokens>;

  /** Check if this provider is configured (env vars present) */
  isConfigured(): boolean;
}
