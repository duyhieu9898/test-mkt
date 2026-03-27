import Anthropic from '@anthropic-ai/sdk';
import { brandIdentityService } from '../brand-identity-service';
import type { BrandVoice } from '@1person/core/db';
import type { SkillResult } from './marketing-skills';

const anthropic = new Anthropic();

// ============================================
// WRITE BLOG POST SKILL
// ============================================
export interface WriteBlogPostInput {
  companyId: string;
  title: string;
  topic: string;
  targetKeywords?: string[];
  targetAudience: string;
  wordCount?: number;
  tone?: 'professional' | 'casual' | 'technical' | 'conversational';
  includeMetaDescription?: boolean;
  includeTOC?: boolean;
  sections?: string[];
}

export interface GeneratedBlogPost {
  title: string;
  metaDescription?: string;
  tableOfContents?: string[];
  content: string;
  excerpt: string;
  suggestedTags: string[];
}

export async function writeBlogPost(input: WriteBlogPostInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const brand = await brandIdentityService.getBrandIdentity(input.companyId);
    const voice = brand?.voice as BrandVoice | undefined;

    const wordCount = input.wordCount || 1000;

    const prompt = `Write a comprehensive blog post with the following specifications:

Title: ${input.title}
Topic: ${input.topic}
Target Audience: ${input.targetAudience}
Word Count: Approximately ${wordCount} words
Tone: ${input.tone || 'professional'}
${voice?.tone ? `Brand Voice: ${voice.tone.join(', ')}` : ''}
${input.targetKeywords?.length ? `Target Keywords (use naturally): ${input.targetKeywords.join(', ')}` : ''}
${input.sections?.length ? `Required Sections: ${input.sections.join(', ')}` : ''}

Requirements:
1. Write in a clear, engaging style
2. Use headers (H2, H3) to structure content
3. Include a compelling introduction
4. Provide actionable insights
5. End with a strong conclusion/call-to-action
${input.includeMetaDescription ? '6. Include a 155-character meta description' : ''}
${input.includeTOC ? '7. Include a table of contents' : ''}

Return JSON:
{
  "title": "...",
  "metaDescription": "...",
  "tableOfContents": ["section1", "section2"],
  "content": "Full blog post content in Markdown format...",
  "excerpt": "Brief 2-3 sentence summary...",
  "suggestedTags": ["tag1", "tag2"]
}

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const blogPost: GeneratedBlogPost = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: { blogPost },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.003 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[ContentSkills] writeBlogPost failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// GENERATE PRODUCT DESCRIPTION SKILL
// ============================================
export interface GenerateProductDescriptionInput {
  companyId: string;
  productName: string;
  features: string[];
  specifications?: Record<string, string>;
  targetAudience: string;
  tone?: 'technical' | 'lifestyle' | 'luxury' | 'value';
  length?: 'short' | 'medium' | 'long';
}

export interface GeneratedProductDescription {
  headline: string;
  shortDescription: string;
  fullDescription: string;
  bulletPoints: string[];
  seoTitle: string;
  seoDescription: string;
}

export async function generateProductDescription(input: GenerateProductDescriptionInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const brand = await brandIdentityService.getBrandIdentity(input.companyId);
    const voice = brand?.voice as BrandVoice | undefined;

    const lengthGuide = {
      short: '100-150 words',
      medium: '200-300 words',
      long: '400-500 words',
    };

    const prompt = `Generate a compelling product description:

Product: ${input.productName}
Features: ${input.features.join(', ')}
${input.specifications ? `Specifications: ${JSON.stringify(input.specifications)}` : ''}
Target Audience: ${input.targetAudience}
Tone: ${input.tone || 'lifestyle'}
Length: ${lengthGuide[input.length || 'medium']}
${voice?.tone ? `Brand Voice: ${voice.tone.join(', ')}` : ''}

Generate:
1. Attention-grabbing headline
2. Short description (1-2 sentences)
3. Full description with benefits focus
4. 5-7 bullet points highlighting key features
5. SEO-optimized title and meta description

Return JSON:
{
  "headline": "...",
  "shortDescription": "...",
  "fullDescription": "...",
  "bulletPoints": ["...", "..."],
  "seoTitle": "...",
  "seoDescription": "..."
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const description: GeneratedProductDescription = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: { description },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.003 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[ContentSkills] generateProductDescription failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// REWRITE CONTENT SKILL
// ============================================
export interface RewriteContentInput {
  companyId: string;
  originalContent: string;
  purpose: 'improve_clarity' | 'change_tone' | 'make_shorter' | 'make_longer' | 'seo_optimize';
  targetTone?: 'professional' | 'casual' | 'technical' | 'persuasive';
  targetKeywords?: string[];
  maxLength?: number;
}

export async function rewriteContent(input: RewriteContentInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const brand = await brandIdentityService.getBrandIdentity(input.companyId);
    const voice = brand?.voice as BrandVoice | undefined;

    const purposeInstructions = {
      improve_clarity: 'Rewrite for better clarity and readability. Simplify complex sentences.',
      change_tone: `Rewrite in a ${input.targetTone || 'professional'} tone while preserving meaning.`,
      make_shorter: 'Condense while keeping key information. Remove redundancy.',
      make_longer: 'Expand with more detail, examples, and explanations.',
      seo_optimize: `Optimize for SEO. Incorporate keywords naturally: ${input.targetKeywords?.join(', ') || 'general optimization'}`,
    };

    const prompt = `${purposeInstructions[input.purpose]}

Original Content:
${input.originalContent}

${voice?.tone ? `Match this brand voice: ${voice.tone.join(', ')}` : ''}
${input.maxLength ? `Maximum length: ${input.maxLength} characters` : ''}

Return JSON:
{
  "rewrittenContent": "...",
  "changes": ["change1", "change2"],
  "wordCountDiff": 0
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: result,
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.003 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[ContentSkills] rewriteContent failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// GENERATE FAQ SKILL
// ============================================
export interface GenerateFAQInput {
  companyId: string;
  topic: string;
  context: string;
  numberOfQuestions?: number;
  targetAudience?: string;
}

export interface GeneratedFAQ {
  question: string;
  answer: string;
}

export async function generateFAQ(input: GenerateFAQInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const brand = await brandIdentityService.getBrandIdentity(input.companyId);
    const voice = brand?.voice as BrandVoice | undefined;

    const prompt = `Generate ${input.numberOfQuestions || 5} frequently asked questions and answers about:

Topic: ${input.topic}
Context: ${input.context}
${input.targetAudience ? `Target Audience: ${input.targetAudience}` : ''}
${voice?.tone ? `Answer Tone: ${voice.tone.join(', ')}` : ''}

Requirements:
- Questions should be what real customers would ask
- Answers should be helpful and concise
- Include a mix of basic and advanced questions

Return JSON array:
[
  { "question": "...", "answer": "..." },
  ...
]`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }

    const faqs: GeneratedFAQ[] = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: { faqs },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.003 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[ContentSkills] generateFAQ failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// SKILL EXECUTOR MAP
// ============================================
export const contentSkillExecutors: Record<string, (input: unknown) => Promise<SkillResult>> = {
  write_blog_post: (input) => writeBlogPost(input as WriteBlogPostInput),
  generate_product_description: (input) => generateProductDescription(input as GenerateProductDescriptionInput),
  rewrite_content: (input) => rewriteContent(input as RewriteContentInput),
  generate_faq: (input) => generateFAQ(input as GenerateFAQInput),
};
