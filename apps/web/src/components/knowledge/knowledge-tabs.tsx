'use client';

/**
 * Unified Knowledge surface tab bar (doc 10 §7).
 *
 * Rendered at the top of both `/knowledge` and `/meetings` pages so they
 * feel like a single tabbed surface without requiring a big JSX
 * refactor. Clicking a tab navigates to the other route (Next.js link).
 *
 * Sidebar shows a single "Knowledge" entry that points to /knowledge.
 * Users land on Documents by default and can switch tabs from there.
 */

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { FileText, Globe2, Mic, Search } from 'lucide-react';

type TabKey = 'documents' | 'meetings' | 'search' | 'crawl';

const TABS: Array<{
  key: TabKey;
  label: string;
  icon: typeof FileText;
  href: (companyId: string) => string;
  match: (pathname: string) => boolean;
}> = [
  {
    key: 'documents',
    label: 'Documents',
    icon: FileText,
    href: (id) => `/${id}/knowledge`,
    match: (p) => p.endsWith('/knowledge'),
  },
  {
    key: 'meetings',
    label: 'Meetings',
    icon: Mic,
    href: (id) => `/${id}/meetings`,
    match: (p) => p.endsWith('/meetings'),
  },
  {
    key: 'search',
    label: 'Search',
    icon: Search,
    href: (id) => `/${id}/knowledge/search`,
    match: (p) => p.endsWith('/knowledge/search'),
  },
  {
    key: 'crawl',
    label: 'Crawl Data',
    icon: Globe2,
    href: (id) => `/${id}/knowledge/crawl`,
    match: (p) => p.endsWith('/knowledge/crawl'),
  },
];

export function KnowledgeTabs() {
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
