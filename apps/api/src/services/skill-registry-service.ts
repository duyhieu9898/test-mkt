import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../lib/db';
import { skills, agentSkills, skillUsageLogs } from '@1person/core/db';

// Marketing Agent Skills
const MARKETING_SKILLS = [
  {
    name: 'Generate Ad Copy',
    slug: 'generate_ad_copy',
    description: 'Generate compelling advertising copy for campaigns',
    category: 'marketing' as const,
    definition: {
      triggers: ['create ad', 'write ad copy', 'generate advertisement'],
      prompts: {
        system: `You are an expert marketing copywriter. Create compelling, conversion-focused ad copy that resonates with the target audience.`,
        task: `Create ad copy for {{campaign_goal}}. Target audience: {{target_audience}}. Tone: {{tone}}. Include headline, body text, and call-to-action.`,
      },
      tools: ['claude-api'],
      parameters: [
        { name: 'campaign_goal', type: 'string', required: true, description: 'What the campaign aims to achieve' },
        { name: 'target_audience', type: 'string', required: true, description: 'Who the ad is targeting' },
        { name: 'tone', type: 'string', required: false, default: 'professional', description: 'Tone of voice' },
        { name: 'platform', type: 'string', required: false, description: 'Where the ad will be shown' },
      ],
      outputFormat: 'json',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  {
    name: 'Generate Banner',
    slug: 'generate_banner',
    description: 'Generate banner images for marketing campaigns',
    category: 'marketing' as const,
    definition: {
      triggers: ['create banner', 'generate image', 'make banner'],
      prompts: {
        system: 'Generate marketing banners that align with brand guidelines.',
        task: `Create a banner image for {{campaign_name}}. Style: {{style}}. Include text: {{headline}}`,
      },
      tools: ['replicate-flux', 'openai-dalle3'],
      parameters: [
        { name: 'campaign_name', type: 'string', required: true },
        { name: 'headline', type: 'string', required: false },
        { name: 'style', type: 'string', required: false, default: 'modern' },
        { name: 'size', type: 'string', required: false, default: '1200x628' },
        { name: 'brand_colors', type: 'object', required: false },
      ],
      outputFormat: 'image_url',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  {
    name: 'Generate Short Video',
    slug: 'generate_short_video',
    description: 'Create short promotional videos from images or prompts',
    category: 'marketing' as const,
    definition: {
      triggers: ['create video', 'make video', 'generate video'],
      prompts: {
        system: 'Create engaging short-form videos for social media marketing.',
        task: `Create a {{duration}}s video. Theme: {{theme}}. Style: {{style}}`,
      },
      tools: ['replicate-video'],
      parameters: [
        { name: 'theme', type: 'string', required: true },
        { name: 'duration', type: 'number', required: false, default: 5 },
        { name: 'style', type: 'string', required: false, default: 'modern' },
        { name: 'images', type: 'array', required: false, description: 'Source images for slideshow' },
        { name: 'music_style', type: 'string', required: false },
      ],
      outputFormat: 'video_url',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  {
    name: 'Schedule Social Post',
    slug: 'schedule_social_post',
    description: 'Schedule and publish posts to social media platforms',
    category: 'marketing' as const,
    definition: {
      triggers: ['post to facebook', 'schedule post', 'publish social'],
      prompts: {
        system: 'Schedule social media posts with optimal timing.',
        task: `Post to {{platform}}: {{content}}`,
      },
      tools: ['facebook-graph', 'instagram-graph'],
      parameters: [
        { name: 'platform', type: 'string', required: true, enum: ['facebook', 'instagram', 'twitter'] },
        { name: 'content', type: 'string', required: true },
        { name: 'media_url', type: 'string', required: false },
        { name: 'scheduled_time', type: 'string', required: false, description: 'ISO timestamp' },
      ],
      outputFormat: 'json',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  {
    name: 'Analyze Campaign',
    slug: 'analyze_campaign',
    description: 'Analyze marketing campaign performance and generate insights',
    category: 'marketing' as const,
    definition: {
      triggers: ['analyze campaign', 'campaign report', 'get analytics'],
      prompts: {
        system: 'Analyze marketing campaigns and provide actionable insights.',
        task: `Analyze campaign {{campaign_id}} for period {{date_range}}. Focus on: {{metrics}}`,
      },
      tools: ['facebook-insights', 'claude-api'],
      parameters: [
        { name: 'campaign_id', type: 'string', required: true },
        { name: 'date_range', type: 'object', required: false },
        { name: 'metrics', type: 'array', required: false, default: ['impressions', 'clicks', 'conversions'] },
      ],
      outputFormat: 'json',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  // Distribution Engine Skills (Real Social Media Posting)
  {
    name: 'Publish Social Post Now',
    slug: 'publish_social_post',
    description: 'Immediately publish a post to social media via Distribution Engine',
    category: 'marketing' as const,
    definition: {
      triggers: ['post now', 'publish immediately', 'post to facebook now', 'publish post'],
      prompts: {
        system: 'Publish content to social media immediately using the Distribution Engine.',
        task: `Post to {{platform}}: {{content}}`,
      },
      tools: ['facebook-graph', 'instagram-graph', 'distribution-engine'],
      parameters: [
        { name: 'companyId', type: 'string', required: true },
        { name: 'connectionId', type: 'string', required: true, description: 'Social connection ID to use' },
        { name: 'platform', type: 'string', required: true, enum: ['facebook', 'instagram', 'twitter', 'linkedin'] },
        { name: 'content', type: 'string', required: true },
        { name: 'mediaUrls', type: 'array', required: false },
        { name: 'hashtags', type: 'array', required: false },
      ],
      outputFormat: 'json',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  {
    name: 'Get Post Engagement',
    slug: 'get_post_engagement',
    description: 'Fetch engagement metrics for a published post',
    category: 'marketing' as const,
    definition: {
      triggers: ['get engagement', 'check metrics', 'post performance', 'how is post doing'],
      prompts: {
        system: 'Retrieve and analyze engagement metrics from published posts.',
        task: `Get engagement for post {{postId}}`,
      },
      tools: ['facebook-insights', 'distribution-engine'],
      parameters: [
        { name: 'companyId', type: 'string', required: true },
        { name: 'postId', type: 'string', required: true },
      ],
      outputFormat: 'json',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  {
    name: 'Get Distribution Metrics',
    slug: 'get_distribution_metrics',
    description: 'Get overall metrics summary for all distribution activities',
    category: 'marketing' as const,
    definition: {
      triggers: ['distribution metrics', 'social media stats', 'marketing metrics'],
      prompts: {
        system: 'Retrieve overall distribution performance metrics.',
        task: `Get distribution metrics for company`,
      },
      tools: ['distribution-engine'],
      parameters: [
        { name: 'companyId', type: 'string', required: true },
      ],
      outputFormat: 'json',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
];

// Sales Agent Skills
const SALES_SKILLS = [
  {
    name: 'Score Lead',
    slug: 'score_lead',
    description: 'Score and qualify leads based on engagement and fit',
    category: 'sales' as const,
    definition: {
      triggers: ['score lead', 'qualify lead', 'assess lead'],
      prompts: {
        system: 'You are a sales qualification expert. Analyze leads to determine their potential value and readiness to buy.',
        task: `Score this lead: {{lead_data}}. Consider: company size, engagement level, budget indicators, and buying signals.`,
      },
      tools: ['claude-api'],
      parameters: [
        { name: 'lead_data', type: 'object', required: true },
        { name: 'scoring_criteria', type: 'object', required: false },
      ],
      outputFormat: 'json',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  {
    name: 'Send Outreach Email',
    slug: 'send_outreach_email',
    description: 'Send personalized outreach emails to prospects',
    category: 'sales' as const,
    definition: {
      triggers: ['send email', 'outreach', 'cold email'],
      prompts: {
        system: 'Craft personalized outreach emails that open conversations and build relationships.',
        task: `Write an outreach email to {{recipient_name}} at {{company}}. Purpose: {{purpose}}. Personalization notes: {{notes}}`,
      },
      tools: ['claude-api', 'sendgrid-email', 'resend-email'],
      parameters: [
        { name: 'recipient_email', type: 'string', required: true },
        { name: 'recipient_name', type: 'string', required: true },
        { name: 'company', type: 'string', required: false },
        { name: 'purpose', type: 'string', required: true },
        { name: 'notes', type: 'string', required: false },
        { name: 'template_id', type: 'string', required: false },
      ],
      outputFormat: 'json',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  {
    name: 'Schedule Meeting',
    slug: 'schedule_meeting',
    description: 'Book meetings with prospects and clients',
    category: 'sales' as const,
    definition: {
      triggers: ['book meeting', 'schedule call', 'set up meeting'],
      prompts: {
        system: 'Schedule meetings efficiently while respecting both parties calendars.',
        task: `Schedule a {{meeting_type}} with {{attendee_name}} ({{attendee_email}}).`,
      },
      tools: ['calcom-api'],
      parameters: [
        { name: 'attendee_name', type: 'string', required: true },
        { name: 'attendee_email', type: 'string', required: true },
        { name: 'meeting_type', type: 'string', required: true },
        { name: 'preferred_times', type: 'array', required: false },
        { name: 'duration_minutes', type: 'number', required: false, default: 30 },
      ],
      outputFormat: 'json',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  {
    name: 'Follow Up',
    slug: 'follow_up',
    description: 'Send follow-up messages to prospects in the pipeline',
    category: 'sales' as const,
    definition: {
      triggers: ['follow up', 'send reminder', 'check in'],
      prompts: {
        system: 'Create thoughtful follow-up messages that move deals forward without being pushy.',
        task: `Create follow-up for {{contact_name}}. Last interaction: {{last_interaction}}. Deal stage: {{deal_stage}}`,
      },
      tools: ['claude-api', 'sendgrid-email'],
      parameters: [
        { name: 'contact_name', type: 'string', required: true },
        { name: 'contact_email', type: 'string', required: true },
        { name: 'last_interaction', type: 'string', required: false },
        { name: 'deal_stage', type: 'string', required: false },
        { name: 'follow_up_type', type: 'string', required: false, default: 'email' },
      ],
      outputFormat: 'json',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
];

// Support Agent Skills
const SUPPORT_SKILLS = [
  {
    name: 'Answer Question',
    slug: 'answer_question',
    description: 'Answer customer questions using knowledge base and AI',
    category: 'communication' as const,
    definition: {
      triggers: ['answer', 'respond', 'help with question'],
      prompts: {
        system: `You are a helpful customer support agent. Provide accurate, friendly, and concise answers. If you don't know something, say so and offer to escalate.`,
        task: `Customer question: {{question}}. Context: {{context}}. Previous messages: {{history}}`,
      },
      tools: ['claude-api'],
      parameters: [
        { name: 'question', type: 'string', required: true },
        { name: 'context', type: 'object', required: false },
        { name: 'history', type: 'array', required: false },
        { name: 'knowledge_base_ids', type: 'array', required: false },
      ],
      outputFormat: 'text',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  {
    name: 'Create Ticket',
    slug: 'create_ticket',
    description: 'Create support tickets for customer issues',
    category: 'communication' as const,
    definition: {
      triggers: ['create ticket', 'open ticket', 'report issue'],
      prompts: {
        system: 'Create well-structured support tickets with clear descriptions.',
        task: `Create ticket for: {{issue_description}}. Customer: {{customer_info}}. Priority: {{priority}}`,
      },
      tools: ['claude-api'],
      parameters: [
        { name: 'issue_description', type: 'string', required: true },
        { name: 'customer_info', type: 'object', required: true },
        { name: 'priority', type: 'string', required: false, default: 'medium', enum: ['low', 'medium', 'high', 'urgent'] },
        { name: 'category', type: 'string', required: false },
      ],
      outputFormat: 'json',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  {
    name: 'Escalate Issue',
    slug: 'escalate_issue',
    description: 'Escalate complex issues to human support',
    category: 'communication' as const,
    definition: {
      triggers: ['escalate', 'transfer to human', 'need human help'],
      prompts: {
        system: 'Prepare escalation with all necessary context for human agents.',
        task: `Prepare escalation summary. Issue: {{issue}}. Customer history: {{history}}. Attempted solutions: {{solutions_tried}}`,
      },
      tools: ['claude-api'],
      parameters: [
        { name: 'issue', type: 'string', required: true },
        { name: 'history', type: 'array', required: false },
        { name: 'solutions_tried', type: 'array', required: false },
        { name: 'escalation_reason', type: 'string', required: true },
      ],
      outputFormat: 'json',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
];

// Content Agent Skills
const CONTENT_SKILLS = [
  {
    name: 'Write Blog Post',
    slug: 'write_blog_post',
    description: 'Write SEO-optimized blog posts',
    category: 'content' as const,
    definition: {
      triggers: ['write blog', 'create article', 'blog post'],
      prompts: {
        system: `You are an expert content writer. Create engaging, well-structured blog posts that are SEO-optimized and provide value to readers.`,
        task: `Write a blog post about {{topic}}. Target keywords: {{keywords}}. Word count: {{word_count}}. Tone: {{tone}}`,
      },
      tools: ['claude-api'],
      parameters: [
        { name: 'topic', type: 'string', required: true },
        { name: 'keywords', type: 'array', required: false },
        { name: 'word_count', type: 'number', required: false, default: 1500 },
        { name: 'tone', type: 'string', required: false, default: 'professional' },
        { name: 'outline', type: 'string', required: false },
      ],
      outputFormat: 'markdown',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  {
    name: 'Create Social Content',
    slug: 'create_social_content',
    description: 'Generate social media content (posts, threads, carousels)',
    category: 'content' as const,
    definition: {
      triggers: ['social content', 'create post', 'write social'],
      prompts: {
        system: 'Create engaging social media content optimized for each platform.',
        task: `Create {{content_type}} for {{platform}} about {{topic}}. Style: {{style}}`,
      },
      tools: ['claude-api'],
      parameters: [
        { name: 'topic', type: 'string', required: true },
        { name: 'platform', type: 'string', required: true, enum: ['twitter', 'linkedin', 'instagram', 'facebook'] },
        { name: 'content_type', type: 'string', required: false, default: 'post', enum: ['post', 'thread', 'carousel'] },
        { name: 'style', type: 'string', required: false },
        { name: 'hashtags', type: 'boolean', required: false, default: true },
      ],
      outputFormat: 'json',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
  {
    name: 'Write Email Newsletter',
    slug: 'write_newsletter',
    description: 'Create email newsletters and campaigns',
    category: 'content' as const,
    definition: {
      triggers: ['newsletter', 'email content', 'write email'],
      prompts: {
        system: 'Write compelling email newsletters that drive engagement and action.',
        task: `Create newsletter about {{topic}}. Goals: {{goals}}. Sections: {{sections}}`,
      },
      tools: ['claude-api'],
      parameters: [
        { name: 'topic', type: 'string', required: true },
        { name: 'goals', type: 'array', required: false },
        { name: 'sections', type: 'array', required: false },
        { name: 'cta', type: 'string', required: false },
        { name: 'tone', type: 'string', required: false, default: 'friendly' },
      ],
      outputFormat: 'html',
    },
    version: '1.0.0',
    authorId: 'system',
    authorName: '1Person System',
    status: 'published' as const,
  },
];

const ALL_BUILT_IN_SKILLS = [
  ...MARKETING_SKILLS,
  ...SALES_SKILLS,
  ...SUPPORT_SKILLS,
  ...CONTENT_SKILLS,
];

export class SkillRegistryService {
  /**
   * Seed built-in skills to database
   */
  async seedBuiltInSkills(): Promise<void> {
    console.log('[SkillRegistry] Seeding built-in skills...');

    for (const skill of ALL_BUILT_IN_SKILLS) {
      const existing = await db.query.skills.findFirst({
        where: and(
          eq(skills.slug, skill.slug),
          eq(skills.companyId, null as any) // System skills have no company
        ),
      });

      if (!existing) {
        await db.insert(skills).values({
          ...skill,
          companyId: null, // System-wide skill
          tags: [skill.category, 'built-in'],
        });
        console.log(`[SkillRegistry] Created skill: ${skill.name}`);
      }
    }

    console.log('[SkillRegistry] Built-in skills seeded');
  }

  /**
   * Get all available skills
   */
  async getAllSkills(includeCompanySkills?: string) {
    if (includeCompanySkills) {
      return db.query.skills.findMany({
        where: (s, { or, eq, isNull }) =>
          or(isNull(s.companyId), eq(s.companyId, includeCompanySkills)),
        orderBy: (s, { asc }) => [asc(s.category), asc(s.name)],
      });
    }

    return db.query.skills.findMany({
      where: eq(skills.status, 'published'),
      orderBy: (s, { asc }) => [asc(s.category), asc(s.name)],
    });
  }

  /**
   * Get skill by slug
   */
  async getSkillBySlug(slug: string, companyId?: string) {
    if (companyId) {
      // First try company-specific skill
      const companySkill = await db.query.skills.findFirst({
        where: and(eq(skills.slug, slug), eq(skills.companyId, companyId)),
      });
      if (companySkill) return companySkill;
    }

    // Fall back to system skill
    return db.query.skills.findFirst({
      where: and(eq(skills.slug, slug), eq(skills.companyId, null as any)),
    });
  }

  /**
   * Get skills by category
   */
  async getSkillsByCategory(category: string) {
    return db.query.skills.findMany({
      where: and(
        eq(skills.category, category as any),
        eq(skills.status, 'published')
      ),
    });
  }

  /**
   * Get skills for a specific agent
   */
  async getAgentSkills(agentId: string) {
    return db.query.agentSkills.findMany({
      where: and(
        eq(agentSkills.agentId, agentId),
        eq(agentSkills.enabled, true)
      ),
      with: {
        skill: true,
      },
    });
  }

  /**
   * Install skill for agent
   */
  async installSkillForAgent(
    agentId: string,
    skillId: string,
    companyId: string,
    installedBy?: string,
    customConfig?: Record<string, unknown>
  ) {
    const existing = await db.query.agentSkills.findFirst({
      where: and(
        eq(agentSkills.agentId, agentId),
        eq(agentSkills.skillId, skillId)
      ),
    });

    if (existing) {
      // Re-enable if disabled
      await db
        .update(agentSkills)
        .set({
          enabled: true,
          customConfig: customConfig || existing.customConfig,
        })
        .where(eq(agentSkills.id, existing.id));
      return existing.id;
    }

    const results = await db
      .insert(agentSkills)
      .values({
        agentId,
        skillId,
        companyId,
        installedBy,
        customConfig,
      })
      .returning({ id: agentSkills.id });

    if (!results[0]) throw new Error('Failed to install skill');
    return results[0].id;
  }

  /**
   * Uninstall skill from agent
   */
  async uninstallSkillFromAgent(agentId: string, skillId: string) {
    await db
      .update(agentSkills)
      .set({ enabled: false })
      .where(
        and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillId, skillId))
      );
  }

  /**
   * Log skill usage
   */
  async logSkillUsage(data: {
    skillId: string;
    agentId: string;
    companyId: string;
    taskId?: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    success: boolean;
    errorMessage?: string;
    executionTimeMs?: number;
    tokensUsed?: number;
    costUsd?: number;
  }) {
    await db.insert(skillUsageLogs).values({
      ...data,
      metadata: {},
    });

    // Update usage count
    await db
      .update(skills)
      .set({
        usageCount: (await db.query.skills.findFirst({ where: eq(skills.id, data.skillId) }))
          ?.usageCount ?? 0 + 1,
      })
      .where(eq(skills.id, data.skillId));

    // Update agent skill stats
    await db
      .update(agentSkills)
      .set({
        usageCount: (await db.query.agentSkills.findFirst({
          where: and(
            eq(agentSkills.agentId, data.agentId),
            eq(agentSkills.skillId, data.skillId)
          ),
        }))?.usageCount ?? 0 + 1,
        lastUsedAt: new Date(),
      })
      .where(
        and(
          eq(agentSkills.agentId, data.agentId),
          eq(agentSkills.skillId, data.skillId)
        )
      );
  }

  /**
   * Create custom skill for company
   */
  async createCustomSkill(
    companyId: string,
    data: {
      name: string;
      slug: string;
      description?: string;
      category: string;
      definition: {
        triggers: string[];
        prompts: { system: string; task: string };
        tools: string[];
        parameters: Array<{
          name: string;
          type: string;
          required: boolean;
          description?: string;
          default?: unknown;
        }>;
        outputFormat?: string;
      };
      authorId: string;
      authorName?: string;
    }
  ) {
    const [skill] = await db
      .insert(skills)
      .values({
        ...data,
        companyId,
        category: data.category as any,
        version: '1.0.0',
        status: 'draft',
        tags: [data.category, 'custom'],
      })
      .returning();

    return skill;
  }

  /**
   * Get skills required tools
   */
  async getSkillTools(skillSlug: string): Promise<string[]> {
    const skill = await this.getSkillBySlug(skillSlug);
    if (!skill) return [];

    return (skill.definition as any)?.tools || [];
  }
}

// Export singleton
export const skillRegistry = new SkillRegistryService();
