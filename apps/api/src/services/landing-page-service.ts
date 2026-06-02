/**
 * Landing Page Service
 *
 * Implements the Prompt-to-Page Pipeline:
 * 1. User Prompt → Business Understanding
 * 2. Business Understanding → Page Structure
 * 3. Page Structure → Content Generation
 * 4. Content → Asset Generation
 * 5. Assets → Page Assembly
 * 6. Assembly → Deployment
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from '../lib/db';
import { eq, desc, and } from 'drizzle-orm';
import {
  landingPages,
  landingPageSections,
  landingPageAssets,
  landingPageLeads,
  tasks,
  agents,
  type HeroSection,
  type FeatureItem,
  type PricingTier,
  type Testimonial,
  type FAQItem,
  type SEOData,
  type PageContent,
} from '@1person/core/db';
import { renderSkillKnowledge } from '@1person/core';

// Expert CRO playbook injected into the highest-leverage section copy (skill K06).
const CRO_FRAMEWORK = renderSkillKnowledge('cro');

// =============================================================================
// TYPES
// =============================================================================

export interface GeneratePageInput {
  companyId: string;
  prompt: string;
  style?: 'minimal' | 'modern' | 'bold' | 'professional' | 'playful' | 'elegant';
  primaryColor?: string;
  includeFeatures?: boolean;
  includePricing?: boolean;
  includeTestimonials?: boolean;
  includeFAQ?: boolean;
  language?: string;
  attachmentText?: string;
  images?: Array<{ url: string; role: string; alt?: string }>;
}

// Language display names for LLM instructions
const LANG_NAMES: Record<string, string> = {
  en: 'English',
  vi: 'Vietnamese',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  th: 'Thai',
  ar: 'Arabic',
  hi: 'Hindi',
  it: 'Italian',
  nl: 'Dutch',
  ru: 'Russian',
  pl: 'Polish',
  sv: 'Swedish',
  tr: 'Turkish',
  id: 'Indonesian',
  ms: 'Malay',
};

export interface GeneratedPage {
  id: string;
  name: string;
  slug: string;
  businessContext: BusinessContext;
  sections: GeneratedSection[];
  seo: SEOData;
  status: string;
  taskId?: string;
}

export interface BusinessContext {
  businessName: string;
  industry: string;
  targetAudience: string;
  valueProposition: string;
  competitors?: string[];
  tone?: string;
}

export interface GeneratedSection {
  type: string;
  order: number;
  content: unknown;
}

// =============================================================================
// LANDING PAGE SERVICE
// =============================================================================

export class LandingPageService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  // ===========================================================================
  // MAIN PIPELINE
  // ===========================================================================

  /**
   * Generate a complete landing page from a prompt
   * Creates a workflow task to track the generation process
   */
  async generateFromPrompt(input: GeneratePageInput): Promise<GeneratedPage> {
    console.log(`[LandingPageService] Starting generation for: ${input.prompt.substring(0, 50)}...`);

    // Create a workflow task to track the generation
    const task = await this.createGenerationTask(input);
    const taskId = task?.id;
    console.log(`[LandingPageService] Created task: ${taskId}`);

    try {
      // Update task status to in_progress
      if (taskId) {
        await this.updateTaskStatus(taskId, 'in_progress', 10);
      }

      // Step 1: Understand the business (include attachment text if provided)
      const fullPrompt = input.attachmentText
        ? `${input.prompt}\n\nADDITIONAL CONTENT FROM DOCUMENT:\n${input.attachmentText.substring(0, 5000)}`
        : input.prompt;
      const businessContext = await this.understandBusiness(fullPrompt, input.language);
      console.log(`[LandingPageService] Business understood: ${businessContext.businessName}`);

      if (taskId) {
        await this.updateTaskStatus(taskId, 'in_progress', 30);
      }

      // Step 2: Generate page structure
      const pageStructure = await this.generatePageStructure(businessContext, input);
      console.log(`[LandingPageService] Structure generated: ${pageStructure.sections.length} sections`);

      if (taskId) {
        await this.updateTaskStatus(taskId, 'in_progress', 50);
      }

      // Step 3: Generate content for each section
      const sections = await this.generateSectionContent(businessContext, pageStructure, input);
      console.log(`[LandingPageService] Content generated for ${sections.length} sections`);

      if (taskId) {
        await this.updateTaskStatus(taskId, 'in_progress', 70);
      }

      // Step 4: Generate SEO data
      const seo = await this.generateSEO(businessContext);
      console.log(`[LandingPageService] SEO generated`);

      if (taskId) {
        await this.updateTaskStatus(taskId, 'in_progress', 90);
      }

      // Step 5: Create page in database
      const page = await this.createPage(input, businessContext, sections, seo);
      if (!page) {
        throw new Error('Failed to create landing page');
      }
      console.log(`[LandingPageService] Page created: ${page.id}`);

      // Step 5b: Store uploaded images as landing page assets
      if (input.images?.length) {
        const heroSection = sections.find(s => s.type === 'hero');
        // Find the hero section ID from DB
        const heroSectionRow = heroSection
          ? await db.query.landingPageSections.findFirst({
              where: and(
                eq(landingPageSections.pageId, page.id),
                eq(landingPageSections.type, 'hero')
              ),
            })
          : null;

        for (const img of input.images) {
          await db.insert(landingPageAssets).values({
            pageId: page.id,
            sectionId: img.role === 'hero' ? (heroSectionRow?.id || null) : null,
            type: img.role === 'hero' ? 'hero_image' : 'image',
            name: img.alt || `${img.role} image`,
            url: img.url,
            mimeType: 'image/jpeg',
            altText: img.alt || '',
          });
        }

        // Update page content with hero image URL if provided
        const heroImage = input.images.find(i => i.role === 'hero');
        if (heroImage) {
          const currentContent = (page.content || {}) as Record<string, unknown>;
          await db.update(landingPages).set({
            content: { ...currentContent, heroImage: heroImage.url },
          }).where(eq(landingPages.id, page.id));
        }
      }

      // Mark task as completed
      if (taskId) {
        await this.updateTaskStatus(taskId, 'completed', 100, {
          pageId: page.id,
          pageName: page.name,
          pageSlug: page.slug,
        });
      }

      return {
        id: page.id,
        name: page.name,
        slug: page.slug,
        businessContext,
        sections,
        seo,
        status: page.status ?? 'draft',
        taskId,
      };
    } catch (error) {
      // Mark task as failed
      if (taskId) {
        await this.updateTaskStatus(
          taskId,
          'failed',
          0,
          undefined,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
      throw error;
    }
  }

  // ===========================================================================
  // WORKFLOW TASK HELPERS
  // ===========================================================================

  /**
   * Create a workflow task to track the landing page generation
   */
  private async createGenerationTask(input: GeneratePageInput) {
    try {
      // Find the marketing agent or any available agent for this company
      const agent = await db.query.agents.findFirst({
        where: and(
          eq(agents.companyId, input.companyId),
          eq(agents.role, 'marketing_manager')
        ),
      });

      const [task] = await db
        .insert(tasks)
        .values({
          companyId: input.companyId,
          assignedAgentId: agent?.id,
          title: `Generate Landing Page`,
          description: `Creating AI-generated landing page from prompt: "${input.prompt.substring(0, 100)}..."`,
          type: 'create_landing_page',
          status: 'pending',
          priority: 'medium',
          progress: 0,
          input: {
            type: 'landing_page_generation',
            data: {
              prompt: input.prompt,
              style: input.style,
              primaryColor: input.primaryColor,
              includeFeatures: input.includeFeatures,
              includePricing: input.includePricing,
              includeTestimonials: input.includeTestimonials,
              includeFAQ: input.includeFAQ,
            },
          },
        })
        .returning();

      return task;
    } catch (error) {
      console.error('[LandingPageService] Failed to create task:', error);
      return null;
    }
  }

  /**
   * Update the task status and progress
   */
  private async updateTaskStatus(
    taskId: string,
    status: string,
    progress: number,
    output?: { pageId?: string; pageName?: string; pageSlug?: string },
    errorMessage?: string
  ) {
    try {
      const updateData: Record<string, unknown> = {
        status: status as 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'queued' | 'waiting_approval',
        progress,
        updatedAt: new Date(),
      };

      if (output) {
        updateData.output = {
          type: 'landing_page',
          data: output,
        };
      }

      if (errorMessage) {
        updateData.errorMessage = errorMessage;
      }

      if (status === 'in_progress' && progress === 10) {
        updateData.startedAt = new Date();
      }

      if (status === 'completed') {
        updateData.completedAt = new Date();
      }

      await db
        .update(tasks)
        .set(updateData)
        .where(eq(tasks.id, taskId));
    } catch (error) {
      console.error('[LandingPageService] Failed to update task:', error);
    }
  }

  // ===========================================================================
  // STEP 1: BUSINESS UNDERSTANDING
  // ===========================================================================

  private async understandBusiness(prompt: string, language?: string): Promise<BusinessContext> {
    const langInstruction = language && language !== 'en'
      ? `\n\nCRITICAL: ALL content MUST be written in ${LANG_NAMES[language] || language}. Do NOT write in English.`
      : '';

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Analyze this business idea and extract key information.

Business Idea: "${prompt}"

Return a JSON object with these fields:
- businessName: A catchy name for this business (if not mentioned, create one)
- industry: The industry category
- targetAudience: Who is the ideal customer
- valueProposition: The main benefit/value offered
- competitors: List of potential competitors (if obvious)
- tone: Suggested brand tone (professional, friendly, bold, etc.)
${langInstruction}

Return ONLY valid JSON, no other text.`,
        },
      ],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = (content as { type: 'text'; text: string }).text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '');
      }
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Failed to parse business context:', content.text);
      // Return defaults
      return {
        businessName: 'My Business',
        industry: 'Technology',
        targetAudience: 'Businesses and professionals',
        valueProposition: prompt.substring(0, 100),
        tone: 'professional',
      };
    }
  }

  // ===========================================================================
  // STEP 2: PAGE STRUCTURE
  // ===========================================================================

  private async generatePageStructure(
    context: BusinessContext,
    input: GeneratePageInput
  ): Promise<{ sections: Array<{ type: string; order: number }> }> {
    const sections: Array<{ type: string; order: number }> = [
      { type: 'hero', order: 1 },
      { type: 'problem', order: 2 },
      { type: 'solution', order: 3 },
    ];

    if (input.includeFeatures !== false) {
      sections.push({ type: 'features', order: 4 });
    }

    if (input.includePricing) {
      sections.push({ type: 'pricing', order: 5 });
    }

    if (input.includeTestimonials) {
      sections.push({ type: 'testimonials', order: 6 });
    }

    if (input.includeFAQ) {
      sections.push({ type: 'faq', order: 7 });
    }

    sections.push({ type: 'cta', order: sections.length + 1 });

    return { sections };
  }

  // ===========================================================================
  // STEP 3: CONTENT GENERATION
  // ===========================================================================

  private async generateSectionContent(
    context: BusinessContext,
    structure: { sections: Array<{ type: string; order: number }> },
    input: GeneratePageInput
  ): Promise<GeneratedSection[]> {
    const sections: GeneratedSection[] = [];
    const langInstruction = input.language && input.language !== 'en'
      ? `\n\nCRITICAL: ALL content MUST be written in ${LANG_NAMES[input.language] || input.language}. Do NOT write in English.`
      : '';

    for (const section of structure.sections) {
      const content = await this.generateSectionContentByType(
        section.type,
        context,
        input,
        langInstruction
      );
      sections.push({
        type: section.type,
        order: section.order,
        content,
      });
    }

    return sections;
  }

  private async generateSectionContentByType(
    type: string,
    context: BusinessContext,
    input: GeneratePageInput,
    langInstruction: string
  ): Promise<unknown> {
    switch (type) {
      case 'hero':
        return this.generateHeroContent(context, langInstruction, input.images);
      case 'problem':
        return this.generateProblemContent(context, langInstruction);
      case 'solution':
        return this.generateSolutionContent(context, langInstruction);
      case 'features':
        return this.generateFeaturesContent(context, langInstruction, input.images);
      case 'pricing':
        return this.generatePricingContent(context, langInstruction);
      case 'testimonials':
        return this.generateTestimonialsContent(context, langInstruction);
      case 'faq':
        return this.generateFAQContent(context, langInstruction);
      case 'cta':
        return this.generateCTAContent(context, langInstruction);
      default:
        return {};
    }
  }

  private async generateHeroContent(
    context: BusinessContext,
    langInstruction: string = '',
    images?: Array<{ url: string; role: string; alt?: string }>
  ): Promise<HeroSection> {
    const heroImage = images?.find(i => i.role === 'hero');
    const imageInstruction = heroImage
      ? `\nA hero image has been provided. Include this in the section: imageUrl: "${heroImage.url}"`
      : '';

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: CRO_FRAMEWORK || undefined,
      messages: [
        {
          role: 'user',
          content: `Write compelling hero section copy for a landing page.

Business: ${context.businessName}
Industry: ${context.industry}
Target Audience: ${context.targetAudience}
Value Proposition: ${context.valueProposition}
Tone: ${context.tone || 'professional'}

Return JSON with:
- headline: Main headline (max 10 words, powerful)
- subheadline: Supporting text (max 25 words)
- ctaText: Primary button text (max 4 words)
- ctaSecondaryText: Secondary action text (optional)
- alignment: "center" or "left"
${heroImage ? '- imageUrl: "' + heroImage.url + '"' : ''}
${langInstruction}

Return ONLY valid JSON.`,
        },
      ],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      let jsonStr = (content as { type: 'text'; text: string }).text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '');
      }
      const result = JSON.parse(jsonStr);
      // Ensure hero image URL is included in content
      if (heroImage && !result.imageUrl) {
        result.imageUrl = heroImage.url;
      }
      return result;
    } catch {
      return {
        headline: `Transform Your ${context.industry} Business`,
        subheadline: context.valueProposition,
        ctaText: 'Get Started',
        alignment: 'center',
        ...(heroImage ? { imageUrl: heroImage.url } : {}),
      } as HeroSection;
    }
  }

  private async generateProblemContent(
    context: BusinessContext,
    langInstruction: string = ''
  ): Promise<{ title: string; description: string; painPoints: string[] }> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Write problem section content for a landing page.

Business: ${context.businessName}
Target Audience: ${context.targetAudience}
Industry: ${context.industry}
${langInstruction}

Return JSON with:
- title: Section title
- description: Problem description
- painPoints: Array of 3-4 pain points the audience faces

Return ONLY valid JSON.`,
        },
      ],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      let jsonStr = (content as { type: 'text'; text: string }).text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '');
      }
      return JSON.parse(jsonStr);
    } catch {
      return {
        title: 'The Challenge',
        description: `${context.targetAudience} face significant challenges in today's market.`,
        painPoints: [
          'Time-consuming manual processes',
          'Lack of proper tools',
          'Difficulty scaling operations',
        ],
      };
    }
  }

  private async generateSolutionContent(
    context: BusinessContext,
    langInstruction: string = ''
  ): Promise<{ title: string; description: string; benefits: string[] }> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Write solution section content for a landing page.

Business: ${context.businessName}
Value Proposition: ${context.valueProposition}
${langInstruction}

Return JSON with:
- title: Section title
- description: How we solve the problem
- benefits: Array of 3-4 key benefits

Return ONLY valid JSON.`,
        },
      ],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      let jsonStr = (content as { type: 'text'; text: string }).text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '');
      }
      return JSON.parse(jsonStr);
    } catch {
      return {
        title: 'The Solution',
        description: context.valueProposition,
        benefits: [
          'Save time and resources',
          'Increase efficiency',
          'Scale with confidence',
        ],
      };
    }
  }

  private async generateFeaturesContent(
    context: BusinessContext,
    langInstruction: string = '',
    images?: Array<{ url: string; role: string; alt?: string }>
  ): Promise<{ title: string; features: FeatureItem[] }> {
    const featureImages = images?.filter(i => i.role === 'feature' || i.role === 'screenshot') || [];
    const imageNote = featureImages.length > 0
      ? `\nFeature images are available. You may reference them by including an imageUrl field for matching features.\nAvailable images: ${featureImages.map((img, i) => `${i + 1}. ${img.alt || img.role} (${img.url})`).join(', ')}`
      : '';

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Write features section content for a landing page.

Business: ${context.businessName}
Industry: ${context.industry}
Value Proposition: ${context.valueProposition}
${imageNote}
${langInstruction}

Return JSON with:
- title: Section title
- features: Array of 4-6 features, each with:
  - title: Feature name
  - description: Feature benefit (1-2 sentences)
  - icon: Suggested icon name (from lucide icons)
  ${featureImages.length > 0 ? '- imageUrl: (optional) URL of a matching feature image' : ''}

Return ONLY valid JSON.`,
        },
      ],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      let jsonStr = (content as { type: 'text'; text: string }).text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '');
      }
      return JSON.parse(jsonStr);
    } catch {
      return {
        title: 'Features',
        features: [
          { title: 'Easy to Use', description: 'Intuitive interface for all users', icon: 'sparkles' },
          { title: 'Fast & Reliable', description: 'Lightning-fast performance', icon: 'zap' },
          { title: 'Secure', description: 'Enterprise-grade security', icon: 'shield' },
          { title: '24/7 Support', description: 'We\'re always here to help', icon: 'headphones' },
        ],
      };
    }
  }

  private async generatePricingContent(
    context: BusinessContext,
    langInstruction: string = ''
  ): Promise<{ title: string; tiers: PricingTier[] }> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Create pricing tiers for a landing page.

Business: ${context.businessName}
Industry: ${context.industry}
Target Audience: ${context.targetAudience}
${langInstruction}

Return JSON with:
- title: Section title
- tiers: Array of 3 pricing tiers, each with:
  - name: Tier name
  - price: Monthly price (number)
  - period: "month"
  - description: Short description
  - features: Array of 4-6 features
  - ctaText: Button text
  - highlighted: boolean (true for recommended tier)

Return ONLY valid JSON.`,
        },
      ],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      let jsonStr = (content as { type: 'text'; text: string }).text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '');
      }
      return JSON.parse(jsonStr);
    } catch {
      return {
        title: 'Simple, Transparent Pricing',
        tiers: [
          {
            name: 'Starter',
            price: 29,
            period: 'month',
            description: 'Perfect for getting started',
            features: ['Core features', 'Email support', '1 user'],
            ctaText: 'Start Free Trial',
            highlighted: false,
          },
          {
            name: 'Professional',
            price: 79,
            period: 'month',
            description: 'Best for growing teams',
            features: ['All Starter features', 'Priority support', '5 users', 'Analytics'],
            ctaText: 'Start Free Trial',
            highlighted: true,
          },
          {
            name: 'Enterprise',
            price: 199,
            period: 'month',
            description: 'For large organizations',
            features: ['All Pro features', 'Dedicated support', 'Unlimited users', 'Custom integrations'],
            ctaText: 'Contact Sales',
            highlighted: false,
          },
        ],
      };
    }
  }

  private async generateTestimonialsContent(
    context: BusinessContext,
    langInstruction: string = ''
  ): Promise<{ title: string; testimonials: Testimonial[] }> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Create realistic testimonials for a landing page.

Business: ${context.businessName}
Industry: ${context.industry}
Target Audience: ${context.targetAudience}
${langInstruction}

Return JSON with:
- title: Section title
- testimonials: Array of 3 testimonials, each with:
  - name: Customer name (realistic)
  - role: Their role
  - company: Company name (realistic)
  - quote: Testimonial text (2-3 sentences, specific benefits)
  - rating: 5

Return ONLY valid JSON.`,
        },
      ],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      let jsonStr = (content as { type: 'text'; text: string }).text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '');
      }
      return JSON.parse(jsonStr);
    } catch {
      return {
        title: 'What Our Customers Say',
        testimonials: [
          {
            name: 'Sarah Chen',
            role: 'CEO',
            company: 'TechStart Inc.',
            quote: 'This product transformed how we work. Highly recommended!',
            rating: 5,
          },
        ],
      };
    }
  }

  private async generateFAQContent(
    context: BusinessContext,
    langInstruction: string = ''
  ): Promise<{ title: string; faqs: FAQItem[] }> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Create FAQ section for a landing page.

Business: ${context.businessName}
Industry: ${context.industry}
${langInstruction}

Return JSON with:
- title: Section title
- faqs: Array of 5-6 FAQs, each with:
  - question: The question
  - answer: The answer (2-3 sentences)

Return ONLY valid JSON.`,
        },
      ],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      let jsonStr = (content as { type: 'text'; text: string }).text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '');
      }
      return JSON.parse(jsonStr);
    } catch {
      return {
        title: 'Frequently Asked Questions',
        faqs: [
          { question: 'How does it work?', answer: 'Simply sign up and get started in minutes.' },
          { question: 'Is there a free trial?', answer: 'Yes, we offer a 14-day free trial.' },
        ],
      };
    }
  }

  private async generateCTAContent(
    context: BusinessContext,
    langInstruction: string = ''
  ): Promise<{ title: string; description: string; ctaText: string }> {
    // For non-English languages, generate via LLM
    if (langInstruction) {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: `Write a final call-to-action section for a landing page.

Business: ${context.businessName}
Industry: ${context.industry}
Target Audience: ${context.targetAudience}
${langInstruction}

Return JSON with:
- title: Compelling CTA headline
- description: Urgency or social proof statement
- ctaText: Strong action button text

Return ONLY valid JSON.`,
          },
        ],
      });

      const content = response.content[0];
      if (content?.type === 'text') {
        try {
          let jsonStr = content.text.trim();
          if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '');
          }
          return JSON.parse(jsonStr);
        } catch {
          // Fall through to default
        }
      }
    }

    return {
      title: `Ready to Transform Your ${context.industry} Business?`,
      description: `Join thousands of ${context.targetAudience} who have already made the switch.`,
      ctaText: 'Get Started Today',
    };
  }

  // ===========================================================================
  // STEP 4: SEO GENERATION
  // ===========================================================================

  private async generateSEO(context: BusinessContext): Promise<SEOData> {
    return {
      title: `${context.businessName} | ${context.valueProposition.substring(0, 50)}`,
      description: `${context.valueProposition}. Built for ${context.targetAudience}.`,
      keywords: [
        context.businessName.toLowerCase(),
        context.industry.toLowerCase(),
        ...context.targetAudience.toLowerCase().split(' ').slice(0, 3),
      ],
    };
  }

  // ===========================================================================
  // DATABASE OPERATIONS
  // ===========================================================================

  private async createPage(
    input: GeneratePageInput,
    context: BusinessContext,
    sections: GeneratedSection[],
    seo: SEOData
  ) {
    // Generate slug
    const slug = this.generateSlug(context.businessName);

    // Create page
    const [page] = await db
      .insert(landingPages)
      .values({
        companyId: input.companyId,
        name: context.businessName,
        slug,
        description: context.valueProposition,
        originalPrompt: input.prompt,
        businessContext: context,
        style: input.style || 'modern',
        primaryColor: input.primaryColor || '#3b82f6',
        content: {
          headline: (sections.find((s) => s.type === 'hero')?.content as HeroSection)?.headline || '',
          subheadline: (sections.find((s) => s.type === 'hero')?.content as HeroSection)?.subheadline || '',
          ctaText: (sections.find((s) => s.type === 'hero')?.content as HeroSection)?.ctaText || 'Get Started',
        },
        seo,
        status: 'ready',
      })
      .returning();

    if (!page) {
      throw new Error('Failed to insert landing page');
    }

    // Create sections
    for (const section of sections) {
      await db.insert(landingPageSections).values({
        pageId: page.id,
        type: section.type as 'hero' | 'problem' | 'solution' | 'features' | 'pricing' | 'testimonials' | 'faq' | 'cta' | 'footer' | 'custom',
        order: section.order,
        content: section.content as Record<string, unknown>,
      });
    }

    return page;
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const random = Math.random().toString(36).substring(2, 8);
    return `${base}-${random}`;
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Get a landing page by ID
   */
  async getPage(pageId: string) {
    const page = await db.query.landingPages.findFirst({
      where: eq(landingPages.id, pageId),
      with: {
        sections: true,
        assets: true,
      },
    });

    // Sort sections by order
    if (page?.sections) {
      page.sections.sort((a, b) => a.order - b.order);
    }

    return page;
  }

  /**
   * Get all pages for a company
   */
  async getPagesByCompany(companyId: string) {
    const pages = await db.query.landingPages.findMany({
      where: eq(landingPages.companyId, companyId),
      orderBy: [desc(landingPages.createdAt)],
      with: {
        sections: true,
      },
    });

    // Sort sections by order for each page
    for (const page of pages) {
      if (page.sections) {
        page.sections.sort((a, b) => a.order - b.order);
      }
    }

    return pages;
  }

  /**
   * Update page status
   */
  async updateStatus(pageId: string, status: string) {
    const [updated] = await db
      .update(landingPages)
      .set({
        status: status as any,
        updatedAt: new Date(),
        ...(status === 'published' ? { publishedAt: new Date() } : {}),
      })
      .where(eq(landingPages.id, pageId))
      .returning();

    return updated;
  }

  /**
   * Delete a page
   */
  async deletePage(pageId: string) {
    await db.delete(landingPages).where(eq(landingPages.id, pageId));
  }

  /**
   * Update all sections for a page
   */
  async updateSections(
    pageId: string,
    sections: Array<{
      id?: string;
      type: string;
      content: Record<string, unknown>;
      order: number;
      isVisible?: number;
      backgroundColor?: string;
    }>
  ) {
    // Delete existing sections
    await db.delete(landingPageSections).where(eq(landingPageSections.pageId, pageId));

    // Insert new sections
    if (sections.length > 0) {
      await db.insert(landingPageSections).values(
        sections.map((section) => ({
          id: section.id || undefined, // Let DB generate if not provided
          pageId,
          type: section.type as any,
          content: section.content,
          order: section.order,
          isVisible: section.isVisible ?? 1,
          backgroundColor: section.backgroundColor,
        }))
      );
    }

    // Update page timestamp
    await db
      .update(landingPages)
      .set({ updatedAt: new Date() })
      .where(eq(landingPages.id, pageId));

    // Return updated page with sections
    return this.getPage(pageId);
  }

  /**
   * Capture a lead
   */
  async captureLead(data: {
    pageId: string;
    companyId: string;
    email: string;
    name?: string;
    phone?: string;
    message?: string;
    source?: string;
    medium?: string;
    campaign?: string;
  }) {
    const [lead] = await db
      .insert(landingPageLeads)
      .values(data)
      .returning();

    // Update page lead count
    await db
      .update(landingPages)
      .set({
        totalLeads: landingPages.totalLeads,
      })
      .where(eq(landingPages.id, data.pageId));

    return lead;
  }

  /**
   * Get leads for a page
   */
  async getLeads(pageId: string) {
    const leads = await db.query.landingPageLeads.findMany({
      where: eq(landingPageLeads.pageId, pageId),
      orderBy: [desc(landingPageLeads.createdAt)],
    });

    return leads;
  }
}

// Export singleton
export const landingPageService = new LandingPageService();
