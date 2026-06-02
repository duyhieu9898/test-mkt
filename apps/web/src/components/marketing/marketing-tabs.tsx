'use client';

/**
 * Marketing surface tab bar (doc 10 §L1 — Đợt 5).
 *
 * Unifies Campaigns + Landing Pages into one visual surface without
 * requiring a big JSX refactor. Same pattern as KnowledgeTabs — each
 * tab is a Next.js link navigating to the other page.
 *
 * Sidebar shows a single "Campaigns" entry; users land on Campaigns
 * by default and can switch to Landing Pages from here.
 */

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Rocket, Globe } from 'lucide-react';

type TabKey = 'campaigns' | 'landing-pages';

const TABS: Array<{
  key: TabKey;
  label: string;
  icon: typeof Rocket;
  href: (companyId: string) => string;
  match: (pathname: string) => boolean;
}> = [
  {
    key: 'campaigns',
    label: 'Campaigns',
    icon: Rocket,
    href: (id) => `/${id}/campaigns`,
    match: (p) => /\/campaigns(\/|$)/.test(p),
  },
  {
    key: 'landing-pages',
    label: 'Landing Pages',
    icon: Globe,
    href: (id) => `/${id}/landing-pages`,
    match: (p) => /\/landing-pages(\/|$)/.test(p),
  },
];

export function MarketingTabs() {
  const params = useParams();
  const pathname = usePathname();
  const companyId = params.companyId as string;

  return (
    <div className="border-b border-slate-200 -mx-4 px-4 sm:mx-0 sm:px-0 mb-6">
      <nav className="flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.key}
              href={tab.href(companyId)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                active
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300',
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
