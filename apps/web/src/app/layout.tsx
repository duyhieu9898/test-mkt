import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

// SEO metadata — rewritten post-Managed-Agents launch (2026-04).
// Positioning: Business Brain + Data Sovereignty + Vertical Marketing +
// Non-Tech UX. Every keyword and phrase leads with a differentiator that
// generic AI (Claude, ChatGPT, Managed Agents) deliberately does not ship.
// See docs/architecture/08-post-managed-agents-pmf-plan.md for the strategy.
export const metadata: Metadata = {
  metadataBase: new URL('https://1person.ai'),

  // ~60 chars — Google truncates ~55-60 chars on desktop
  title: {
    default: '1Person — AI Marketing that Knows Your Brand. Data Stays Yours.',
    template: '%s | 1Person',
  },

  // ~155 chars — Google's meta description sweet spot
  description:
    'AI marketing for non-technical founders. Business Brain remembers your brand, personas, products. Tamper-evident audit. Cloud, Private, or On-Premise.',

  applicationName: '1Person',
  authors: [{ name: '1Person', url: 'https://1person.ai' }],
  creator: '1Person',
  publisher: '1Person',
  category: 'Marketing Technology',
  classification: 'SaaS, AI Marketing, Business Automation',

  keywords: [
    // ─── Intent — what a non-tech founder actually types into Google ───
    // English
    'AI marketing for small business',
    'AI that knows my brand',
    'AI marketing with memory',
    'AI marketing automation',
    'AI marketing platform',
    'AI campaign generator',
    'AI banner generator',
    'AI ad copy generator',
    'AI social media marketing',
    'AI content marketing tool',
    'marketing automation AI',
    'one-click AI campaign',
    '1-click marketing AI',

    // ─── Differentiation — comparison intent ───
    'ChatGPT alternative for marketing',
    'Claude alternative with memory',
    'alternative to Claude Managed Agents',
    'AI that remembers my business',
    'business context AI',
    'brand voice AI',
    'persona-aware AI',
    'AI with business memory',
    'editable AI memory',

    // ─── Trust & data sovereignty (primary moat) ───
    'private AI for business',
    'data sovereign AI',
    'on-premise AI marketing',
    'self-hosted AI marketing',
    'GDPR compliant AI marketing',
    'tamper-evident AI audit',
    'auditable AI',
    'verifiable AI outputs',
    'AI data privacy',
    'bring your own API key AI',
    'BYOK AI marketing',
    'AI without vendor lock-in',

    // ─── Vertical — marketing execution ───
    'Meta Ads AI',
    'Facebook Ads AI generator',
    'Google Ads AI',
    'LinkedIn Ads AI',
    'TikTok Ads AI',
    'landing page AI',
    'SEO content AI',
    'autonomous marketing campaigns',
    'multi-platform ad publishing',
    'marketing feedback loop AI',

    // ─── Non-tech audience ───
    'AI marketing no code',
    'marketing AI for founders',
    'solopreneur AI marketing',
    'small business marketing AI',
    'AI marketing without developers',

    // ─── Vietnamese (target market) ───
    'AI marketing tiếng Việt',
    'AI marketing cho doanh nghiệp nhỏ',
    'AI hiểu thương hiệu',
    'AI có bộ nhớ doanh nghiệp',
    'công cụ AI marketing',
    'AI tạo chiến dịch quảng cáo',
    'AI viết content marketing',
    'AI tạo banner quảng cáo',
    'AI chạy ads Facebook',
    'AI marketing tự động',
    'AI marketing không cần biết code',
    'AI bảo mật dữ liệu',
    'AI on-premise Việt Nam',
    'AI tự host doanh nghiệp',
    'lưu trữ dữ liệu AI riêng tư',
    'AI marketing cho nhà sáng lập',
    'thay thế ChatGPT cho marketing',
    'AI nhớ brand voice',
    'AI quản lý campaign marketing',
    'AI tạo landing page',
    'AI SEO Việt Nam',

    // ─── Japanese ───
    'AIマーケティング',
    'ブランドを知るAI',
    'ビジネスメモリAI',
    'ノーコードAIマーケティング',
    '自社ホストAI',
    'オンプレミスAIマーケティング',
    'プライベートAIマーケティング',
    'データ主権AI',
    'AI広告生成',
    'AIキャンペーン自動化',
    '改ざん検出AI',
    'BYOK AI',
    'AIコンテンツマーケティング',
    '中小企業向けAIマーケティング',

    // ─── Korean ───
    'AI 마케팅',
    '브랜드를 아는 AI',
    '비즈니스 메모리 AI',
    '노코드 AI 마케팅',
    '자체 호스팅 AI',
    '온프레미스 AI 마케팅',
    '프라이빗 AI 마케팅',
    '데이터 주권 AI',
    'AI 광고 생성',
    'AI 캠페인 자동화',
    '변조 감지 AI',
    'BYOK AI',
    '중소기업 AI 마케팅',
  ].join(', '),

  openGraph: {
    type: 'website',
    siteName: '1Person',
    title: '1Person — AI Marketing that Knows Your Brand',
    description:
      "Generic AI doesn't know your business. 1Person builds a Business Brain of your brand, products, and customers — runs your marketing on infrastructure you can audit, verify, or self-host.",
    url: 'https://1person.ai',
    locale: 'en_US',
    alternateLocale: ['vi_VN', 'ja_JP', 'ko_KR'],
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '1Person — AI that knows your brand. Data that stays yours.',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: '1Person — AI Marketing that Knows Your Brand',
    description:
      'Business Brain + tamper-evident audit + on-premise option. Built for non-tech founders. Your data never leaves your control.',
    images: ['/og-image.png'],
    creator: '@1person_ai',
  },

  alternates: {
    canonical: 'https://1person.ai',
    languages: {
      'en-US': '/',
      'vi-VN': '/?lang=vi',
      'ja-JP': '/?lang=ja',
      'ko-KR': '/?lang=ko',
      'x-default': '/',
    },
  },

  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  verification: {
    // Add these when you set up Search Console / Bing:
    // google: 'your-google-site-verification-token',
    // other: { 'msvalidate.01': 'your-bing-verification-token' },
  },

  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
  },

  // Helps Google surface rich snippets for the comparison content
  other: {
    'format-detection': 'telephone=no',
  },
};

// JSON-LD structured data — helps Google render rich snippets for the
// comparison section (SoftwareApplication) and brand knowledge panel
// (Organization). Keep in sync with the metadata above.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://1person.ai/#software',
      name: '1Person',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Marketing Automation',
      operatingSystem: 'Web, Self-Hosted, On-Premise',
      description:
        'AI marketing platform for non-technical founders. Business Brain remembers your brand, products, and customers. Tamper-evident audit. Run on cloud, private cloud, or your own hardware.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free tier available',
      },
      featureList: [
        'Business Brain — editable brand voice, personas, products',
        'Tamper-evident audit chain',
        'Three deployment modes: Cloud, Private, On-Premise',
        'Public proof links for verifiable trust',
        'Bring your own API key (OpenAI, Anthropic, Gemini)',
        'One-click data export',
        'Live workflow visualization',
        '7 ad platform integrations (Meta, Google, LinkedIn, TikTok, X, YouTube)',
        'Campaign generation with banners and social posts',
        'Landing page deployment to Vercel and Cloudflare',
      ],
      inLanguage: ['en', 'vi', 'ja', 'ko'],
    },
    {
      '@type': 'Organization',
      '@id': 'https://1person.ai/#organization',
      name: '1Person',
      url: 'https://1person.ai',
      logo: 'https://1person.ai/logo.png',
      sameAs: [],
      description:
        'Trust-first AI marketing platform. Built for non-technical business owners with data privacy concerns.',
    },
    {
      '@type': 'WebSite',
      '@id': 'https://1person.ai/#website',
      url: 'https://1person.ai',
      name: '1Person',
      description: 'AI that knows your brand. Data that stays yours.',
      publisher: { '@id': 'https://1person.ai/#organization' },
      inLanguage: 'en-US',
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
