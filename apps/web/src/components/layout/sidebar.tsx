'use client';

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
} from 'lucide-react';
import { useCompanies } from '@/lib/api/hooks';

// Simplified navigation — 5 items, no technical terms
const navigation = [
  { name: 'Dashboard', href: '', icon: LayoutDashboard },
  { name: 'My Pages', href: '/landing-pages', icon: FileText },
  { name: 'Marketing', href: '/marketing', icon: Megaphone },
  { name: 'SEO Engine', href: '/seo-engine', icon: Search },
  { name: 'Assets', href: '/assets', icon: Image },
  { name: 'Knowledge', href: '/knowledge', icon: BookOpen },
  { name: 'AI Brain', href: '/ai-brain', icon: Shield },
  { name: 'Chatbot', href: '/chatbot', icon: MessageSquare },
  { name: 'Meetings', href: '/meetings', icon: Mic },
  { name: 'Leads', href: '/leads', icon: Users },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Growth Brain', href: '/growth-brain', icon: Brain },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const params = useParams();
  const companyIdFromParams = params.companyId as string | undefined;

  const { data: companies } = useCompanies();
  const firstCompanyId = companies?.[0]?.id;
  const companyId = companyIdFromParams || firstCompanyId;
  const hasCompany = !!companyId;

  const currentCompany = companies?.find((c) => c.id === companyId);
  const companyName = currentCompany?.name || companies?.[0]?.name || 'My Business';

  const isActive = (href: string) => {
    if (!companyId) return false;
    if (href === '') return pathname === `/${companyId}`;
    return pathname.startsWith(`/${companyId}${href}`);
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 border-r bg-card lg:block">
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

        {/* Navigation — 5 items, no sections */}
        <nav className="flex-1 p-3 space-y-1">
          {navigation.map((item) => {
            const href = hasCompany ? `/${companyId}${item.href}` : '#';
            const active = isActive(item.href);

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
                <span>{item.name}</span>
              </Link>
            );
          })}
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
    </aside>
  );
}
