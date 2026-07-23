'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/avatar';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useCompany } from '@/lib/api/hooks';
import { api } from '@/lib/api/client';
import { APP_LANGUAGE_STORAGE_KEY, appT, normalizeAppLanguage, type AppLanguage } from '@/lib/app-language';
import {
  Bell,
  Search,
  Menu,
  LogOut,
  Settings,
  User,
  ChevronDown,
  HelpCircle,
  Gem,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const router = useRouter();
  const params = useParams<{ companyId?: string }>();
  const { user, logout, token } = useAuthStore();
  const companyId = typeof params?.companyId === 'string' ? params.companyId : undefined;
  const settingsHref = companyId ? `/${companyId}/settings` : '/companies';
  const { data: company } = useCompany(companyId ?? '');
  const [preferredLanguage, setPreferredLanguage] = useState<AppLanguage>('en');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const language = companyId
    ? normalizeAppLanguage(company?.settings?.language)
    : preferredLanguage;
  const { data: creditsData, refetch: refetchCredits, isFetching: isFetchingCredits } = useQuery({
    queryKey: ['credits', companyId],
    queryFn: () =>
      api.get<{ balance: { totalAvailable: number } }>(`/credits/${companyId}`, {
        token: token!,
      }),
    enabled: !!token && !!companyId,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (companyId) return;
    try {
      setPreferredLanguage(normalizeAppLanguage(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)));
    } catch {
      setPreferredLanguage('en');
    }
    const handleLanguageChange = (event: Event) => {
      setPreferredLanguage(normalizeAppLanguage((event as CustomEvent).detail));
    };
    window.addEventListener('app-language:changed', handleLanguageChange);
    return () => window.removeEventListener('app-language:changed', handleLanguageChange);
  }, [companyId]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleUserMenuOpenChange = (open: boolean) => {
    setUserMenuOpen(open);
    if (open && token && companyId) {
      void refetchCredits();
    }
  };

  return (
    <header className="sticky top-0 z-40 h-16 border-b bg-card/80 backdrop-blur">
      <div className="flex h-full items-center justify-between px-6">
        {/* Mobile menu */}
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="w-5 h-5" />
        </Button>

        {/* Search */}
        <div className="hidden md:flex items-center flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={appT(language, 'searchPlaceholder')}
              className="pl-9 bg-muted/50 border-0 focus-visible:ring-1"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-4">
          {companyId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.dispatchEvent(new Event('guided-tour:restart'))}
              className="gap-2"
              title={appT(language, 'runGuidedTour')}
            >
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">{appT(language, 'guidedTour')}</span>
            </Button>
          )}

          <LanguageSwitcher companyId={companyId} />

          {/* AI Status */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-600 text-sm">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>{appT(language, 'aiActive')}</span>
          </div>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
              3
            </span>
          </Button>

          {/* User menu */}
          <DropdownMenu open={userMenuOpen} onOpenChange={handleUserMenuOpenChange}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 pl-2 pr-3">
                <UserAvatar src={user?.avatarUrl} name={user?.name || 'User'} size="sm" />
                <span className="hidden md:block font-medium">{user?.name}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{user?.name}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
                  {companyId && (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <Gem className="h-3 w-3" />
                      {typeof creditsData?.balance.totalAvailable === 'number'
                        ? `${creditsData.balance.totalAvailable.toLocaleString()} credits left`
                        : isFetchingCredits
                          ? 'Checking credits...'
                          : 'Credits unavailable'}
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="w-4 h-4 mr-2" />
                {appT(language, 'profile')}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={settingsHref}>
                  <Settings className="w-4 h-4 mr-2" />
                  {appT(language, 'settings')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                {appT(language, 'logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
