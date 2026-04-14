'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Megaphone,
  BarChart3,
  Settings,
  Sparkles,
  Building2,
  Rocket,
  ChevronRight,
  BookOpen,
  MessageSquare,
  Mic,
  Users,
  Brain,
  Image,
  Shield,
  Search,
  Menu,
  X,
  Wallet,
  Globe,
  Briefcase,
  Share2,
  Flame,
  Lock,
} from 'lucide-react';
import { useCompanies, useStreak, useGrowthScore } from '@/lib/api/hooks';

// Venture-CEO IA — see docs/architecture/10-venture-ceo-ia.md §3.
// 8-item core rail mapped 1:1 to the CEO needs. Marketing / SEO /
// Leads are folded into Campaigns / Sales / Knowledge respectively,
// power-user deep pages still live under More.
//
// Progressive unlock: items with `unlockLevel` require that Growth Score
// level before they become fully clickable. Lower levels show the item
// grayed out with a lock tooltip.
const navigation = [
  { name: 'Dashboard', href: '', icon: LayoutDashboard, unlockLevel: 1 },
  { name: 'CEO Advisor', href: '/insights', icon: Sparkles, unlockLevel: 1 },
  { name: 'Knowledge', href: '/knowledge', icon: BookOpen, unlockLevel: 1 },
  { name: 'Campaigns', href: '/campaigns', icon: Rocket, unlockLevel: 2 },
  { name: 'Market & Competitors', href: '/market', icon: Globe, unlockLevel: 2 },
  { name: 'Brain', href: '/brain', icon: Brain, unlockLevel: 2 },
  { name: 'Sales', href: '/sales', icon: Briefcase, unlockLevel: 3 },
  { name: 'Chatbot', href: '/chatbot', icon: MessageSquare, unlockLevel: 2 },
  { name: 'Social Media', href: '/social', icon: Share2, unlockLevel: 3 },
];

// Power-user surfaces — collapsed under "More". Deep pages still
// reachable by URL for migration safety.
const moreNavigation = [
  { name: 'Trust', href: '/ai-brain', icon: Shield },
  { name: 'Credits & Billing', href: '/settings/credits', icon: Wallet },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Landing Pages', href: '/landing-pages', icon: FileText },
  { name: 'Assets', href: '/assets', icon: Image },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const params = useParams();
  const companyIdFromParams = params.companyId as string | undefined;
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [mobileOpen]);

  const { data: companies } = useCompanies();
  const firstCompanyId = companies?.[0]?.id;
  const companyId = companyIdFromParams || firstCompanyId;
  const hasCompany = !!companyId;

  const currentCompany = companies?.find((c) => c.id === companyId);
  const companyName = currentCompany?.name || companies?.[0]?.name || 'My Business';

  // Gamification data for streak badge + progressive unlock
  const { data: streakData } = useStreak(companyId ?? '');
  const { data: growthScoreData } = useGrowthScore(companyId ?? '');
  const currentLevel = growthScoreData?.level ?? 1;
  const streakDays = streakData?.currentStreak ?? 0;

  const isActive = (href: string) => {
    if (!companyId) return false;
    if (href === '') return pathname === `/${companyId}`;
    return pathname.startsWith(`/${companyId}${href}`);
  };

  const sidebarInner = (
    <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b px-5">
          <Link href={hasCompany ? `/${companyId}` : '/companies'} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold">1Person</span>
          </Link>
        </div>

        {/* Company */}
        <div className="p-3 border-b">
          <Link href="/companies">
            <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted transition-colors cursor-pointer group">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{companyName}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        </div>

        {/* Navigation — core surfaces + "More" for power users */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const href = hasCompany ? `/${companyId}${item.href}` : '#';
            const active = isActive(item.href);
            const locked = hasCompany && item.unlockLevel > currentLevel;

            if (!hasCompany) {
              return (
                <span
                  key={item.name}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground/40 cursor-not-allowed"
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </span>
              );
            }

            // Locked items — visible but grayed out with lock icon
            if (locked) {
              return (
                <span
                  key={item.name}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground/40 cursor-not-allowed"
                  title={`Unlocks at Level ${item.unlockLevel}`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="flex-1">{item.name}</span>
                  <Lock className="w-3 h-3" />
                </span>
              );
            }

            const isDashboard = item.href === '';

            return (
              <Link
                key={item.name}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="flex-1">{item.name}</span>
                {/* Streak badge on Dashboard */}
                {isDashboard && streakDays > 0 && (
                  <span className={cn(
                    'flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-orange-100 text-orange-600'
                  )}>
                    <Flame className="w-2.5 h-2.5" />
                    {streakDays}
                  </span>
                )}
              </Link>
            );
          })}

          {hasCompany && (
            <details className="pt-3 group">
              <summary className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider cursor-pointer hover:text-foreground">
                <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                More
              </summary>
              <div className="mt-1 space-y-1">
                {moreNavigation.map((item) => {
                  const href = `/${companyId}${item.href}`;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.name}
                      href={href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-all',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </details>
          )}
        </nav>

        {/* Admin Link */}
        <div className="px-3 pb-1">
          <Link
            href="/admin"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              pathname === '/admin'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Shield className="w-5 h-5" />
            <span>Admin</span>
          </Link>
        </div>

        {/* Bottom CTA */}
        <div className="p-3 border-t">
          {hasCompany ? (
            <Link href={`/${companyId}/landing-pages?action=generate`}>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-primary/10 to-purple-500/10 hover:from-primary/20 hover:to-purple-500/20 transition-colors cursor-pointer">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">Create New Page</span>
              </div>
            </Link>
          ) : (
            <Link href="/welcome">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary text-primary-foreground cursor-pointer">
                <Rocket className="w-4 h-4" />
                <span className="text-sm font-medium">Get Started</span>
              </div>
            </Link>
          )}
        </div>
      </div>
  );

  return (
    <>
      {/* Mobile hamburger — only on < lg */}
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-40 lg:hidden h-11 w-11 inline-flex items-center justify-center rounded-lg bg-card border shadow-sm hover:bg-muted transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 border-r bg-card lg:block">
        {sidebarInner}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r bg-card shadow-xl animate-in slide-in-from-left duration-200">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-muted"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarInner}
          </aside>
        </div>
      )}
    </>
  );
}
