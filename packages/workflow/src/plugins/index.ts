/**
 * Plugin Exports
 */

export * from './base-plugin';
export * from './landing-page-generator';

// Re-export plugin factories
import { createLandingPageGeneratorPlugin } from './landing-page-generator';

/**
 * Register all built-in plugins
 */
import { getPluginRegistry } from './base-plugin';

export function registerBuiltInPlugins(): void {
  const registry = getPluginRegistry();

  // Content plugins
  registry.register(createLandingPageGeneratorPlugin());

  // TODO: Add more plugins as they are implemented
  // registry.register(createBannerGeneratorPlugin());
  // registry.register(createContentGeneratorPlugin());

  // Ads plugins
  // registry.register(createMetaAdsPlugin());
  // registry.register(createGoogleAdsPlugin());

  // Outreach plugins
  // registry.register(createEmailOutreachPlugin());
  // registry.register(createLinkedInOutreachPlugin());

  // Scraping plugins
  // registry.register(createLeadScraperPlugin());
  // registry.register(createCompetitorMonitorPlugin());

  console.log(`Registered ${registry.list().length} built-in plugins`);
}
