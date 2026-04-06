import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '1Person - AI Company OS | Run Your Business with AI Agents',
  description: 'Launch and operate an entire company with AI agents. Multi-agent system for marketing, sales, content & operations. Private data storage, enterprise security, self-hosted AI.',
  keywords: [
    // English
    'AI company OS', 'multi-agent system', 'AI business automation', 'AI marketing tool',
    'AI sales automation', 'private AI data storage', 'self-hosted AI', 'AI agent platform',
    'enterprise AI security', 'AI content creation', 'business AI assistant',
    'run company with AI', 'AI CEO agent', 'autonomous AI agents', 'AI for startups',
    'private cloud AI', 'on-premise AI', 'secure AI platform', 'AI operations management',
    'AI budget control', 'multi-agent orchestration', 'AI-powered business',

    // Japanese
    'AIエージェント', 'マルチエージェントシステム', 'AI企業OS', 'AI自動化',
    'AIマーケティングツール', 'AI営業自動化', 'プライベートAIデータ',
    'セルフホストAI', 'AIセキュリティ', 'AIコンテンツ作成',
    'AIビジネスアシスタント', '自律型AIエージェント', 'オンプレミスAI',
    'AI予算管理', 'AI業務自動化',

    // Vietnamese
    'AI agent', 'hệ thống multi agent', 'AI tự động hóa doanh nghiệp',
    'công cụ AI marketing', 'AI bán hàng tự động', 'lưu trữ dữ liệu AI riêng',
    'AI tự host', 'nền tảng AI agent', 'bảo mật AI doanh nghiệp',
    'AI tạo nội dung', 'trợ lý AI doanh nghiệp', 'vận hành công ty bằng AI',
    'AI cho startup', 'AI đám mây riêng', 'AI bảo mật cao',

    // Korean
    'AI 에이전트', '멀티 에이전트 시스템', 'AI 기업 OS', 'AI 자동화',
    'AI 마케팅 도구', 'AI 영업 자동화', '프라이빗 AI 데이터 저장',
    '셀프 호스팅 AI', 'AI 보안', 'AI 콘텐츠 생성',
    'AI 비즈니스 어시스턴트', '자율 AI 에이전트', '온프레미스 AI',
    'AI 예산 관리', 'AI 업무 자동화',
  ].join(', '),
  openGraph: {
    title: '1Person - AI Company OS',
    description: 'Run your entire company with AI agents. Multi-agent system with private data storage and enterprise security.',
    type: 'website',
    siteName: '1Person',
  },
  twitter: {
    card: 'summary_large_image',
    title: '1Person - AI Company OS',
    description: 'Run your entire company with AI agents.',
  },
  alternates: {
    languages: {
      'en': '/',
      'ja': '/?lang=ja',
      'vi': '/?lang=vi',
      'ko': '/?lang=ko',
    },
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
