/**
 * Page Renderer Service
 *
 * Converts landing page data to static HTML/CSS
 * for deployment to CDN/hosting providers
 */

import { db } from '../lib/db';
import { eq } from 'drizzle-orm';
import { landingPages, landingPageSections } from '@1person/core/db';

// =============================================================================
// TYPES
// =============================================================================

export interface RenderOptions {
  minify?: boolean;
  includeAnalytics?: boolean;
  baseUrl?: string;
}

export interface RenderedPage {
  html: string;
  css: string;
  metadata: {
    title: string;
    description: string;
    keywords: string[];
    ogImage?: string;
  };
}

export interface StaticBundle {
  html: string;
  assets: Array<{
    filename: string;
    content: string;
    type: 'css' | 'js' | 'json';
  }>;
}

// =============================================================================
// SECTION RENDERERS
// =============================================================================

function renderHeroSection(content: Record<string, unknown>, primaryColor: string): string {
  const headline = content.headline || 'Welcome';
  const subheadline = content.subheadline || '';
  const ctaText = content.ctaText || 'Get Started';
  const ctaSecondaryText = content.ctaSecondaryText || '';
  const alignment = content.alignment || 'center';

  const alignClass = alignment === 'center' ? 'text-center items-center' :
                     alignment === 'right' ? 'text-right items-end' : 'text-left items-start';
  const justifyClass = alignment === 'center' ? 'justify-center' :
                       alignment === 'right' ? 'justify-end' : 'justify-start';

  // Support hero background image with overlay
  const imageUrl = content.imageUrl || content.heroImage;
  const bgStyle = imageUrl
    ? `background-image: linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.6)), url('${escapeHtml(String(imageUrl))}'); background-size: cover; background-position: center;`
    : `background: linear-gradient(135deg, ${primaryColor}15, ${primaryColor}05);`;
  const textColorClass = imageUrl ? 'text-white' : 'text-gray-900';
  const subTextColorClass = imageUrl ? 'text-white/80' : 'text-gray-600';

  return `
    <section class="hero-section py-20 px-4" style="${bgStyle}">
      <div class="container mx-auto max-w-4xl flex flex-col ${alignClass}">
        <h1 class="text-4xl md:text-5xl font-bold mb-6 ${textColorClass}">${escapeHtml(String(headline))}</h1>
        ${subheadline ? `<p class="text-xl ${subTextColorClass} mb-8 max-w-2xl ${alignment === 'center' ? 'mx-auto' : ''}">${escapeHtml(String(subheadline))}</p>` : ''}
        <div class="flex flex-col sm:flex-row gap-4 ${justifyClass}">
          <a href="#signup" class="btn-primary px-8 py-3 rounded-lg text-white font-medium" style="background-color: ${primaryColor};">${escapeHtml(String(ctaText))}</a>
          ${ctaSecondaryText ? `<a href="#features" class="btn-secondary px-8 py-3 rounded-lg border border-gray-300 font-medium">${escapeHtml(String(ctaSecondaryText))}</a>` : ''}
        </div>
      </div>
    </section>
  `;
}

function renderProblemSection(content: Record<string, unknown>, primaryColor: string): string {
  const title = content.title || 'The Problem';
  const description = content.description || '';
  const rawPainPoints = (content.painPoints || []) as Array<string | { title: string; description: string }>;

  return `
    <section class="problem-section py-16 px-4 bg-gray-50">
      <div class="container mx-auto max-w-4xl">
        <h2 class="text-3xl font-bold text-center mb-4 text-gray-900">${escapeHtml(String(title))}</h2>
        ${description ? `<p class="text-gray-600 text-center mb-12 max-w-2xl mx-auto">${escapeHtml(String(description))}</p>` : ''}
        <div class="grid md:grid-cols-2 gap-6">
          ${rawPainPoints.map(point => {
            const isString = typeof point === 'string';
            const pointTitle = isString ? '' : point.title;
            const pointDesc = isString ? point : point.description;
            return `
            <div class="p-6 bg-white rounded-lg shadow-sm border">
              ${pointTitle ? `<h3 class="font-semibold text-lg mb-2 text-gray-900">${escapeHtml(pointTitle)}</h3>` : ''}
              <p class="text-gray-600">${escapeHtml(String(pointDesc))}</p>
            </div>
          `;
          }).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderSolutionSection(content: Record<string, unknown>, primaryColor: string): string {
  const title = content.title || 'Our Solution';
  const description = content.description || '';
  const rawBenefits = (content.benefits || []) as Array<string | { title: string; description: string }>;

  return `
    <section class="solution-section py-16 px-4">
      <div class="container mx-auto max-w-4xl">
        <h2 class="text-3xl font-bold text-center mb-4 text-gray-900">${escapeHtml(String(title))}</h2>
        ${description ? `<p class="text-gray-600 text-center mb-12 max-w-2xl mx-auto">${escapeHtml(String(description))}</p>` : ''}
        <div class="grid md:grid-cols-2 gap-6">
          ${rawBenefits.map(benefit => {
            const isString = typeof benefit === 'string';
            const benefitDesc = isString ? benefit : benefit.description;
            return `
            <div class="flex gap-4">
              <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="background-color: ${primaryColor}20; color: ${primaryColor};">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <div>
                <p class="text-gray-600">${escapeHtml(String(benefitDesc))}</p>
              </div>
            </div>
          `;
          }).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderFeaturesSection(content: Record<string, unknown>, primaryColor: string): string {
  const title = content.title || 'Features';
  const features = (content.features || []) as Array<{ title: string; description: string; icon?: string; imageUrl?: string }>;

  return `
    <section class="features-section py-16 px-4 bg-gray-50">
      <div class="container mx-auto max-w-5xl">
        <h2 class="text-3xl font-bold text-center mb-12 text-gray-900">${escapeHtml(String(title))}</h2>
        <div class="grid md:grid-cols-3 gap-8">
          ${features.map(feature => `
            <div class="text-center">
              ${feature.imageUrl
                ? `<img src="${escapeHtml(feature.imageUrl)}" alt="${escapeHtml(feature.title)}" class="w-14 h-14 rounded-xl mx-auto mb-4 object-cover" />`
                : `<div class="w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center" style="background-color: ${primaryColor}15; color: ${primaryColor};">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
              </div>`}
              <h3 class="font-semibold text-lg mb-2 text-gray-900">${escapeHtml(feature.title)}</h3>
              <p class="text-gray-600 text-sm">${escapeHtml(feature.description)}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderTestimonialsSection(content: Record<string, unknown>, primaryColor: string): string {
  const title = content.title || 'What Our Customers Say';
  const testimonials = (content.testimonials || []) as Array<{ name: string; role?: string; company?: string; quote: string }>;

  return `
    <section class="testimonials-section py-16 px-4">
      <div class="container mx-auto max-w-5xl">
        <h2 class="text-3xl font-bold text-center mb-12 text-gray-900">${escapeHtml(String(title))}</h2>
        <div class="grid md:grid-cols-3 gap-6">
          ${testimonials.map(t => `
            <div class="p-6 bg-gray-50 rounded-lg">
              <p class="text-gray-600 italic mb-4">"${escapeHtml(t.quote)}"</p>
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold" style="background-color: ${primaryColor};">
                  ${escapeHtml(t.name.charAt(0))}
                </div>
                <div>
                  <p class="font-semibold text-gray-900">${escapeHtml(t.name)}</p>
                  <p class="text-sm text-gray-500">${escapeHtml(t.role || '')}${t.company ? `, ${escapeHtml(t.company)}` : ''}</p>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderPricingSection(content: Record<string, unknown>, primaryColor: string): string {
  const title = content.title || 'Pricing';
  const plans = (content.plans || []) as Array<{ name: string; price: string; features: string[]; ctaText?: string; featured?: boolean }>;

  return `
    <section class="pricing-section py-16 px-4 bg-gray-50">
      <div class="container mx-auto max-w-5xl">
        <h2 class="text-3xl font-bold text-center mb-12 text-gray-900">${escapeHtml(String(title))}</h2>
        <div class="grid md:grid-cols-3 gap-6">
          ${plans.map(plan => `
            <div class="p-6 rounded-lg border ${plan.featured ? 'border-2 bg-white shadow-lg' : 'bg-white'}" ${plan.featured ? `style="border-color: ${primaryColor};"` : ''}>
              <h3 class="text-xl font-bold mt-4 text-gray-900">${escapeHtml(plan.name)}</h3>
              <p class="text-3xl font-bold my-4" style="color: ${primaryColor};">${escapeHtml(plan.price)}</p>
              <ul class="space-y-2 mb-6">
                ${(plan.features || []).map(f => `
                  <li class="flex items-center gap-2 text-sm text-gray-600">
                    <svg class="w-4 h-4" style="color: ${primaryColor};" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    ${escapeHtml(f)}
                  </li>
                `).join('')}
              </ul>
              <a href="#signup" class="block w-full text-center py-2 rounded-lg font-medium ${plan.featured ? 'text-white' : 'border border-gray-300'}" ${plan.featured ? `style="background-color: ${primaryColor};"` : ''}>
                ${escapeHtml(plan.ctaText || 'Get Started')}
              </a>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderFAQSection(content: Record<string, unknown>, primaryColor: string): string {
  const title = content.title || 'Frequently Asked Questions';
  const questions = (content.questions || []) as Array<{ question: string; answer: string }>;

  return `
    <section class="faq-section py-16 px-4">
      <div class="container mx-auto max-w-3xl">
        <h2 class="text-3xl font-bold text-center mb-12 text-gray-900">${escapeHtml(String(title))}</h2>
        <div class="space-y-4">
          ${questions.map((faq, i) => `
            <details class="border rounded-lg" ${i === 0 ? 'open' : ''}>
              <summary class="p-4 cursor-pointer font-semibold text-gray-900 hover:bg-gray-50">${escapeHtml(faq.question)}</summary>
              <div class="px-4 pb-4">
                <p class="text-gray-600">${escapeHtml(faq.answer)}</p>
              </div>
            </details>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderCTASection(content: Record<string, unknown>, primaryColor: string): string {
  const title = content.title || 'Ready to Get Started?';
  const description = content.description || '';
  const ctaText = content.ctaText || 'Get Started Today';

  return `
    <section class="cta-section py-20 px-4" style="background-color: ${primaryColor};">
      <div class="container mx-auto max-w-3xl text-center">
        <h2 class="text-3xl font-bold mb-4 text-white">${escapeHtml(String(title))}</h2>
        ${description ? `<p class="text-white/80 mb-8">${escapeHtml(String(description))}</p>` : ''}
        <a href="#signup" class="inline-block px-8 py-3 bg-white rounded-lg font-medium hover:bg-gray-100" style="color: ${primaryColor};">
          ${escapeHtml(String(ctaText))}
        </a>
      </div>
    </section>
  `;
}

function renderFooterSection(content: Record<string, unknown>, primaryColor: string): string {
  const companyName = content.companyName || 'Company';
  const year = new Date().getFullYear();

  return `
    <footer class="py-12 px-4 bg-gray-900 text-white">
      <div class="container mx-auto max-w-6xl">
        <div class="text-center">
          <h3 class="text-xl font-bold mb-4">${escapeHtml(String(companyName))}</h3>
          <p class="text-gray-400 text-sm">&copy; ${year} ${escapeHtml(String(companyName))}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  `;
}

// =============================================================================
// HELPERS
// =============================================================================

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function renderSection(section: { type: string; content: Record<string, unknown> }, primaryColor: string): string {
  switch (section.type) {
    case 'hero':
      return renderHeroSection(section.content, primaryColor);
    case 'problem':
      return renderProblemSection(section.content, primaryColor);
    case 'solution':
      return renderSolutionSection(section.content, primaryColor);
    case 'features':
      return renderFeaturesSection(section.content, primaryColor);
    case 'testimonials':
      return renderTestimonialsSection(section.content, primaryColor);
    case 'pricing':
      return renderPricingSection(section.content, primaryColor);
    case 'faq':
      return renderFAQSection(section.content, primaryColor);
    case 'cta':
      return renderCTASection(section.content, primaryColor);
    case 'footer':
      return renderFooterSection(section.content, primaryColor);
    default:
      return '';
  }
}

// =============================================================================
// SERVICE
// =============================================================================

export class PageRendererService {
  /**
   * Render a landing page to HTML
   */
  async renderToHtml(pageId: string, options: RenderOptions = {}): Promise<RenderedPage> {
    const page = await db.query.landingPages.findFirst({
      where: eq(landingPages.id, pageId),
      with: { sections: true },
    });

    if (!page) {
      throw new Error('Page not found');
    }

    const sortedSections = (page.sections || []).sort((a, b) => a.order - b.order);
    const primaryColor = page.primaryColor || '#3b82f6';

    const sectionsHtml = sortedSections
      .filter(s => s.isVisible !== 0)
      .map(s => renderSection({ type: s.type, content: s.content as Record<string, unknown> }, primaryColor))
      .join('\n');

    const seo = page.seo || {};
    const title = (seo as any).title || page.name;
    const description = (seo as any).description || '';
    const keywords = (seo as any).keywords || [];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${keywords.length > 0 ? `<meta name="keywords" content="${escapeHtml(keywords.join(', '))}">` : ''}
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta name="twitter:card" content="summary_large_image">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  ${sectionsHtml}
</body>
</html>`;

    return {
      html: options.minify ? html.replace(/\s+/g, ' ').trim() : html,
      css: '',
      metadata: {
        title,
        description,
        keywords,
      },
    };
  }

  /**
   * Generate a complete static bundle
   */
  async generateStaticBundle(pageId: string): Promise<StaticBundle> {
    const rendered = await this.renderToHtml(pageId, { minify: false });

    return {
      html: rendered.html,
      assets: [],
    };
  }
}

export const pageRendererService = new PageRendererService();
