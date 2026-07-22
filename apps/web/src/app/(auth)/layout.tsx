'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { usePreferredAppLanguage } from '@/lib/use-preferred-app-language';

const authCopy = {
  en: {
    title: 'Run Your Entire Company with AI Agents',
    description: 'Launch a business, hire AI employees, and watch them work while you focus on what matters most.',
    launched: '1,000+ AI companies launched',
    trusted: 'Trusted by founders, creators, and entrepreneurs worldwide',
  },
  ja: {
    title: 'AIエージェントで会社全体を運営',
    description: 'ビジネスを立ち上げ、AIチームを構築し、重要な意思決定に集中できます。',
    launched: '1,000社以上のAIカンパニーが開始',
    trusted: '世界中の創業者、クリエイター、起業家に信頼されています',
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [language] = usePreferredAppLanguage('en');
  const copy = authCopy[language];

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-purple-600 to-pink-500 p-12 flex-col justify-between text-white">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur">
            <Sparkles className="w-6 h-6" />
          </div>
          <span className="text-2xl font-bold">1Person</span>
        </Link>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            {copy.title}
          </h1>
          <p className="text-lg text-white/80">
            {copy.description}
          </p>

          <div className="flex items-center gap-4 pt-4">
            <div className="flex -space-x-3">
              {['CEO', 'MKT', 'DEV', 'ADS'].map((role, i) => (
                <div
                  key={role}
                  className="w-10 h-10 rounded-full bg-white/20 backdrop-blur border-2 border-white/30 flex items-center justify-center text-xs font-medium"
                >
                  {role}
                </div>
              ))}
            </div>
            <span className="text-sm text-white/70">
              {copy.launched}
            </span>
          </div>
        </div>

        <p className="text-sm text-white/60">
          {copy.trusted}
        </p>
      </div>

      {/* Right side - Auth form */}
      <div className="relative flex flex-1 items-center justify-center bg-background p-6">
        <div className="absolute right-6 top-6">
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
