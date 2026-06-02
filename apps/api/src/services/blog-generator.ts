/**
 * Blog Generator Service
 *
 * Generates long-form SEO blog posts (1500-3000 words).
 * Different from landing pages — these are articles with proper
 * H2/H3 structure, FAQ sections, and schema markup.
 *
 * Used by: SEO Engine (step 5)
 */

import { llmGenerate, extractJSON } from '../lib/llm';
import { buildBusinessContext } from './business-context';
import { renderSkillKnowledge } from '@1person/core';

// Expert copywriting playbook injected into the prose-writing step (skill K01).
const COPYWRITING_FRAMEWORK = renderSkillKnowledge('copywriting');

export class BlogGenerator {
  /**
   * Generate a full SEO blog post from a keyword and context.
   */
  async generateBlogPost(
    companyId: string,
    options: {
      keyword: string;
      searchIntent: 'informational' | 'commercial' | 'transactional';
      language: string;
      relatedProducts?: string[];
      targetWordCount?: number;
    }
  ): Promise<{
    title: string;
    slug: string;
    metaDescription: string;
    content: string;
    excerpt: string;
    faq: Array<{ question: string; answer: string }>;
    tags: string[];
    schemaMarkup: object;
    wordCount: number;
  }> {
    const ctx = await buildBusinessContext(companyId);
    const wordCount = options.targetWordCount || 2000;

    // Step 1: Generate the blog outline + metadata
    const outlineResp = await llmGenerate(
      [
        {
          role: 'system',
          content: `You are an expert SEO content strategist. You create blog post outlines that rank on Google.
All output MUST be in language: ${options.language}.
Respond ONLY with a JSON object.`,
        },
        {
          role: 'user',
          content: `Create a detailed blog post outline for the keyword "${options.keyword}".

Business context:
- Company: ${ctx.companyName}
- Industry: ${ctx.industry}
- Description: ${ctx.description}
- Products: ${ctx.products.join(', ') || 'N/A'}
- Target audience: ${ctx.targetAudience.join(', ') || 'General'}

Search intent: ${options.searchIntent}
Related products to mention naturally: ${options.relatedProducts?.join(', ') || 'none'}
Target word count: ${wordCount}
Language: ${options.language}

Return JSON:
{
  "title": "SEO title with keyword (50-60 chars)",
  "slug": "url-friendly-slug",
  "metaDescription": "Compelling meta description (150-160 chars) with keyword",
  "excerpt": "2-3 sentence excerpt for previews",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "sections": [
    {
      "h2": "Section heading with keyword variation",
      "subsections": [
        { "h3": "Subsection heading", "points": ["key point 1", "key point 2"] }
      ]
    }
  ],
  "faq": [
    { "question": "Common question about keyword?", "answer": "Concise answer (2-3 sentences)" }
  ]
}

Requirements:
- Title must contain the main keyword
- 4-6 H2 sections, each with 1-3 H3 subsections
- 3-5 FAQ questions that people actually search for
- Naturally mention the company/products where relevant
- All text in ${options.language}`,
        },
      ],
      { maxTokens: 3000, json: true }
    );

    const outline = extractJSON(outlineResp.text);
    if (!outline || !outline.sections) {
      throw new Error('Failed to generate blog outline — AI returned invalid structure');
    }

    // Step 2: Generate the full HTML content from the outline
    const contentResp = await llmGenerate(
      [
        {
          role: 'system',
          content: `You are an expert SEO blog writer. Write engaging, informative content that ranks on Google.
All output MUST be in language: ${options.language}.
Write ONLY the HTML content — no JSON wrapper, no markdown fences.

${COPYWRITING_FRAMEWORK}`,
        },
        {
          role: 'user',
          content: `Write a full blog post based on this outline. Target ${wordCount} words.

Title: ${outline.title}
Keyword: ${options.keyword}
Search intent: ${options.searchIntent}
Company: ${ctx.companyName} (${ctx.industry})

Outline:
${JSON.stringify(outline.sections, null, 2)}

Rules:
1. Start with an engaging introduction (2-3 paragraphs). Include the keyword in the first 100 words.
2. Use <h2> and <h3> tags for headings — follow the outline structure.
3. Write 200-400 words per H2 section.
4. Use <p> tags for paragraphs, <ul>/<li> for lists, <strong> for emphasis.
5. Include a <blockquote> or key takeaway in at least one section.
6. End with a conclusion that includes a call-to-action mentioning ${ctx.companyName}.
7. Do NOT include <h1> — the title is rendered separately.
8. Do NOT include FAQ section — it's handled separately.
9. Write naturally — no keyword stuffing. Aim for 1-2% keyword density.
10. All content in ${options.language}.
11. Mention these products naturally where relevant: ${options.relatedProducts?.join(', ') || ctx.products.slice(0, 3).join(', ') || 'N/A'}`,
        },
      ],
      { maxTokens: 8000 }
    );

    const htmlContent = contentResp.text
      .replace(/```html\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Build FAQ HTML
    const faqHtml = this.buildFaqHtml(outline.faq || []);
    const fullContent = htmlContent + '\n\n' + faqHtml;

    // Count words (strip HTML tags)
    const actualWordCount = fullContent.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;

    // Build schema markup
    const schemaMarkup = this.buildSchemaMarkup({
      title: outline.title,
      description: outline.metaDescription,
      faq: outline.faq || [],
      companyName: ctx.companyName,
    });

    return {
      title: outline.title,
      slug: outline.slug || this.slugify(outline.title),
      metaDescription: outline.metaDescription,
      content: fullContent,
      excerpt: outline.excerpt,
      faq: outline.faq || [],
      tags: outline.tags || [],
      schemaMarkup,
      wordCount: actualWordCount,
    };
  }

  private buildFaqHtml(faq: Array<{ question: string; answer: string }>): string {
    if (!faq.length) return '';
    let html = '<section class="faq-section">\n<h2>Frequently Asked Questions</h2>\n';
    for (const item of faq) {
      html += `<div class="faq-item">\n<h3>${item.question}</h3>\n<p>${item.answer}</p>\n</div>\n`;
    }
    html += '</section>';
    return html;
  }

  private buildSchemaMarkup(data: {
    title: string;
    description: string;
    faq: Array<{ question: string; answer: string }>;
    companyName: string;
  }): object {
    const schema: any = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: data.title,
      description: data.description,
      author: {
        '@type': 'Organization',
        name: data.companyName,
      },
    };

    if (data.faq.length > 0) {
      schema.mainEntity = {
        '@type': 'FAQPage',
        mainEntity: data.faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      };
    }

    return schema;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 100);
  }
}

export const blogGenerator = new BlogGenerator();
