/**
 * Landing Page Generator Plugin
 *
 * Generates complete landing pages from business descriptions.
 * Can operate standalone (using AI) or with an external service adapter.
 *
 * Integration with API:
 * - The API's LandingPageService can be passed as a serviceAdapter
 * - This allows the plugin to use database storage and full features
 */

import { BasePlugin } from './base-plugin';
import type { PluginManifest, PluginExecutionResult, PluginExecutionContext } from '../types';

// =============================================================================
// TYPES
// =============================================================================

export interface LandingPageInput {
  businessName: string;
  businessDescription: string;
  targetAudience: string;
  valueProposition: string;
  style?: 'minimal' | 'modern' | 'bold' | 'professional';
  primaryColor?: string;
  includeFeatures?: boolean;
  includeTestimonials?: boolean;
  includePricing?: boolean;
  includeContactForm?: boolean;
  customSections?: Array<{
    type: string;
    content: string;
  }>;
}

export interface LandingPageOutput {
  pageId: string;
  url: string;
  previewUrl: string;
  structure: PageStructure;
  content: PageContent;
  assets: PageAsset[];
  seo: SEOData;
}

export interface PageStructure {
  sections: PageSection[];
  layout: 'single-column' | 'two-column' | 'hero-centered';
  navigation: boolean;
  footer: boolean;
}

export interface PageSection {
  id: string;
  type: 'hero' | 'features' | 'testimonials' | 'pricing' | 'cta' | 'contact' | 'custom';
  order: number;
  config: Record<string, unknown>;
}

export interface PageContent {
  headline: string;
  subheadline: string;
  ctaText: string;
  features?: Array<{ title: string; description: string; icon?: string }>;
  testimonials?: Array<{ name: string; role: string; quote: string; avatar?: string }>;
  pricing?: Array<{
    name: string;
    price: number;
    period: string;
    features: string[];
    highlighted?: boolean;
  }>;
}

export interface PageAsset {
  id: string;
  type: 'image' | 'icon' | 'video';
  url: string;
  alt?: string;
}

export interface SEOData {
  title: string;
  description: string;
  keywords: string[];
  ogImage?: string;
}

/**
 * Service adapter interface for external service integration.
 * Implement this interface to connect the plugin to a real landing page service.
 */
export interface ILandingPageServiceAdapter {
  generateFromPrompt(input: {
    companyId: string;
    prompt: string;
    style?: string;
    primaryColor?: string;
    includeFeatures?: boolean;
    includePricing?: boolean;
    includeTestimonials?: boolean;
    includeFAQ?: boolean;
  }): Promise<{
    id: string;
    name: string;
    slug: string;
    businessContext: {
      businessName: string;
      industry: string;
      targetAudience: string;
      valueProposition: string;
    };
    sections: Array<{ type: string; order: number; content: unknown }>;
    seo: SEOData;
    status: string;
  }>;
}

// =============================================================================
// PLUGIN IMPLEMENTATION
// =============================================================================

export class LandingPageGeneratorPlugin extends BasePlugin {
  private serviceAdapter?: ILandingPageServiceAdapter;
  private companyId?: string;

  readonly manifest: PluginManifest = {
    id: 'landing-page-generator',
    name: 'Landing Page Generator',
    version: '1.0.0',
    category: 'content',
    description: 'Generates complete landing pages from business descriptions',
    author: '1Person',

    inputs: [
      {
        name: 'businessName',
        type: 'string',
        required: true,
        description: 'Name of the business',
      },
      {
        name: 'businessDescription',
        type: 'string',
        required: true,
        description: 'Description of what the business does',
      },
      {
        name: 'targetAudience',
        type: 'string',
        required: true,
        description: 'Who is the target customer',
      },
      {
        name: 'valueProposition',
        type: 'string',
        required: true,
        description: 'Main value proposition',
      },
      {
        name: 'style',
        type: 'string',
        required: false,
        description: 'Design style: minimal, modern, bold, professional',
      },
      {
        name: 'primaryColor',
        type: 'string',
        required: false,
        description: 'Primary brand color (hex)',
      },
    ],

    outputs: [
      {
        name: 'pageId',
        type: 'string',
        required: true,
        description: 'Generated page ID',
      },
      {
        name: 'url',
        type: 'string',
        required: true,
        description: 'Public URL of the landing page',
      },
      {
        name: 'previewUrl',
        type: 'string',
        required: true,
        description: 'Preview URL',
      },
    ],

    requiredCredentials: [],
    requiredPermissions: ['pages:write', 'assets:write'],

    timeout: 60000,
    retryPolicy: {
      maxRetries: 2,
      backoffMs: 5000,
    },

    costPerExecution: 0.1, // $0.10 per page
  };

  /**
   * Set a service adapter for database integration.
   * If set, the plugin will use the adapter instead of standalone generation.
   */
  setServiceAdapter(adapter: ILandingPageServiceAdapter): void {
    this.serviceAdapter = adapter;
  }

  protected async onInitialize(context: PluginExecutionContext): Promise<void> {
    this.companyId = context.companyId;
    this.log('info', `Initialized for company: ${this.companyId}`);
  }

  protected async onExecute(
    params: Record<string, unknown>
  ): Promise<Omit<PluginExecutionResult, 'metrics' | 'logs'>> {
    const input = params as unknown as LandingPageInput;

    this.log('info', `Generating landing page for: ${input.businessName}`);

    try {
      // If we have a service adapter, use it for full database integration
      if (this.serviceAdapter && this.companyId) {
        this.log('info', 'Using service adapter for generation...');
        return await this.executeWithAdapter(input);
      }

      // Otherwise, use standalone generation
      return await this.executeStandalone(input);
    } catch (error) {
      this.log('error', `Failed to generate landing page: ${error}`);

      return {
        success: false,
        data: null,
        error: {
          code: 'GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        },
      };
    }
  }

  /**
   * Execute using the external service adapter (full database integration)
   */
  private async executeWithAdapter(
    input: LandingPageInput
  ): Promise<Omit<PluginExecutionResult, 'metrics' | 'logs'>> {
    if (!this.serviceAdapter || !this.companyId) {
      throw new Error('Service adapter or companyId not configured');
    }

    // Build prompt from input
    const prompt = `${input.businessName}: ${input.businessDescription}.
Target audience: ${input.targetAudience}.
Value proposition: ${input.valueProposition}.`;

    const result = await this.serviceAdapter.generateFromPrompt({
      companyId: this.companyId,
      prompt,
      style: input.style,
      primaryColor: input.primaryColor,
      includeFeatures: input.includeFeatures,
      includePricing: input.includePricing,
      includeTestimonials: input.includeTestimonials,
      includeFAQ: false,
    });

    this.trackApiCall(0.08); // AI content generation cost

    const output: LandingPageOutput = {
      pageId: result.id,
      url: `https://pages.1person.ai/${result.slug}`,
      previewUrl: `https://pages.1person.ai/${result.slug}/preview`,
      structure: {
        sections: result.sections.map((s) => ({
          id: s.type,
          type: s.type as 'hero' | 'features' | 'testimonials' | 'pricing' | 'cta' | 'contact' | 'custom',
          order: s.order,
          config: s.content as Record<string, unknown>,
        })),
        layout: 'single-column',
        navigation: true,
        footer: true,
      },
      content: {
        headline: result.businessContext.businessName,
        subheadline: result.businessContext.valueProposition,
        ctaText: 'Get Started',
      },
      assets: [],
      seo: result.seo,
    };

    this.log('info', `Landing page created via adapter: ${output.pageId}`);

    return {
      success: true,
      data: output,
    };
  }

  /**
   * Execute standalone generation (without database)
   */
  private async executeStandalone(
    input: LandingPageInput
  ): Promise<Omit<PluginExecutionResult, 'metrics' | 'logs'>> {
    // Step 1: Generate page structure
    this.log('info', 'Generating page structure...');
    const structure = await this.generateStructure(input);

    // Step 2: Generate content
    this.log('info', 'Generating content...');
    const content = await this.generateContent(input, structure);

    // Step 3: Generate assets
    this.log('info', 'Generating assets...');
    const assets = await this.generateAssets(input, content);

    // Step 4: Generate SEO data
    this.log('info', 'Generating SEO data...');
    const seo = await this.generateSEO(input, content);

    // Step 5: Build and deploy page
    this.log('info', 'Building and deploying page...');
    const deployment = await this.deployPage(structure, content, assets, seo);

    const output: LandingPageOutput = {
      pageId: deployment.pageId,
      url: deployment.url,
      previewUrl: deployment.previewUrl,
      structure,
      content,
      assets,
      seo,
    };

    this.log('info', `Landing page created: ${output.url}`);

    return {
      success: true,
      data: output,
    };
  }

  protected onValidate(
    params: Record<string, unknown>
  ): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const input = params as unknown as Partial<LandingPageInput>;

    if (input.businessDescription && input.businessDescription.length < 20) {
      errors.push('businessDescription must be at least 20 characters');
    }

    if (input.primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(input.primaryColor)) {
      errors.push('primaryColor must be a valid hex color (e.g., #FF5733)');
    }

    if (input.style && !['minimal', 'modern', 'bold', 'professional'].includes(input.style)) {
      errors.push('style must be one of: minimal, modern, bold, professional');
    }

    return { valid: errors.length === 0, errors };
  }

  // =============================================================================
  // PRIVATE METHODS (TO BE IMPLEMENTED)
  // =============================================================================

  private async generateStructure(input: LandingPageInput): Promise<PageStructure> {
    // TODO: Use AI to determine optimal page structure based on input
    const sections: PageSection[] = [
      { id: 'hero', type: 'hero', order: 1, config: {} },
    ];

    if (input.includeFeatures !== false) {
      sections.push({ id: 'features', type: 'features', order: 2, config: {} });
    }

    if (input.includeTestimonials) {
      sections.push({ id: 'testimonials', type: 'testimonials', order: 3, config: {} });
    }

    if (input.includePricing) {
      sections.push({ id: 'pricing', type: 'pricing', order: 4, config: {} });
    }

    sections.push({ id: 'cta', type: 'cta', order: 5, config: {} });

    if (input.includeContactForm) {
      sections.push({ id: 'contact', type: 'contact', order: 6, config: {} });
    }

    this.trackApiCall(0.01);

    return {
      sections,
      layout: 'single-column',
      navigation: true,
      footer: true,
    };
  }

  private async generateContent(
    input: LandingPageInput,
    structure: PageStructure
  ): Promise<PageContent> {
    // TODO: Use AI to generate compelling copy

    this.trackApiCall(0.02);

    return {
      headline: `${input.businessName} - ${input.valueProposition}`,
      subheadline: input.businessDescription,
      ctaText: 'Get Started Now',
      features: [
        { title: 'Feature 1', description: 'Description of feature 1' },
        { title: 'Feature 2', description: 'Description of feature 2' },
        { title: 'Feature 3', description: 'Description of feature 3' },
      ],
    };
  }

  private async generateAssets(
    input: LandingPageInput,
    content: PageContent
  ): Promise<PageAsset[]> {
    // TODO: Generate images using AI

    this.trackApiCall(0.03);

    return [
      {
        id: 'hero-image',
        type: 'image',
        url: 'https://placeholder.com/hero.png',
        alt: `${input.businessName} hero image`,
      },
    ];
  }

  private async generateSEO(
    input: LandingPageInput,
    content: PageContent
  ): Promise<SEOData> {
    // TODO: Generate SEO-optimized metadata

    this.trackApiCall(0.01);

    return {
      title: `${input.businessName} | ${input.valueProposition}`,
      description: input.businessDescription.substring(0, 160),
      keywords: [
        input.businessName.toLowerCase(),
        ...input.targetAudience.toLowerCase().split(' '),
      ],
    };
  }

  private async deployPage(
    structure: PageStructure,
    content: PageContent,
    assets: PageAsset[],
    seo: SEOData
  ): Promise<{ pageId: string; url: string; previewUrl: string }> {
    // TODO: Actually build and deploy the page

    const pageId = `page-${Date.now()}`;

    this.trackApiCall(0.01);

    return {
      pageId,
      url: `https://pages.1person.ai/${pageId}`,
      previewUrl: `https://pages.1person.ai/${pageId}/preview`,
    };
  }
}

// Factory function
export const createLandingPageGeneratorPlugin = () => new LandingPageGeneratorPlugin();
