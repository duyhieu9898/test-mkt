import type { MetadataRoute } from 'next';

/**
 * Auto-generated robots.txt for https://1person.ai
 *
 * Next.js App Router convention: this file becomes /robots.txt at build time.
 * Update BASE_URL when deploying to a different domain.
 */
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://1person.ai';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog', '/blog/*', '/proof/*'],
        disallow: [
          '/api/',
          '/admin',
          '/admin/*',
          '/*/dashboard',
          '/*/campaigns',
          '/*/campaigns/*',
          '/*/brain',
          '/*/brain/*',
          '/*/settings',
          '/*/settings/*',
          '/*/knowledge',
          '/*/chatbot',
          '/*/ai-brain',
          '/welcome',
          '/onboarding',
          '/companies',
          '/login',
          '/register',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
