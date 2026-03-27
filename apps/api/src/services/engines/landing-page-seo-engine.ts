/**
 * Landing Page SEO Engine
 *
 * Applies technical SEO and renders landing pages:
 * - Generate SEO metadata
 * - Schema markup injection
 * - Sitemap generation
 * - Internal linking structure
 * - Page rendering
 *
 * Position in Architecture:
 * SEO Content Factory → Landing Page SEO Engine → Deployment Engine
 */

import { db } from '../../lib/db';
import { eq, and, desc, isNotNull } from 'drizzle-orm';
import { companies, brandIdentities, landingPages } from '@1person/core/db';
import { type SEOContentOutput } from './seo-content-factory';

// SEO Configuration
export interface SEOConfig {
  primaryKeyword: string;
  secondaryKeywords: string[];
  title: string;
  metaDescription: string;
  canonicalUrl?: string;
  ogImage?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  robots?: string;
  locale?: string;
}

// Technical SEO Output
export interface TechnicalSEO {
  metaTags: Record<string, string>;
  openGraph: Record<string, string>;
  twitterMeta: Record<string, string>;
  schemaMarkup: string; // JSON-LD
  canonicalUrl: string;
  hreflangTags?: Array<{ lang: string; url: string }>;
}

// Sitemap Entry
export interface SitemapEntry {
  loc: string;
  lastmod: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}

// Page Rendering Output
export interface RenderedPage {
  html: string;
  seo: TechnicalSEO;
  assets: string[];
  cacheKey: string;
}

/**
 * Landing Page SEO Engine Class
 */
export class LandingPageSEOEngine {
  /**
   * Generate technical SEO for a page
   */
  generateTechnicalSEO(
    content: SEOContentOutput,
    baseUrl: string,
    companyName: string
  ): TechnicalSEO {
    const pageUrl = `${baseUrl}/${content.slug}`;

    // Meta tags
    const metaTags: Record<string, string> = {
      title: content.title,
      description: content.metaDescription,
      keywords: [content.keyword, ...content.suggestedLinks.map(l => l.targetKeyword)].join(', '),
      robots: 'index, follow',
      author: companyName,
      viewport: 'width=device-width, initial-scale=1.0',
      'content-language': 'en',
    };

    // Open Graph
    const openGraph: Record<string, string> = {
      'og:title': content.title,
      'og:description': content.metaDescription,
      'og:type': content.contentType === 'blog_post' ? 'article' : 'website',
      'og:url': pageUrl,
      'og:site_name': companyName,
      'og:locale': 'en_US',
    };

    // Twitter Meta
    const twitterMeta: Record<string, string> = {
      'twitter:card': 'summary_large_image',
      'twitter:title': content.title,
      'twitter:description': content.metaDescription,
    };

    // Schema markup as string
    const schemaMarkup = JSON.stringify(content.schemaMarkup, null, 2);

    return {
      metaTags,
      openGraph,
      twitterMeta,
      schemaMarkup,
      canonicalUrl: pageUrl,
    };
  }

  /**
   * Render SEO content to HTML
   */
  async renderPage(
    companyId: string,
    content: SEOContentOutput,
    options?: {
      template?: 'minimal' | 'standard' | 'rich';
      includeAnalytics?: boolean;
    }
  ): Promise<RenderedPage> {
    console.log(`[LandingPageSEO] Rendering page: ${content.slug}`);

    // Get company info
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    const brand = await db.query.brandIdentities.findFirst({
      where: eq(brandIdentities.companyId, companyId),
    });

    const baseUrl = `https://${company?.slug || 'company'}.1person.ai`;
    const companyName = company?.name || 'Company';

    // Generate technical SEO
    const seo = this.generateTechnicalSEO(content, baseUrl, companyName);

    // Render HTML
    const html = this.renderHTML(content, seo, {
      companyName,
      brandColor: brand?.primaryColor || '#3b82f6',
      logo: brand?.logoUrl,
      template: options?.template || 'standard',
      includeAnalytics: options?.includeAnalytics ?? true,
    });

    // Generate cache key
    const cacheKey = `page-${content.slug}-${Date.now()}`;

    return {
      html,
      seo,
      assets: [],
      cacheKey,
    };
  }

  /**
   * Render HTML page
   */
  private renderHTML(
    content: SEOContentOutput,
    seo: TechnicalSEO,
    options: {
      companyName: string;
      brandColor: string;
      logo?: string;
      template: 'minimal' | 'standard' | 'rich';
      includeAnalytics: boolean;
    }
  ): string {
    // Convert markdown content to HTML (simple conversion)
    const bodyContent = this.markdownToHTML(content.content);

    // Generate FAQ HTML
    const faqHTML = content.faq.length > 0 ? `
      <section class="faq-section">
        <h2>Frequently Asked Questions</h2>
        ${content.faq.map(item => `
          <details>
            <summary>${item.question}</summary>
            <p>${item.answer}</p>
          </details>
        `).join('\n')}
      </section>
    ` : '';

    // Generate internal links HTML
    const internalLinksHTML = content.suggestedLinks.length > 0 ? `
      <nav class="related-content">
        <h3>Related Articles</h3>
        <ul>
          ${content.suggestedLinks.map(link => `
            <li><a href="/${this.slugify(link.targetKeyword)}">${link.text}</a></li>
          `).join('\n')}
        </ul>
      </nav>
    ` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Primary Meta Tags -->
  <title>${seo.metaTags.title}</title>
  <meta name="title" content="${seo.metaTags.title}">
  <meta name="description" content="${seo.metaTags.description}">
  <meta name="keywords" content="${seo.metaTags.keywords}">
  <meta name="robots" content="${seo.metaTags.robots}">
  <meta name="author" content="${seo.metaTags.author}">

  <!-- Canonical -->
  <link rel="canonical" href="${seo.canonicalUrl}">

  <!-- Open Graph -->
  <meta property="og:type" content="${seo.openGraph['og:type']}">
  <meta property="og:url" content="${seo.openGraph['og:url']}">
  <meta property="og:title" content="${seo.openGraph['og:title']}">
  <meta property="og:description" content="${seo.openGraph['og:description']}">
  <meta property="og:site_name" content="${seo.openGraph['og:site_name']}">

  <!-- Twitter -->
  <meta property="twitter:card" content="${seo.twitterMeta['twitter:card']}">
  <meta property="twitter:title" content="${seo.twitterMeta['twitter:title']}">
  <meta property="twitter:description" content="${seo.twitterMeta['twitter:description']}">

  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">
${seo.schemaMarkup}
  </script>

  <!-- Styles -->
  <style>
    :root {
      --primary-color: ${options.brandColor};
      --text-color: #1a1a1a;
      --bg-color: #ffffff;
      --muted-color: #6b7280;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: var(--text-color);
      background: var(--bg-color);
    }

    .container { max-width: 800px; margin: 0 auto; padding: 2rem; }

    header { padding: 1rem 0; border-bottom: 1px solid #eee; margin-bottom: 2rem; }
    header img { height: 40px; }

    h1 { font-size: 2.5rem; margin-bottom: 1rem; line-height: 1.2; }
    h2 { font-size: 1.75rem; margin: 2rem 0 1rem; color: var(--primary-color); }
    h3 { font-size: 1.25rem; margin: 1.5rem 0 0.75rem; }

    p { margin-bottom: 1rem; }

    ul, ol { margin: 1rem 0; padding-left: 1.5rem; }
    li { margin-bottom: 0.5rem; }

    a { color: var(--primary-color); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .faq-section { margin: 3rem 0; }
    .faq-section details {
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .faq-section summary {
      font-weight: 600;
      cursor: pointer;
      list-style: none;
    }
    .faq-section summary::-webkit-details-marker { display: none; }
    .faq-section details p { margin-top: 1rem; color: var(--muted-color); }

    .cta-section {
      background: var(--primary-color);
      color: white;
      padding: 3rem;
      border-radius: 12px;
      text-align: center;
      margin: 3rem 0;
    }
    .cta-section h2 { color: white; }
    .cta-button {
      display: inline-block;
      background: white;
      color: var(--primary-color);
      padding: 1rem 2rem;
      border-radius: 8px;
      font-weight: 600;
      margin-top: 1rem;
    }

    .related-content { margin: 2rem 0; padding: 1.5rem; background: #f9fafb; border-radius: 8px; }
    .related-content h3 { margin-top: 0; }

    footer {
      margin-top: 4rem;
      padding: 2rem 0;
      border-top: 1px solid #eee;
      text-align: center;
      color: var(--muted-color);
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      ${options.logo ? `<img src="${options.logo}" alt="${options.companyName}">` : `<strong>${options.companyName}</strong>`}
    </header>

    <main>
      <article>
        <h1>${content.title}</h1>
        ${bodyContent}
        ${faqHTML}
      </article>

      <section class="cta-section">
        <h2>Ready to Get Started?</h2>
        <p>Take the next step and see how we can help you succeed.</p>
        <a href="/signup" class="cta-button">Get Started Free</a>
      </section>

      ${internalLinksHTML}
    </main>

    <footer>
      <p>&copy; ${new Date().getFullYear()} ${options.companyName}. All rights reserved.</p>
    </footer>
  </div>

  ${options.includeAnalytics ? `
  <!-- Analytics -->
  <script>
    // Track page view
    if (typeof window !== 'undefined') {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'pageview',
          page: window.location.pathname,
          referrer: document.referrer
        })
      }).catch(() => {});
    }
  </script>
  ` : ''}
</body>
</html>`;
  }

  /**
   * Simple markdown to HTML converter
   */
  private markdownToHTML(markdown: string): string {
    return markdown
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Bold
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>')
      // Unordered lists
      .replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>')
      // Wrap consecutive list items
      .replace(/(<li>.*<\/li>\n?)+/gim, '<ul>$&</ul>')
      // Paragraphs
      .replace(/^(?!<[hulo])(.*$)/gim, '<p>$1</p>')
      // Clean empty paragraphs
      .replace(/<p><\/p>/g, '')
      // Line breaks
      .replace(/\n/gim, '');
  }

  /**
   * Generate sitemap for company
   */
  async generateSitemap(
    companyId: string,
    baseUrl: string
  ): Promise<string> {
    console.log(`[LandingPageSEO] Generating sitemap for ${companyId}`);

    // Get all published pages
    const pages = await db.query.landingPages.findMany({
      where: and(
        eq(landingPages.companyId, companyId),
        eq(landingPages.status, 'published')
      ),
      orderBy: desc(landingPages.updatedAt),
    });

    const entries: SitemapEntry[] = [
      // Homepage
      {
        loc: baseUrl,
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'daily',
        priority: 1.0,
      },
      // Landing pages
      ...pages.map(page => ({
        loc: `${baseUrl}/${page.slug}`,
        lastmod: (page.updatedAt || new Date()).toISOString().split('T')[0],
        changefreq: 'weekly' as const,
        priority: 0.8,
      })),
    ];

    // Generate XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(entry => `  <url>
    <loc>${entry.loc}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    return xml;
  }

  /**
   * Generate robots.txt
   */
  generateRobotsTxt(baseUrl: string): string {
    return `User-agent: *
Allow: /

# Sitemap
Sitemap: ${baseUrl}/sitemap.xml

# Crawl-delay
Crawl-delay: 1

# Disallow admin paths
Disallow: /admin/
Disallow: /api/
Disallow: /dashboard/
`;
  }

  /**
   * Check SEO health of a page
   */
  async checkSEOHealth(content: SEOContentOutput): Promise<{
    score: number;
    issues: Array<{ type: 'error' | 'warning' | 'info'; message: string }>;
    suggestions: string[];
  }> {
    const issues: Array<{ type: 'error' | 'warning' | 'info'; message: string }> = [];
    const suggestions: string[] = [];
    let score = 100;

    // Title checks
    if (content.title.length < 30) {
      issues.push({ type: 'warning', message: 'Title is too short (< 30 chars)' });
      score -= 10;
    } else if (content.title.length > 60) {
      issues.push({ type: 'warning', message: 'Title is too long (> 60 chars)' });
      score -= 5;
    }

    if (!content.title.toLowerCase().includes(content.keyword.toLowerCase())) {
      issues.push({ type: 'error', message: 'Primary keyword not in title' });
      score -= 15;
    }

    // Meta description checks
    if (content.metaDescription.length < 120) {
      issues.push({ type: 'warning', message: 'Meta description too short (< 120 chars)' });
      score -= 10;
    } else if (content.metaDescription.length > 160) {
      issues.push({ type: 'warning', message: 'Meta description too long (> 160 chars)' });
      score -= 5;
    }

    // Content checks
    if (content.wordCount < 1000) {
      issues.push({ type: 'warning', message: `Content may be thin (${content.wordCount} words)` });
      score -= 10;
      suggestions.push('Consider adding more comprehensive content (1000+ words)');
    }

    // Heading checks
    const h1Count = content.headings.filter(h => h.startsWith('H1')).length;
    if (h1Count !== 1) {
      issues.push({ type: 'error', message: `Should have exactly 1 H1, found ${h1Count}` });
      score -= 15;
    }

    const h2Count = content.headings.filter(h => h.startsWith('H2')).length;
    if (h2Count < 3) {
      issues.push({ type: 'warning', message: 'Consider adding more H2 sections' });
      score -= 5;
      suggestions.push('Add more H2 sections to improve content structure');
    }

    // FAQ checks
    if (content.faq.length === 0) {
      issues.push({ type: 'info', message: 'No FAQ section - consider adding one for rich snippets' });
      suggestions.push('Add FAQ section to target featured snippets');
    }

    // Internal links checks
    if (content.internalLinks.length < 2) {
      issues.push({ type: 'warning', message: 'Few internal links' });
      score -= 5;
      suggestions.push('Add 2-3 internal links to related content');
    }

    return {
      score: Math.max(0, score),
      issues,
      suggestions,
    };
  }

  /**
   * Helper: Generate slug from text
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
}

export const landingPageSEOEngine = new LandingPageSEOEngine();
