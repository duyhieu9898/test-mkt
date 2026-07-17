import { eq, and } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  executionTools,
  companyToolCredentials,
} from '@1person/core/db';
import type { ToolConfig, ToolCredentials } from '@1person/core/db';

// Built-in tool definitions
const BUILT_IN_TOOLS = [
  // Image Generation
  {
    name: 'Replicate Flux',
    slug: 'replicate-flux',
    description: 'Generate images using Flux model on Replicate',
    type: 'image_generation' as const,
    provider: 'replicate',
    apiEndpoint: 'https://api.replicate.com/v1/predictions',
    authMethod: 'bearer_token' as const,
    config: {
      timeout: 120000,
      retries: 2,
    },
    inputSchema: {
      prompt: { type: 'string', required: true },
      width: { type: 'number', default: 1024 },
      height: { type: 'number', default: 1024 },
      num_outputs: { type: 'number', default: 1 },
    },
    outputSchema: {
      images: { type: 'array' },
    },
    costPerCall: '0.003',
    costUnit: 'image',
    isBuiltIn: true,
  },
  {
    name: 'OpenAI DALL-E 3',
    slug: 'openai-dalle3',
    description: 'Generate images using DALL-E 3',
    type: 'image_generation' as const,
    provider: 'openai',
    apiEndpoint: 'https://api.openai.com/v1/images/generations',
    authMethod: 'bearer_token' as const,
    config: {
      timeout: 60000,
      retries: 2,
    },
    inputSchema: {
      prompt: { type: 'string', required: true },
      size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'] },
      quality: { type: 'string', enum: ['standard', 'hd'] },
    },
    outputSchema: {
      url: { type: 'string' },
    },
    costPerCall: '0.04',
    costUnit: 'image',
    isBuiltIn: true,
  },
  // Video Generation
  {
    name: 'Replicate Video',
    slug: 'replicate-video',
    description: 'Generate short videos using Replicate models',
    type: 'video_generation' as const,
    provider: 'replicate',
    apiEndpoint: 'https://api.replicate.com/v1/predictions',
    authMethod: 'bearer_token' as const,
    config: {
      timeout: 300000,
      retries: 1,
    },
    inputSchema: {
      prompt: { type: 'string', required: true },
      duration: { type: 'number', default: 5 },
    },
    outputSchema: {
      video_url: { type: 'string' },
    },
    costPerCall: '0.05',
    costUnit: 'video',
    isBuiltIn: true,
  },
  // Social Media
  {
    name: 'Facebook Graph API',
    slug: 'facebook-graph',
    description: 'Post content and manage pages on Facebook',
    type: 'social_post' as const,
    provider: 'meta',
    apiEndpoint: 'https://graph.facebook.com/v18.0',
    authMethod: 'oauth2' as const,
    config: {
      timeout: 30000,
      retries: 2,
    },
    inputSchema: {
      page_id: { type: 'string', required: true },
      message: { type: 'string' },
      media_url: { type: 'string' },
      scheduled_publish_time: { type: 'number' },
    },
    outputSchema: {
      post_id: { type: 'string' },
    },
    costPerCall: '0',
    costUnit: 'call',
    isBuiltIn: true,
  },
  {
    name: 'Instagram Graph API',
    slug: 'instagram-graph',
    description: 'Post content on Instagram',
    type: 'social_post' as const,
    provider: 'meta',
    apiEndpoint: 'https://graph.facebook.com/v18.0',
    authMethod: 'oauth2' as const,
    config: {
      timeout: 30000,
      retries: 2,
    },
    inputSchema: {
      ig_user_id: { type: 'string', required: true },
      image_url: { type: 'string' },
      caption: { type: 'string' },
    },
    outputSchema: {
      media_id: { type: 'string' },
    },
    costPerCall: '0',
    costUnit: 'call',
    isBuiltIn: true,
  },
  // Email
  {
    name: 'SendGrid Email',
    slug: 'sendgrid-email',
    description: 'Send transactional and marketing emails',
    type: 'email' as const,
    provider: 'sendgrid',
    apiEndpoint: 'https://api.sendgrid.com/v3/mail/send',
    authMethod: 'bearer_token' as const,
    config: {
      timeout: 30000,
      retries: 3,
    },
    inputSchema: {
      to: { type: 'string', required: true },
      from: { type: 'string', required: true },
      subject: { type: 'string', required: true },
      html: { type: 'string' },
      text: { type: 'string' },
    },
    outputSchema: {
      message_id: { type: 'string' },
    },
    costPerCall: '0.0001',
    costUnit: 'email',
    isBuiltIn: true,
  },
  {
    name: 'Resend Email',
    slug: 'resend-email',
    description: 'Modern email API for developers',
    type: 'email' as const,
    provider: 'resend',
    apiEndpoint: 'https://api.resend.com/emails',
    authMethod: 'bearer_token' as const,
    config: {
      timeout: 30000,
      retries: 3,
    },
    inputSchema: {
      to: { type: 'array', required: true },
      from: { type: 'string', required: true },
      subject: { type: 'string', required: true },
      html: { type: 'string' },
    },
    outputSchema: {
      id: { type: 'string' },
    },
    costPerCall: '0',
    costUnit: 'email',
    isBuiltIn: true,
  },
  // Storage
  {
    name: 'AWS S3',
    slug: 'aws-s3',
    description: 'Store and serve assets via AWS S3',
    type: 'storage' as const,
    provider: 'aws',
    apiEndpoint: '',
    authMethod: 'api_key' as const,
    config: {
      timeout: 60000,
      retries: 2,
    },
    inputSchema: {
      bucket: { type: 'string', required: true },
      key: { type: 'string', required: true },
      body: { type: 'string', required: true },
      contentType: { type: 'string' },
    },
    outputSchema: {
      url: { type: 'string' },
      key: { type: 'string' },
    },
    costPerCall: '0.000015',
    costUnit: 'request',
    isBuiltIn: true,
  },
  // Text Generation
  {
    name: 'Claude API',
    slug: 'claude-api',
    description: 'Generate text using Claude AI',
    type: 'text_generation' as const,
    provider: 'anthropic',
    apiEndpoint: 'https://api.anthropic.com/v1/messages',
    authMethod: 'api_key' as const,
    config: {
      timeout: 120000,
      retries: 2,
      headers: {
        'anthropic-version': '2023-06-01',
      },
    },
    inputSchema: {
      model: { type: 'string', default: 'claude-sonnet-4-20250514' },
      messages: { type: 'array', required: true },
      max_tokens: { type: 'number', default: 4096 },
    },
    outputSchema: {
      content: { type: 'array' },
      usage: { type: 'object' },
    },
    costPerCall: '0.003',
    costUnit: '1k_tokens',
    isBuiltIn: true,
  },
  // Analytics
  {
    name: 'Facebook Insights',
    slug: 'facebook-insights',
    description: 'Get analytics for Facebook pages and posts',
    type: 'analytics' as const,
    provider: 'meta',
    apiEndpoint: 'https://graph.facebook.com/v18.0',
    authMethod: 'oauth2' as const,
    config: {
      timeout: 30000,
      retries: 2,
    },
    inputSchema: {
      object_id: { type: 'string', required: true },
      metrics: { type: 'array', required: true },
      period: { type: 'string', default: 'day' },
    },
    outputSchema: {
      data: { type: 'array' },
    },
    costPerCall: '0',
    costUnit: 'call',
    isBuiltIn: true,
  },
  // Calendar
  {
    name: 'Cal.com API',
    slug: 'calcom-api',
    description: 'Schedule meetings and manage availability',
    type: 'calendar' as const,
    provider: 'calcom',
    apiEndpoint: 'https://api.cal.com/v1',
    authMethod: 'api_key' as const,
    config: {
      timeout: 30000,
      retries: 2,
    },
    inputSchema: {
      eventTypeId: { type: 'number', required: true },
      start: { type: 'string', required: true },
      end: { type: 'string', required: true },
      name: { type: 'string', required: true },
      email: { type: 'string', required: true },
    },
    outputSchema: {
      booking_id: { type: 'string' },
      meeting_url: { type: 'string' },
    },
    costPerCall: '0',
    costUnit: 'call',
    isBuiltIn: true,
  },
];

export class ToolRegistryService {
  /**
   * Seed built-in tools to database
   */
  async seedBuiltInTools(): Promise<void> {
    console.log('[ToolRegistry] Seeding built-in tools...');

    for (const tool of BUILT_IN_TOOLS) {
      const existing = await db.query.executionTools.findFirst({
        where: eq(executionTools.slug, tool.slug),
      });

      if (!existing) {
        await db.insert(executionTools).values({
          ...tool,
          isActive: true,
        });
        console.log(`[ToolRegistry] Created tool: ${tool.name}`);
      }
    }

    console.log('[ToolRegistry] Built-in tools seeded');
  }

  /**
   * Get all available tools
   */
  async getAllTools() {
    return db.query.executionTools.findMany({
      where: eq(executionTools.isActive, true),
      orderBy: (tools, { asc }) => [asc(tools.type), asc(tools.name)],
    });
  }

  /**
   * Get tool by slug
   */
  async getToolBySlug(slug: string) {
    return db.query.executionTools.findFirst({
      where: eq(executionTools.slug, slug),
    });
  }

  /**
   * Get tool by ID
   */
  async getToolById(id: string) {
    return db.query.executionTools.findFirst({
      where: eq(executionTools.id, id),
    });
  }

  /**
   * Get tools by type
   */
  async getToolsByType(type: string) {
    return db.query.executionTools.findMany({
      where: and(
        eq(executionTools.type, type as any),
        eq(executionTools.isActive, true)
      ),
    });
  }

  /**
   * Get company's configured tools with credentials
   */
  async getCompanyTools(companyId: string) {
    return db.query.companyToolCredentials.findMany({
      where: eq(companyToolCredentials.companyId, companyId),
      with: {
        tool: true,
      },
    });
  }

  /**
   * Configure tool credentials for a company
   */
  async configureToolForCompany(
    companyId: string,
    toolId: string,
    credentials: ToolCredentials,
    configOverride?: Partial<ToolConfig>
  ) {
    const existing = await db.query.companyToolCredentials.findFirst({
      where: and(
        eq(companyToolCredentials.companyId, companyId),
        eq(companyToolCredentials.toolId, toolId)
      ),
    });

    if (existing) {
      await db
        .update(companyToolCredentials)
        .set({
          credentials,
          configOverride,
          updatedAt: new Date(),
        })
        .where(eq(companyToolCredentials.id, existing.id));

      return existing.id;
    }

    const results = await db
      .insert(companyToolCredentials)
      .values({
        companyId,
        toolId,
        credentials,
        configOverride,
      })
      .returning({ id: companyToolCredentials.id });

    if (!results[0]) throw new Error('Failed to configure tool');
    return results[0].id;
  }

  /**
   * Get tool credentials for a company
   */
  async getToolCredentials(companyId: string, toolSlug: string) {
    const tool = await this.getToolBySlug(toolSlug);
    if (!tool) return null;

    const creds = await db.query.companyToolCredentials.findFirst({
      where: and(
        eq(companyToolCredentials.companyId, companyId),
        eq(companyToolCredentials.toolId, tool.id)
      ),
    });

    return creds;
  }

  /**
   * Check if company has configured a specific tool
   */
  async hasToolConfigured(companyId: string, toolSlug: string): Promise<boolean> {
    const creds = await this.getToolCredentials(companyId, toolSlug);
    return !!creds && !!creds.isEnabled;
  }

  /**
   * Enable/disable tool for company
   */
  async setToolEnabled(companyId: string, toolId: string, enabled: boolean) {
    await db
      .update(companyToolCredentials)
      .set({ isEnabled: enabled, updatedAt: new Date() })
      .where(
        and(
          eq(companyToolCredentials.companyId, companyId),
          eq(companyToolCredentials.toolId, toolId)
        )
      );
  }

  /**
   * Update last used timestamp
   */
  async markToolUsed(companyId: string, toolId: string) {
    await db
      .update(companyToolCredentials)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(companyToolCredentials.companyId, companyId),
          eq(companyToolCredentials.toolId, toolId)
        )
      );
  }

  /**
   * Create custom tool
   */
  async createCustomTool(data: {
    name: string;
    slug: string;
    description?: string;
    type: string;
    provider?: string;
    apiEndpoint?: string;
    authMethod?: string;
    config?: ToolConfig;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    costPerCall?: string;
    costUnit?: string;
  }) {
    const [tool] = await db
      .insert(executionTools)
      .values({
        ...data,
        type: data.type as any,
        authMethod: (data.authMethod || 'api_key') as any,
        isBuiltIn: false,
        isActive: true,
      })
      .returning();

    return tool;
  }

  /**
   * Delete custom tool
   */
  async deleteCustomTool(toolId: string) {
    const tool = await this.getToolById(toolId);
    if (!tool) throw new Error('Tool not found');
    if (tool.isBuiltIn) throw new Error('Cannot delete built-in tool');

    await db.delete(executionTools).where(eq(executionTools.id, toolId));
  }
}

// Export singleton
export const toolRegistry = new ToolRegistryService();
