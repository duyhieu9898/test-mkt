/**
 * Platform Registry — Auto-registration of all providers
 *
 * Import this file at API startup to register all platform providers.
 * Providers are only registered if their required env vars are configured.
 * Adding a new platform = create provider file + add import here.
 *
 * Usage in other files:
 *   import { platformRegistry } from '../services/platforms';
 *   const provider = platformRegistry.getSocialProvider('facebook');
 */

import { platformRegistry } from './registry';

// Import all providers
import { FacebookSocialProvider, FacebookAdProvider, FacebookOAuthProvider, facebookConfig } from './providers/facebook';
import { InstagramSocialProvider, InstagramOAuthProvider, instagramConfig } from './providers/instagram';
import { LinkedInSocialProvider, LinkedInAdProvider, LinkedInOAuthProvider, linkedinConfig } from './providers/linkedin';
import { TikTokSocialProvider, TikTokAdProvider, TikTokOAuthProvider, tiktokConfig } from './providers/tiktok';
import { YouTubeSocialProvider, YouTubeOAuthProvider, youtubeConfig } from './providers/youtube';
import { TwitterSocialProvider, TwitterOAuthProvider, twitterConfig } from './providers/twitter';
import { GoogleAdProvider, GoogleAdsOAuthProvider, googleAdsConfig } from './providers/google-ads';

// ============================================================================
// REGISTER ALL PLATFORMS
// ============================================================================

// Each platform registers: config + oauth + social (if supported) + ads (if supported)
// The registry is a Map — no if/else chains, no hardcoded platform lists.

// Facebook — social + ads
platformRegistry.registerConfig(facebookConfig);
platformRegistry.registerOAuthProvider(new FacebookOAuthProvider());
platformRegistry.registerSocialProvider(new FacebookSocialProvider());
platformRegistry.registerAdProvider(new FacebookAdProvider());

// Instagram — social (ads via Meta/Facebook)
platformRegistry.registerConfig(instagramConfig);
platformRegistry.registerOAuthProvider(new InstagramOAuthProvider());
platformRegistry.registerSocialProvider(new InstagramSocialProvider());
// Instagram ads use Facebook Ad Provider (Meta Ads Manager covers both)

// LinkedIn — social + ads
platformRegistry.registerConfig(linkedinConfig);
platformRegistry.registerOAuthProvider(new LinkedInOAuthProvider());
platformRegistry.registerSocialProvider(new LinkedInSocialProvider());
platformRegistry.registerAdProvider(new LinkedInAdProvider());

// TikTok — social + ads
platformRegistry.registerConfig(tiktokConfig);
platformRegistry.registerOAuthProvider(new TikTokOAuthProvider());
platformRegistry.registerSocialProvider(new TikTokSocialProvider());
platformRegistry.registerAdProvider(new TikTokAdProvider());

// YouTube — social only (ads via Google Ads)
platformRegistry.registerConfig(youtubeConfig);
platformRegistry.registerOAuthProvider(new YouTubeOAuthProvider());
platformRegistry.registerSocialProvider(new YouTubeSocialProvider());

// Twitter/X — social only
platformRegistry.registerConfig(twitterConfig);
platformRegistry.registerOAuthProvider(new TwitterOAuthProvider());
platformRegistry.registerSocialProvider(new TwitterSocialProvider());

// Google Ads — ads only
platformRegistry.registerConfig(googleAdsConfig);
platformRegistry.registerOAuthProvider(new GoogleAdsOAuthProvider());
platformRegistry.registerAdProvider(new GoogleAdProvider());

// ============================================================================
// EXPORT
// ============================================================================

export { platformRegistry } from './registry';
export type {
  PlatformConfig,
  PlatformConnection,
  ISocialPlatformProvider,
  IAdPlatformProvider,
  IOAuthProvider,
  PostContent,
  PostResult,
  EngagementResult,
  CreateCampaignInput,
  PlatformCampaignResult,
  CampaignInsights,
  OAuthTokens,
  PlatformFeature,
} from './types';
