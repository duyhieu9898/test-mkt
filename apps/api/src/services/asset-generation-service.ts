import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import { generatedAssets } from '@1person/core/db';
import type { AssetMetadata, BrandColors } from '@1person/core/db';
import { toolRegistry } from './tool-registry-service';
import { brandIdentityService } from './brand-identity-service';

// Asset generation request types
export interface ImageGenerationRequest {
  companyId: string;
  agentId?: string;
  agentType?: 'marketing' | 'content' | 'landing_page' | 'custom';
  prompt: string;
  width?: number;
  height?: number;
  style?: 'photorealistic' | 'illustration' | 'abstract' | 'logo' | 'banner';
  useBrandColors?: boolean;
  negativePrompt?: string;
  numImages?: number;
  taskId?: string;
}

export interface VideoGenerationRequest {
  companyId: string;
  agentId?: string;
  agentType?: 'marketing' | 'content' | 'custom';
  prompt: string;
  duration?: number; // seconds
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3';
  style?: 'realistic' | 'animated' | 'cinematic';
  useBrandColors?: boolean;
  taskId?: string;
}

export interface GeneratedAssetResult {
  id: string;
  url: string;
  publicUrl?: string;
  thumbnailUrl?: string;
  type: 'image' | 'video' | 'audio' | 'document';
  metadata: AssetMetadata;
  generationCost?: number;
}

// Tool executors
interface ToolExecutor {
  execute(config: Record<string, unknown>): Promise<GeneratedAssetResult[]>;
}

class ReplicateFluxExecutor implements ToolExecutor {
  constructor(
    private apiKey: string,
    private companyId: string
  ) {}

  async execute(config: Record<string, unknown>): Promise<GeneratedAssetResult[]> {
    const {
      prompt,
      width = 1024,
      height = 1024,
      num_outputs = 1,
    } = config as {
      prompt: string;
      width?: number;
      height?: number;
      num_outputs?: number;
    };

    console.log(`[AssetGen] Calling Replicate Flux with prompt: ${prompt.substring(0, 100)}...`);

    // In production, this would call the actual Replicate API
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'black-forest-labs/flux-schnell',
        input: {
          prompt,
          width,
          height,
          num_outputs,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Replicate API error: ${error}`);
    }

    const prediction = await response.json();

    // Poll for completion
    let result = prediction;
    const maxAttempts = 60;
    let attempts = 0;

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: {
          'Authorization': `Token ${this.apiKey}`,
        },
      });
      result = await pollResponse.json();
      attempts++;
    }

    if (result.status === 'failed') {
      throw new Error(`Image generation failed: ${result.error}`);
    }

    // Map outputs to assets
    const outputs = result.output || [];
    return outputs.map((url: string, index: number) => ({
      id: `${prediction.id}-${index}`,
      url,
      publicUrl: url,
      type: 'image' as const,
      metadata: {
        width: width as number,
        height: height as number,
        prompt: prompt as string,
        model: 'flux-schnell',
      },
      generationCost: 0.003,
    }));
  }
}

class OpenAIDalle3Executor implements ToolExecutor {
  constructor(
    private apiKey: string,
    private companyId: string
  ) {}

  async execute(config: Record<string, unknown>): Promise<GeneratedAssetResult[]> {
    const {
      prompt,
      size = '1024x1024',
      quality = 'standard',
      n = 1,
    } = config as {
      prompt: string;
      size?: '1024x1024' | '1792x1024' | '1024x1792';
      quality?: 'standard' | 'hd';
      n?: number;
    };

    console.log(`[AssetGen] Calling OpenAI DALL-E 3 with prompt: ${prompt.substring(0, 100)}...`);

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n,
        size,
        quality,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const result = await response.json();

    // Parse dimensions from size
    const [width, height] = size.split('x').map(Number);

    return result.data.map((item: { url: string; revised_prompt?: string }, index: number) => ({
      id: `dalle3-${Date.now()}-${index}`,
      url: item.url,
      publicUrl: item.url,
      type: 'image' as const,
      metadata: {
        width,
        height,
        prompt,
        model: 'dall-e-3',
      },
      generationCost: quality === 'hd' ? 0.08 : 0.04,
    }));
  }
}

class MockImageGenerator implements ToolExecutor {
  constructor(private companyId: string) {}

  async execute(config: Record<string, unknown>): Promise<GeneratedAssetResult[]> {
    const {
      prompt,
      width = 1024,
      height = 1024,
      num_outputs = 1,
    } = config as {
      prompt: string;
      width?: number;
      height?: number;
      num_outputs?: number;
    };

    console.log(`[AssetGen] Mock generating image: ${prompt.substring(0, 50)}...`);

    // Generate placeholder image URLs using picsum
    const assets: GeneratedAssetResult[] = [];
    for (let i = 0; i < num_outputs; i++) {
      const seed = Date.now() + i;
      assets.push({
        id: `mock-${seed}`,
        url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
        publicUrl: `https://picsum.photos/seed/${seed}/${width}/${height}`,
        type: 'image',
        metadata: {
          width,
          height,
          prompt,
          model: 'mock-generator',
        },
        generationCost: 0,
      });
    }

    // Simulate generation delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    return assets;
  }
}

class MockVideoGenerator implements ToolExecutor {
  constructor(private companyId: string) {}

  async execute(config: Record<string, unknown>): Promise<GeneratedAssetResult[]> {
    const {
      prompt,
      duration = 5,
    } = config as {
      prompt: string;
      duration?: number;
      aspect_ratio?: string;
    };

    console.log(`[AssetGen] Mock generating video: ${prompt.substring(0, 50)}...`);

    // Return a placeholder video
    const seed = Date.now();

    // Simulate generation delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return [{
      id: `mock-video-${seed}`,
      url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
      publicUrl: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
      thumbnailUrl: `https://picsum.photos/seed/${seed}/1280/720`,
      type: 'video',
      metadata: {
        duration,
        format: 'mp4',
        prompt,
        model: 'mock-video-generator',
      },
      generationCost: 0,
    }];
  }
}

export class AssetGenerationService {
  /**
   * Generate images
   */
  async generateImages(request: ImageGenerationRequest): Promise<GeneratedAssetResult[]> {
    console.log(`[AssetGen] Generating images for company: ${request.companyId}`);

    // Enhance prompt with brand colors if requested
    let enhancedPrompt = request.prompt;
    if (request.useBrandColors) {
      const brand = await brandIdentityService.getBrandIdentity(request.companyId);
      if (brand?.colors) {
        const colors = brand.colors as BrandColors;
        enhancedPrompt += ` Using brand colors: primary ${colors.primary}`;
        if (colors.secondary) enhancedPrompt += `, secondary ${colors.secondary}`;
        if (colors.accent) enhancedPrompt += `, accent ${colors.accent}`;
      }
    }

    // Add style-specific prompt enhancements
    if (request.style) {
      const styleEnhancements: Record<string, string> = {
        photorealistic: ', photorealistic, high quality, detailed, professional photography',
        illustration: ', digital illustration, clean lines, vibrant colors',
        abstract: ', abstract art, modern, geometric shapes',
        logo: ', logo design, minimal, vector style, clean',
        banner: ', web banner, marketing material, eye-catching',
      };
      enhancedPrompt += styleEnhancements[request.style] || '';
    }

    // Get the appropriate executor
    const executor = await this.getImageExecutor(request.companyId);

    // Execute generation
    const config = {
      prompt: enhancedPrompt,
      width: request.width || 1024,
      height: request.height || 1024,
      num_outputs: request.numImages || 1,
      negative_prompt: request.negativePrompt,
    };

    const results = await executor.execute(config);

    // Save to database
    const savedAssets: GeneratedAssetResult[] = [];
    for (const asset of results) {
      const [saved] = await db
        .insert(generatedAssets)
        .values({
          companyId: request.companyId,
          createdByAgentId: request.agentId,
          createdByAgentType: request.agentType,
          createdByTaskId: request.taskId,
          name: `Generated image: ${request.prompt.substring(0, 50)}`,
          assetType: 'image',
          storageUrl: asset.url,
          publicUrl: asset.publicUrl,
          thumbnailUrl: asset.thumbnailUrl,
          metadata: asset.metadata,
          generationCost: asset.generationCost?.toString(),
        })
        .returning();

      if (saved) {
        savedAssets.push({
          ...asset,
          id: saved.id,
        });
      }
    }

    return savedAssets;
  }

  /**
   * Generate video
   */
  async generateVideo(request: VideoGenerationRequest): Promise<GeneratedAssetResult[]> {
    console.log(`[AssetGen] Generating video for company: ${request.companyId}`);

    // Enhance prompt with brand colors if requested
    let enhancedPrompt = request.prompt;
    if (request.useBrandColors) {
      const brand = await brandIdentityService.getBrandIdentity(request.companyId);
      if (brand?.colors) {
        const colors = brand.colors as BrandColors;
        enhancedPrompt += ` Using brand colors: ${colors.primary}`;
      }
    }

    // Get the video executor
    const executor = await this.getVideoExecutor(request.companyId);

    // Execute generation
    const config = {
      prompt: enhancedPrompt,
      duration: request.duration || 5,
      aspect_ratio: request.aspectRatio || '16:9',
      style: request.style || 'realistic',
    };

    const results = await executor.execute(config);

    // Save to database
    const savedAssets: GeneratedAssetResult[] = [];
    for (const asset of results) {
      const [saved] = await db
        .insert(generatedAssets)
        .values({
          companyId: request.companyId,
          createdByAgentId: request.agentId,
          createdByAgentType: request.agentType,
          createdByTaskId: request.taskId,
          name: `Generated video: ${request.prompt.substring(0, 50)}`,
          assetType: 'video',
          storageUrl: asset.url,
          publicUrl: asset.publicUrl,
          thumbnailUrl: asset.thumbnailUrl,
          metadata: asset.metadata,
          generationCost: asset.generationCost?.toString(),
        })
        .returning();

      if (saved) {
        savedAssets.push({
          ...asset,
          id: saved.id,
        });
      }
    }

    return savedAssets;
  }

  /**
   * Get image executor based on company's configured tools
   */
  private async getImageExecutor(companyId: string): Promise<ToolExecutor> {
    // Try Replicate Flux first
    const replicateCreds = await toolRegistry.getToolCredentials(companyId, 'replicate-flux');
    if (replicateCreds?.isEnabled && replicateCreds.credentials) {
      const creds = replicateCreds.credentials as { apiKey?: string };
      if (creds.apiKey) {
        return new ReplicateFluxExecutor(creds.apiKey, companyId);
      }
    }

    // Try OpenAI DALL-E
    const openaiCreds = await toolRegistry.getToolCredentials(companyId, 'openai-dalle3');
    if (openaiCreds?.isEnabled && openaiCreds.credentials) {
      const creds = openaiCreds.credentials as { apiKey?: string };
      if (creds.apiKey) {
        return new OpenAIDalle3Executor(creds.apiKey, companyId);
      }
    }

    // Fallback to mock generator
    console.log(`[AssetGen] No image generation tool configured, using mock generator`);
    return new MockImageGenerator(companyId);
  }

  /**
   * Get video executor based on company's configured tools
   */
  private async getVideoExecutor(companyId: string): Promise<ToolExecutor> {
    // Try Replicate video
    const replicateCreds = await toolRegistry.getToolCredentials(companyId, 'replicate-video');
    if (replicateCreds?.isEnabled && replicateCreds.credentials) {
      const creds = replicateCreds.credentials as { apiKey?: string };
      if (creds.apiKey) {
        // For now, return mock - would implement actual Replicate video executor
        console.log(`[AssetGen] Replicate video configured but using mock for now`);
      }
    }

    // Fallback to mock
    console.log(`[AssetGen] Using mock video generator`);
    return new MockVideoGenerator(companyId);
  }

  /**
   * Get assets for a company
   */
  async getAssets(
    companyId: string,
    options?: {
      type?: 'image' | 'video' | 'audio' | 'document';
      agentId?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const conditions = [eq(generatedAssets.companyId, companyId)];

    if (options?.agentId) {
      conditions.push(eq(generatedAssets.createdByAgentId, options.agentId));
    }

    const assets = await db.query.generatedAssets.findMany({
      where: and(...conditions),
      orderBy: desc(generatedAssets.createdAt),
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    });

    // Filter by type in JS if needed (since asset type enum is different)
    if (options?.type) {
      return assets.filter((a) => a.assetType === options.type);
    }

    return assets;
  }

  /**
   * Get a specific asset
   */
  async getAsset(assetId: string) {
    return db.query.generatedAssets.findFirst({
      where: eq(generatedAssets.id, assetId),
    });
  }

  /**
   * Update asset metadata
   */
  async updateAsset(
    assetId: string,
    updates: {
      name?: string;
      tags?: string[];
      isPublic?: boolean;
      isArchived?: boolean;
    }
  ) {
    await db
      .update(generatedAssets)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(generatedAssets.id, assetId));
  }

  /**
   * Delete an asset
   */
  async deleteAsset(assetId: string) {
    await db.delete(generatedAssets).where(eq(generatedAssets.id, assetId));
  }

  /**
   * Generate banner image with brand-aware settings
   */
  async generateBanner(
    companyId: string,
    options: {
      headline: string;
      subheadline?: string;
      ctaText?: string;
      style?: 'modern' | 'minimal' | 'bold' | 'elegant';
      size?: 'facebook' | 'instagram' | 'twitter' | 'linkedin' | 'custom';
      customWidth?: number;
      customHeight?: number;
      agentId?: string;
      taskId?: string;
    }
  ): Promise<GeneratedAssetResult[]> {
    // Get dimensions based on size
    const dimensions: Record<string, { width: number; height: number }> = {
      facebook: { width: 1200, height: 630 },
      instagram: { width: 1080, height: 1080 },
      twitter: { width: 1600, height: 900 },
      linkedin: { width: 1200, height: 627 },
    };

    let sizeConfig: { width: number; height: number };
    if (options.size && options.size !== 'custom' && dimensions[options.size]) {
      sizeConfig = dimensions[options.size];
    } else {
      sizeConfig = { width: options.customWidth || 1200, height: options.customHeight || 630 };
    }

    // Build prompt for banner
    let prompt = `Professional marketing banner with headline "${options.headline}"`;
    if (options.subheadline) {
      prompt += ` and subheadline "${options.subheadline}"`;
    }
    if (options.ctaText) {
      prompt += ` with call-to-action button "${options.ctaText}"`;
    }
    prompt += `. Style: ${options.style || 'modern'}, clean, professional, high quality`;

    return this.generateImages({
      companyId,
      agentId: options.agentId,
      agentType: 'marketing',
      prompt,
      width: sizeConfig.width,
      height: sizeConfig.height,
      style: 'banner',
      useBrandColors: true,
      taskId: options.taskId,
    });
  }

  /**
   * Generate product images
   */
  async generateProductImages(
    companyId: string,
    options: {
      productName: string;
      productDescription: string;
      style?: 'studio' | 'lifestyle' | 'flat-lay' | 'close-up';
      background?: 'white' | 'gradient' | 'contextual';
      numImages?: number;
      agentId?: string;
      taskId?: string;
    }
  ): Promise<GeneratedAssetResult[]> {
    const stylePrompts: Record<string, string> = {
      studio: 'professional product photography, studio lighting, clean background',
      lifestyle: 'lifestyle product photography, natural setting, in-use context',
      'flat-lay': 'flat lay product photography, top-down view, arranged composition',
      'close-up': 'macro product photography, detail shot, high resolution',
    };

    const backgroundPrompts: Record<string, string> = {
      white: 'white background',
      gradient: 'smooth gradient background',
      contextual: 'contextual background matching product use',
    };

    const prompt = `${options.productName}, ${options.productDescription}. ${
      stylePrompts[options.style || 'studio']
    }, ${backgroundPrompts[options.background || 'white']}, professional commercial photography`;

    return this.generateImages({
      companyId,
      agentId: options.agentId,
      agentType: 'marketing',
      prompt,
      width: 1024,
      height: 1024,
      style: 'photorealistic',
      useBrandColors: false,
      numImages: options.numImages || 3,
      taskId: options.taskId,
    });
  }

  /**
   * Generate social media content
   */
  async generateSocialContent(
    companyId: string,
    options: {
      platform: 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'tiktok';
      contentType: 'post' | 'story' | 'reel';
      topic: string;
      style?: 'informative' | 'promotional' | 'engaging' | 'inspirational';
      agentId?: string;
      taskId?: string;
    }
  ): Promise<GeneratedAssetResult[]> {
    const platformDimensions: Record<string, { width: number; height: number }> = {
      instagram: options.contentType === 'story' ? { width: 1080, height: 1920 } : { width: 1080, height: 1080 },
      facebook: { width: 1200, height: 630 },
      twitter: { width: 1600, height: 900 },
      linkedin: { width: 1200, height: 627 },
      tiktok: { width: 1080, height: 1920 },
    };

    const dimensions = platformDimensions[options.platform] || { width: 1080, height: 1080 };

    const stylePrompts: Record<string, string> = {
      informative: 'clean design, easy to read text, professional',
      promotional: 'eye-catching, vibrant, promotional graphics',
      engaging: 'modern design, interactive feel, bold colors',
      inspirational: 'motivational, uplifting imagery, warm tones',
    };

    const prompt = `Social media ${options.contentType} for ${options.platform} about "${options.topic}". ${
      stylePrompts[options.style || 'engaging']
    }, high quality, professional`;

    return this.generateImages({
      companyId,
      agentId: options.agentId,
      agentType: 'marketing',
      prompt,
      width: dimensions.width,
      height: dimensions.height,
      style: 'illustration',
      useBrandColors: true,
      taskId: options.taskId,
    });
  }
}

// Export singleton
export const assetGenerationService = new AssetGenerationService();
