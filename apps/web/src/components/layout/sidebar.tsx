'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  Brain,
  Briefcase,
  Building2,
  ChevronRight,
  Compass,
  Database,
  FileEdit,
  FileText,
  Flame,
  Globe,
  Image,
  Inbox,
  LayoutDashboard,
  Link2,
  Lock,
  Megaphone,
  Menu,
  MessageSquare,
  Palette,
  Rocket,
  Search,
  Settings,
  Share2,
  Shield,
  Sparkles,
  Star,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCompanies, useGrowthScore, useStreak } from '@/lib/api/hooks';
import { appT, normalizeAppLanguage, type AppMessageKey } from '@/lib/app-language';

const TESTING_UNLOCK_ALL = true;

interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
  unlockLevel?: number;
  global?: boolean;
  exact?: boolean;
  tourId?: string;
}

interface NavigationGroup {
  title: string;
  items: NavigationItem[];
  containerClass: string;
  titleClass: string;
  activeClass: string;
}

const navigationGroups: NavigationGroup[] = [
  {
    title: 'Business Strategy',
    containerClass: 'bg-violet-50/70',
    titleClass: 'text-violet-700',
    activeClass: 'bg-violet-600 text-white shadow-sm',
    items: [
      { name: 'Growth Plan', href: '/growth-plan', icon: Star, unlockLevel: 1 },
      { name: 'Brand IQ', href: '/brand-iq', icon: Palette, unlockLevel: 1 },
      { name: 'CEO Advisor', href: '/insights', icon: Sparkles, unlockLevel: 1, tourId: 'ceo-advisor-menu' },
      { name: 'Walkthrough', href: '/walkthrough', icon: Compass, unlockLevel: 1, tourId: 'walkthrough-menu' },
    ],
  },
  {
    title: 'AI Team',
    containerClass: 'bg-blue-50/70',
    titleClass: 'text-blue-700',
    activeClass: 'bg-blue-600 text-white shadow-sm',
    items: [
      { name: 'Your AI Team', href: '/team', icon: Users, unlockLevel: 1 },
      { name: 'Knowledge Hub', href: '/knowledge', icon: BookOpen, unlockLevel: 1, tourId: 'knowledge-menu' },
      { name: 'Brain Hub', href: '/brain-hub', icon: Database, unlockLevel: 1, tourId: 'brain-hub-menu' },
    ],
  },
  {
    title: 'Execution',
    containerClass: 'bg-emerald-50/60',
    titleClass: 'text-emerald-700',
    activeClass: 'bg-emerald-600 text-white shadow-sm',
    items: [
      { name: 'Campaigns', href: '/campaigns', icon: Megaphone, unlockLevel: 2 },
      { name: 'Campaign Launcher', href: '/launch', icon: Rocket, unlockLevel: 2, tourId: 'campaign-launcher-menu' },
      { name: 'Landing Pages', href: '/landing-pages', icon: FileText, unlockLevel: 2, tourId: 'landing-pages-menu' },
      { name: 'Content Autopilot', href: '/autopilot', icon: Sparkles, unlockLevel: 2 },
      { name: 'Content Editor', href: '/editor', icon: FileEdit, unlockLevel: 2 },
      { name: 'AI Visibility (GEO)', href: '/geo', icon: Search, unlockLevel: 2 },
      { name: 'Market & Competitors', href: '/market', icon: Globe, unlockLevel: 2, tourId: 'market-menu' },
      { name: 'Marketing Playbooks', href: '/playbooks', icon: BookOpen, unlockLevel: 1 },
      { name: 'Sales', href: '/sales', icon: Briefcase, unlockLevel: 3 },
      { name: 'Social Media', href: '/social', icon: Share2, unlockLevel: 3 },
      { name: 'Channels', href: '/channels', icon: Link2, unlockLevel: 2 },
      { name: 'Inbox & Messages', href: '/inbox/messages', icon: Inbox, unlockLevel: 2 },
      { name: 'Chatbot', href: '/chatbot', icon: MessageSquare, unlockLevel: 2 },
      { name: 'Assets', href: '/assets', icon: Image, unlockLevel: 1 },
    ],
  },
  {
    title: 'Analytics',
    containerClass: 'bg-amber-50/70',
    titleClass: 'text-amber-700',
    activeClass: 'bg-amber-600 text-white shadow-sm',
    items: [
      { name: 'Analytics', href: '/analytics', icon: BarChart3, unlockLevel: 1, tourId: 'analytics-menu' },
    ],
  },
  {
    title: 'System',
    containerClass: 'bg-slate-100/70',
    titleClass: 'text-slate-600',
    activeClass: 'bg-slate-700 text-white shadow-sm',
    items: [
      { name: 'Brain', href: '/brain', icon: Brain, unlockLevel: 2 },
      { name: 'Trust', href: '/ai-brain', icon: Shield, unlockLevel: 1 },
      { name: 'Credits & Billing', href: '/settings/credits', icon: Wallet, unlockLevel: 1 },
      { name: 'Settings', href: '/settings', icon: Settings, unlockLevel: 1, exact: true },
      { name: 'Admin', href: '/admin', icon: Shield, global: true, unlockLevel: 1 },
    ],
  },
];

const groupTranslationKeys: Record<string, AppMessageKey> = {
  'Business Strategy': 'navBusinessStrategy',
  'AI Team': 'navAiTeam',
  Execution: 'navExecution',
  Analytics: 'navAnalytics',
  System: 'navSystem',
};

const itemTranslationKeys: Record<string, AppMessageKey> = {
  'Growth Plan': 'navGrowthPlan',
  'Brand IQ': 'navBrandIq',
  'CEO Advisor': 'navCeoAdvisor',
  Walkthrough: 'navWalkthrough',
  'Your AI Team': 'navYourAiTeam',
  'Knowledge Hub': 'navKnowledgeHub',
  'Brain Hub': 'navBrainHub',
  Campaigns: 'navCampaigns',
  'Campaign Launcher': 'navCampaignLauncher',
  'Landing Pages': 'navLandingPages',
  'Content Autopilot': 'navContentAutopilot',
  'Content Editor': 'navContentEditor',
  'AI Visibility (GEO)': 'navAiVisibility',
  'Market & Competitors': 'navMarket',
  'Marketing Playbooks': 'navPlaybooks',
  Sales: 'navSales',
  'Social Media': 'navSocialMedia',
  Channels: 'navChannels',
  'Inbox & Messages': 'navInbox',
  Chatbot: 'navChatbot',
  Assets: 'navAssets',
  Brain: 'navBrain',
  Trust: 'navTrust',
  'Credits & Billing': 'navCredits',
  Settings: 'settings',
  Admin: 'navAdmin',
};

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const companyIdFromParams = params.companyId as string | undefined;
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  useEffect(() => {
    const openForTour = () => setMobileOpen(true);
    const closeForTour = () => setMobileOpen(false);
    window.addEventListener('guided-tour:open-sidebar', openForTour);
    window.addEventListener('guided-tour:close-sidebar', closeForTour);
    return () => {
      window.removeEventListener('guided-tour:open-sidebar', openForTour);
      window.removeEventListener('guided-tour:close-sidebar', closeForTour);
    };
  }, []);

  const { data: companies } = useCompanies();
  const firstCompanyId = companies?.[0]?.id;
  const companyId = companyIdFromParams || firstCompanyId;
  const hasCompany = Boolean(companyId);
  const currentCompany = companies?.find((company) => company.id === companyId);
  const companyName = currentCompany?.name || companies?.[0]?.name || 'My Business';
  const language = normalizeAppLanguage(currentCompany?.settings?.language || companies?.[0]?.settings?.language);

  const { data: streakData } = useStreak(companyId ?? '');
  const { data: growthScoreData } = useGrowthScore(companyId ?? '');
  const currentLevel = growthScoreData?.level ?? 1;
  const streakDays = streakData?.currentStreak ?? 0;

  const itemHref = (item: NavigationItem) => {
    if (item.global) return item.href;
    return hasCompany ? `/${companyId}${item.href}` : '#';
  };

  const prefetchHref = useCallback((href: string) => {
    if (!href || href === '#' || href === pathname) return;
    router.prefetch(href);
  }, [pathname, router]);

  const priorityPrefetchHrefs = useMemo(() => {
    if (!hasCompany || !companyId) return ['/companies'];
    const highTrafficPaths = [
      '',
      '/growth-plan',
      '/brand-iq',
      '/insights',
      '/walkthrough',
      '/team',
      '/knowledge',
      '/brain-hub',
      '/campaigns',
      '/launch',
      '/landing-pages',
      '/market',
      '/analytics',
      '/settings',
    ];
    return [
      '/companies',
      ...highTrafficPaths.map((path) => `/${companyId}${path}`),
    ];
  }, [companyId, hasCompany]);

  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const uniqueHrefs = Array.from(new Set(priorityPrefetchHrefs))
      .filter((href) => href && href !== pathname);

    uniqueHrefs.forEach((href, index) => {
      timers.push(setTimeout(() => {
        router.prefetch(href);
      }, 450 + index * 180));
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [pathname, priorityPrefetchHrefs, router]);

  const isItemActive = (item: NavigationItem) => {
    const href = itemHref(item);
    if (href === '#') return false;
    if (item.exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const renderItem = (item: NavigationItem, group: NavigationGroup) => {
    const href = itemHref(item);
    const active = isItemActive(item);
    const translationKey = itemTranslationKeys[item.name];
    const label = translationKey ? appT(language, translationKey) : item.name;
    const locked = !TESTING_UNLOCK_ALL
      && hasCompany
      && (item.unlockLevel ?? 1) > currentLevel;
    const disabled = !item.global && !hasCompany;

    if (locked || disabled) {
      return (
        <span
          key={item.name}
          className="flex h-9 cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 text-sm text-slate-400"
          title={locked ? `${appT(language, 'unlocksAtLevel')} ${item.unlockLevel}` : appT(language, 'createCompanyFirst')}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {locked && <Lock className="h-3 w-3" />}
        </span>
      );
    }

    return (
      <Link
        key={item.name}
        href={href}
        data-guided-tour={item.tourId}
        prefetch
        onMouseEnter={() => prefetchHref(href)}
        onFocus={() => prefetchHref(href)}
        className={cn(
          'flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
          active
            ? group.activeClass
            : 'text-slate-600 hover:bg-white/80 hover:text-slate-950',
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </Link>
    );
  };

  const sidebarInner = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Link
          href={hasCompany ? `/${companyId}` : '/companies'}
          prefetch
          onMouseEnter={() => prefetchHref(hasCompany ? `/${companyId}` : '/companies')}
          onFocus={() => prefetchHref(hasCompany ? `/${companyId}` : '/companies')}
          className="flex items-center gap-2"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-purple-500">
            <Rocket className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold">1Person</span>
        </Link>
      </div>

      <div className="border-b p-3">
        <Link
          href="/companies"
          prefetch
          onMouseEnter={() => prefetchHref('/companies')}
          onFocus={() => prefetchHref('/companies')}
          className="group flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50">
            <Building2 className="h-4 w-4 text-violet-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{companyName}</p>
            <p className="text-xs font-medium text-emerald-600">{appT(language, 'active')}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <nav className="flex-1 space-y-3 overflow-y-auto p-3">
        <Link
          href={hasCompany ? `/${companyId}` : '#'}
          data-guided-tour="dashboard-menu"
          prefetch
          onMouseEnter={() => hasCompany && companyId && prefetchHref(`/${companyId}`)}
          onFocus={() => hasCompany && companyId && prefetchHref(`/${companyId}`)}
          className={cn(
            'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-all',
            hasCompany
              ? pathname === `/${companyId}`
                ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-sm'
                : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
              : 'cursor-not-allowed bg-slate-50 text-slate-400',
          )}
        >
          <LayoutDashboard className="h-5 w-5" />
          <span className="flex-1">{appT(language, 'dashboard')}</span>
          {streakDays > 0 && (
            <span className={cn(
              'flex items-center gap-0.5 px-1.5 py-0.5 text-[10px]',
              pathname === `/${companyId}` ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-600',
            )}>
              <Flame className="h-2.5 w-2.5" />
              {streakDays}
            </span>
          )}
        </Link>

        {navigationGroups.map((group) => (
          <section key={group.title} className={cn('rounded-xl p-2', group.containerClass)}>
            <h2 className={cn('px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase', group.titleClass)}>
              {groupTranslationKeys[group.title] ? appT(language, groupTranslationKeys[group.title]) : group.title}
            </h2>
            <div className="space-y-0.5">
              {group.items.map((item) => renderItem(item, group))}
            </div>
          </section>
        ))}
      </nav>

      <div className="border-t p-3">
        {hasCompany ? (
          <Link
            href={`/${companyId}/landing-pages?action=generate`}
            prefetch
            onMouseEnter={() => prefetchHref(`/${companyId}/landing-pages?action=generate`)}
            onFocus={() => prefetchHref(`/${companyId}/landing-pages?action=generate`)}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-violet-50 px-3 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100"
          >
            <Sparkles className="h-4 w-4" />
            {appT(language, 'createNewPage')}
          </Link>
        ) : (
          <Link
            href="/welcome"
            prefetch
            onMouseEnter={() => prefetchHref('/welcome')}
            onFocus={() => prefetchHref('/welcome')}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <Rocket className="h-4 w-4" />
            {appT(language, 'getStarted')}
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        aria-label={appT(language, 'openMenu')}
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-card shadow-sm transition-colors hover:bg-muted lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 border-r bg-white lg:block">
        {sidebarInner}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r bg-white shadow-xl animate-in slide-in-from-left duration-200">
            <button
              type="button"
              aria-label={appT(language, 'closeMenu')}
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarInner}
          </aside>
        </div>
      )}
    </>
  );
}
