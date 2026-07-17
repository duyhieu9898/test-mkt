/**
 * Page Renderer Service
 *
 * Converts landing page data to static HTML/CSS
 * for deployment to CDN/hosting providers
 */

import { db } from '../lib/db';
import { and, eq } from 'drizzle-orm';
import { landingPages, landingPageVersions } from '@1person/core/db';
import { normalizeLandingPageLink } from '@1person/workflow/landing-pages/blocks';
import { getWebsiteWidgetInstall } from './website-widget';

// =============================================================================
// TYPES
// =============================================================================

export interface RenderOptions {
  minify?: boolean;
  includeAnalytics?: boolean;
  baseUrl?: string;
  includeWebsiteWidget?: boolean;
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

const WORDPRESS_LANDING_CSS = `
.oneperson-landing,.oneperson-landing *{box-sizing:border-box}
.oneperson-landing{margin:0;font-family:system-ui,-apple-system,sans-serif;color:#111827}
.oneperson-landing section,.oneperson-landing footer{width:100%}
.oneperson-landing .container{width:100%;margin-left:auto;margin-right:auto}
.oneperson-landing .mx-auto{margin-left:auto;margin-right:auto}
.oneperson-landing .max-w-2xl{max-width:42rem}.oneperson-landing .max-w-3xl{max-width:48rem}
.oneperson-landing .max-w-4xl{max-width:56rem}.oneperson-landing .max-w-5xl{max-width:64rem}
.oneperson-landing .max-w-6xl{max-width:72rem}
.oneperson-landing .py-12{padding-top:3rem;padding-bottom:3rem}
.oneperson-landing .py-16{padding-top:4rem;padding-bottom:4rem}
.oneperson-landing .py-20{padding-top:5rem;padding-bottom:5rem}
.oneperson-landing .px-4{padding-left:1rem;padding-right:1rem}
.oneperson-landing .p-4{padding:1rem}.oneperson-landing .p-6{padding:1.5rem}
.oneperson-landing .px-8{padding-left:2rem;padding-right:2rem}
.oneperson-landing .py-2{padding-top:.5rem;padding-bottom:.5rem}
.oneperson-landing .py-3{padding-top:.75rem;padding-bottom:.75rem}
.oneperson-landing .pb-4{padding-bottom:1rem}
.oneperson-landing .mt-4{margin-top:1rem}.oneperson-landing .my-4{margin-top:1rem;margin-bottom:1rem}
.oneperson-landing .mb-2{margin-bottom:.5rem}.oneperson-landing .mb-4{margin-bottom:1rem}
.oneperson-landing .mb-6{margin-bottom:1.5rem}.oneperson-landing .mb-8{margin-bottom:2rem}
.oneperson-landing .mb-12{margin-bottom:3rem}
.oneperson-landing .flex{display:flex}.oneperson-landing .grid{display:grid}
.oneperson-landing .flex-col{flex-direction:column}.oneperson-landing .items-center{align-items:center}
.oneperson-landing .items-end{align-items:flex-end}.oneperson-landing .justify-center{justify-content:center}
.oneperson-landing .justify-end{justify-content:flex-end}.oneperson-landing .justify-start{justify-content:flex-start}
.oneperson-landing .gap-2{gap:.5rem}.oneperson-landing .gap-3{gap:.75rem}
.oneperson-landing .gap-4{gap:1rem}.oneperson-landing .gap-6{gap:1.5rem}.oneperson-landing .gap-8{gap:2rem}
.oneperson-landing .space-y-2>*+*{margin-top:.5rem}.oneperson-landing .space-y-4>*+*{margin-top:1rem}
.oneperson-landing .shrink-0{flex-shrink:0}.oneperson-landing .block{display:block}
.oneperson-landing .inline-block{display:inline-block}.oneperson-landing .w-full{width:100%}
.oneperson-landing .w-4{width:1rem}.oneperson-landing .h-4{height:1rem}
.oneperson-landing .w-5{width:1.25rem}.oneperson-landing .h-5{height:1.25rem}
.oneperson-landing .w-6{width:1.5rem}.oneperson-landing .h-6{height:1.5rem}
.oneperson-landing .w-10{width:2.5rem}.oneperson-landing .h-10{height:2.5rem}
.oneperson-landing .w-14{width:3.5rem}.oneperson-landing .h-14{height:3.5rem}
.oneperson-landing .rounded-full{border-radius:9999px}.oneperson-landing .rounded-lg{border-radius:.5rem}
.oneperson-landing .rounded-xl{border-radius:.75rem}.oneperson-landing .border{border:1px solid #d1d5db}
.oneperson-landing .border-2{border-width:2px}.oneperson-landing .shadow-sm{box-shadow:0 1px 2px #0000000d}
.oneperson-landing .shadow-lg{box-shadow:0 10px 15px -3px #0000001a}
.oneperson-landing .bg-white{background:#fff}.oneperson-landing .bg-gray-50{background:#f9fafb}
.oneperson-landing .bg-gray-900{background:#111827}.oneperson-landing .text-white{color:#fff}
.oneperson-landing .text-white\\/80{color:#ffffffcc}.oneperson-landing .text-gray-900{color:#111827}
.oneperson-landing .text-gray-600{color:#4b5563}.oneperson-landing .text-gray-500{color:#6b7280}
.oneperson-landing .text-gray-400{color:#9ca3af}.oneperson-landing .text-left{text-align:left}
.oneperson-landing .text-center{text-align:center}.oneperson-landing .text-right{text-align:right}
.oneperson-landing .text-sm{font-size:.875rem}.oneperson-landing .text-lg{font-size:1.125rem}
.oneperson-landing .text-xl{font-size:1.25rem}.oneperson-landing .text-3xl{font-size:1.875rem}
.oneperson-landing .text-4xl{font-size:2.25rem}.oneperson-landing .font-medium{font-weight:500}
.oneperson-landing .font-semibold{font-weight:600}.oneperson-landing .font-bold{font-weight:700}
.oneperson-landing .italic{font-style:italic}.oneperson-landing .cursor-pointer{cursor:pointer}
.oneperson-landing .object-cover{object-fit:cover}
.oneperson-landing a{text-decoration:none}.oneperson-landing summary{list-style-position:inside}
@media(min-width:640px){.oneperson-landing .sm\\:flex-row{flex-direction:row}}
@media(min-width:768px){
  .oneperson-landing .md\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
  .oneperson-landing .md\\:grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
  .oneperson-landing .md\\:text-5xl{font-size:3rem}
}`.trim();

// WordPress themes commonly render the REST page title above post content.
// Landing pages already contain their own hero headline, so showing both
// creates a duplicate lead heading. This style is embedded only in content
// published by 1Person and does not remove the title from wp-admin or SEO.
const WORDPRESS_HIDE_PAGE_TITLE_CSS = `
.entry-header .entry-title,
.wp-block-post-title,
main > .page-header .page-title{display:none!important}
`.trim();

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
  const imageUrl = content.backgroundImage || content.imageUrl || content.heroImage;
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
          <a ${renderLinkAttributes(content.ctaUrl, content.ctaOpenInNewTab, '#signup')} class="btn-primary px-8 py-3 rounded-lg text-white font-medium" style="background-color: ${primaryColor};">${escapeHtml(String(ctaText))}</a>
          ${ctaSecondaryText ? `<a ${renderLinkAttributes(content.ctaSecondaryUrl, content.ctaSecondaryOpenInNewTab, '#features')} class="btn-secondary px-8 py-3 rounded-lg border border-gray-300 font-medium">${escapeHtml(String(ctaSecondaryText))}</a>` : ''}
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
  const features = (content.features || []) as Array<{
    title: string;
    description: string;
    icon?: string;
    image?: string;
    imageUrl?: string;
    imageAlt?: string;
  }>;

  return `
    <section class="features-section py-16 px-4 bg-gray-50">
      <div class="container mx-auto max-w-5xl">
        <h2 class="text-3xl font-bold text-center mb-12 text-gray-900">${escapeHtml(String(title))}</h2>
        <div class="grid md:grid-cols-3 gap-8">
          ${features.map(feature => `
            <div class="text-center">
              ${feature.image || feature.imageUrl
                ? `<img src="${escapeHtml(feature.image || feature.imageUrl || '')}" alt="${escapeHtml(feature.imageAlt || feature.title)}" style="width:100%;height:6rem;" class="rounded-lg mx-auto mb-4 object-cover" />`
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
  const plans = (content.plans || []) as Array<{
    name: string;
    price: string;
    features: string[];
    ctaText?: string;
    ctaUrl?: string;
    ctaOpenInNewTab?: boolean;
    featured?: boolean;
  }>;

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
              <a ${renderLinkAttributes(plan.ctaUrl, plan.ctaOpenInNewTab, '#signup')} class="block w-full text-center py-2 rounded-lg font-medium ${plan.featured ? 'text-white' : 'border border-gray-300'}" ${plan.featured ? `style="background-color: ${primaryColor};"` : ''}>
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
  const ctaSecondaryText = content.ctaSecondaryText || '';

  return `
    <section class="cta-section py-20 px-4" style="background-color: ${primaryColor};">
      <div class="container mx-auto max-w-3xl text-center">
        <h2 class="text-3xl font-bold mb-4 text-white">${escapeHtml(String(title))}</h2>
        ${description ? `<p class="text-white/80 mb-8">${escapeHtml(String(description))}</p>` : ''}
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <a ${renderLinkAttributes(content.ctaUrl, content.ctaOpenInNewTab, '#signup')} class="inline-block px-8 py-3 bg-white rounded-lg font-medium hover:bg-gray-100" style="color: ${primaryColor};">
            ${escapeHtml(String(ctaText))}
          </a>
          ${ctaSecondaryText ? `<a ${renderLinkAttributes(content.ctaSecondaryUrl, content.ctaSecondaryOpenInNewTab, '#')} class="inline-block px-8 py-3 rounded-lg border text-white font-medium">${escapeHtml(String(ctaSecondaryText))}</a>` : ''}
        </div>
      </div>
    </section>
  `;
}

function renderImageSection(content: Record<string, unknown>): string {
  const url = String(content.url || '');
  const alt = String(content.alt || '');
  const caption = String(content.caption || '');
  const aspectRatio = content.aspectRatio || 'wide';
  const fit = content.fit === 'contain' ? 'contain' : 'cover';
  const aspectStyle = aspectRatio === 'square'
    ? 'aspect-ratio:1/1;max-width:42rem;'
    : aspectRatio === 'portrait'
      ? 'aspect-ratio:4/5;max-width:36rem;'
      : aspectRatio === 'auto'
        ? ''
        : 'aspect-ratio:16/9;';
  const image = url
    ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" style="width:100%;${aspectStyle}object-fit:${fit};border-radius:.5rem;margin-left:auto;margin-right:auto;" />`
    : '';
  const linkedImage = content.linkUrl
    ? `<a ${renderLinkAttributes(content.linkUrl, content.openInNewTab, '#')}>${image}</a>`
    : image;

  return `
    <section class="image-section py-12 px-4">
      <figure class="container mx-auto max-w-5xl">
        ${linkedImage}
        ${caption ? `<figcaption class="mt-4 text-center text-sm text-gray-500">${escapeHtml(caption)}</figcaption>` : ''}
      </figure>
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
  return text.replace(/[&<>"']/g, (m) => map[m]!);
}

function renderLinkAttributes(
  url: unknown,
  openInNewTab: unknown,
  fallback: string,
): string {
  const href = escapeHtml(normalizeLandingPageLink(String(url || ''), fallback));
  return `href="${href}"${
    openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : ''
  }`;
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
    case 'image':
      return renderImageSection(section.content);
    case 'footer':
      return renderFooterSection(section.content, primaryColor);
    default:
      return '';
  }
}

function buildRenderedPage(input: {
  pageName: string;
  sections: Array<{
    type: string;
    order: number;
    content: unknown;
    isVisible?: number | null;
  }>;
  primaryColor?: string | null;
  seo?: unknown;
  options?: RenderOptions;
  widgetHtml?: string;
}): RenderedPage {
  const primaryColor = input.primaryColor || '#3b82f6';
  const sectionsHtml = [...input.sections]
    .sort((a, b) => a.order - b.order)
    .filter((section) => section.isVisible !== 0)
    .map((section) => renderSection({
      type: section.type,
      content: section.content as Record<string, unknown>,
    }, primaryColor))
    .join('\n');

  const seo = (input.seo || {}) as Record<string, any>;
  const title = seo.title || input.pageName;
  const description = seo.description || '';
  const keywords = Array.isArray(seo.keywords) ? seo.keywords : [];
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
  ${input.widgetHtml || ''}
</body>
</html>`;

  return {
    html: input.options?.minify ? html.replace(/\s+/g, ' ').trim() : html,
    css: '',
    metadata: { title, description, keywords },
  };
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

    const widget = options.includeWebsiteWidget
      ? await getWebsiteWidgetInstall(page.companyId, page.id)
      : null;

    return buildRenderedPage({
      pageName: page.name,
      sections: page.sections || [],
      primaryColor: page.primaryColor,
      seo: page.seo,
      options,
      widgetHtml: widget?.scriptHtml,
    });
  }

  async renderVersionToHtml(pageId: string, versionId: string): Promise<RenderedPage> {
    const [page, version] = await Promise.all([
      db.query.landingPages.findFirst({ where: eq(landingPages.id, pageId) }),
      db.query.landingPageVersions.findFirst({
        where: and(
          eq(landingPageVersions.id, versionId),
          eq(landingPageVersions.pageId, pageId),
        ),
      }),
    ]);
    if (!page || !version) throw new Error('Landing page version not found');

    const settings = (version.pageSettingsSnapshot || {}) as Record<string, any>;
    return buildRenderedPage({
      pageName: page.name,
      sections: (version.sectionsSnapshot || []).map((section) => ({
        ...section,
        isVisible: 1,
      })),
      primaryColor: settings.primaryColor || page.primaryColor,
      seo: settings.seo || page.seo,
    });
  }

  /**
   * Render only the page body for WordPress. WordPress expects post content,
   * not a nested HTML document, and may strip external script tags.
   */
  async renderToWordPressHtml(pageId: string): Promise<string> {
    const rendered = await this.renderToHtml(pageId, { includeWebsiteWidget: true });
    const bodyStart = rendered.html.indexOf('<body>');
    const bodyEnd = rendered.html.lastIndexOf('</body>');
    const body = bodyStart >= 0 && bodyEnd > bodyStart
      ? rendered.html.slice(bodyStart + '<body>'.length, bodyEnd).trim()
      : rendered.html;

    return `<!-- wp:html -->
<style>${WORDPRESS_HIDE_PAGE_TITLE_CSS}
${WORDPRESS_LANDING_CSS}</style>
<div class="oneperson-landing">${body}</div>
<!-- /wp:html -->`;
  }

  /**
   * Generate a complete static bundle
   */
  async generateStaticBundle(pageId: string): Promise<StaticBundle> {
    const rendered = await this.renderToHtml(pageId, {
      minify: false,
      includeWebsiteWidget: true,
    });

    return {
      html: rendered.html,
      assets: [],
    };
  }
}

export const pageRendererService = new PageRendererService();
