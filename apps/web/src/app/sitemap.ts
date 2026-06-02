import type { MetadataRoute } from 'next';

/**
 * Auto-generated sitemap.xml for https://1person.ai
 *
 * Next.js App Router convention: this file becomes /sitemap.xml at build time.
 * Lists public-facing routes only. Dashboard/admin/private pages are
 * excluded (and also blocked in robots.ts).
 */
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://1person.ai';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
      alternates: {
        languages: {
          en: `${BASE_URL}/`,
          vi: `${BASE_URL}/?lang=vi`,
          ja: `${BASE_URL}/?lang=ja`,
          ko: `${BASE_URL}/?lang=ko`,
        },
      },
    },
    {
      url: `${BASE_URL}/#features`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/#compare`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/#security`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/register`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
}
