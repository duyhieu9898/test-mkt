/**
 * Platform Registry — Zero-hardcode provider dispatch
 *
 * All platform-specific logic is accessed through this registry.
 * No if/else chains, no switch statements on platform names.
 * Providers self-register at startup. Code calls registry.get*(platformId).
 *
 * Usage:
 *   const provider = platformRegistry.getSocialProvider('facebook');
 *   await provider.publishPost(connection, content);
 */

import type {
  PlatformConfig,
  ISocialPlatformProvider,
  IAdPlatformProvider,
  IOAuthProvider,
} from './types';

class PlatformRegistry {
  private socialProviders = new Map<string, ISocialPlatformProvider>();
  private adProviders = new Map<string, IAdPlatformProvider>();
  private oauthProviders = new Map<string, IOAuthProvider>();
  private configs = new Map<string, PlatformConfig>();

  // ===================== REGISTER =====================

  registerSocialProvider(provider: ISocialPlatformProvider): void {
    this.socialProviders.set(provider.platformId, provider);
    console.log(`[PlatformRegistry] Social provider registered: ${provider.platformId}`);
  }

  registerAdProvider(provider: IAdPlatformProvider): void {
    this.adProviders.set(provider.platformId, provider);
    console.log(`[PlatformRegistry] Ad provider registered: ${provider.platformId}`);
  }

  registerOAuthProvider(provider: IOAuthProvider): void {
    this.oauthProviders.set(provider.platformId, provider);
    console.log(`[PlatformRegistry] OAuth provider registered: ${provider.platformId}`);
  }

  registerConfig(config: PlatformConfig): void {
    this.configs.set(config.platformId, config);
  }

  // ===================== GET PROVIDERS =====================

  getSocialProvider(platformId: string): ISocialPlatformProvider {
    const provider = this.socialProviders.get(platformId);
    if (!provider) {
      throw new Error(`No social provider registered for platform: ${platformId}. Available: ${this.getSupportedSocialPlatforms().join(', ')}`);
    }
    return provider;
  }

  getAdProvider(platformId: string): IAdPlatformProvider {
    const provider = this.adProviders.get(platformId);
    if (!provider) {
      throw new Error(`No ad provider registered for platform: ${platformId}. Available: ${this.getSupportedAdPlatforms().join(', ')}`);
    }
    return provider;
  }

  getOAuthProvider(platformId: string): IOAuthProvider {
    const provider = this.oauthProviders.get(platformId);
    if (!provider) {
      throw new Error(`No OAuth provider registered for platform: ${platformId}. Available: ${this.getOAuthPlatforms().join(', ')}`);
    }
    return provider;
  }

  getConfig(platformId: string): PlatformConfig | undefined {
    return this.configs.get(platformId);
  }

  // ===================== QUERY =====================

  hasSocialProvider(platformId: string): boolean {
    return this.socialProviders.has(platformId);
  }

  hasAdProvider(platformId: string): boolean {
    return this.adProviders.has(platformId);
  }

  hasOAuthProvider(platformId: string): boolean {
    return this.oauthProviders.has(platformId);
  }

  getSupportedSocialPlatforms(): string[] {
    return Array.from(this.socialProviders.keys());
  }

  getSupportedAdPlatforms(): string[] {
    return Array.from(this.adProviders.keys());
  }

  getOAuthPlatforms(): string[] {
    return Array.from(this.oauthProviders.keys());
  }

  /** Get all platform configs (for settings UI) */
  getAllConfigs(): PlatformConfig[] {
    return Array.from(this.configs.values());
  }

  /** Get only platforms that are configured (env vars present) */
  getConfiguredPlatforms(): PlatformConfig[] {
    return this.getAllConfigs().filter((config) => {
      const provider = this.oauthProviders.get(config.platformId);
      return provider ? provider.isConfigured() : false;
    });
  }

  /** Get all platforms with their availability status (for settings UI) */
  getPlatformStatus(): Array<PlatformConfig & { configured: boolean; hasSocial: boolean; hasAds: boolean }> {
    return this.getAllConfigs().map((config) => ({
      ...config,
      configured: this.oauthProviders.get(config.platformId)?.isConfigured() ?? false,
      hasSocial: this.socialProviders.has(config.platformId),
      hasAds: this.adProviders.has(config.platformId),
    }));
  }
}

export const platformRegistry = new PlatformRegistry();
