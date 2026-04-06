'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import {
  LayoutDashboard,
  Search,
  Menu,
  Rocket,
  Sparkles,
  Shield,
  Megaphone,
  FileText,
  Users,
  Building2,
  Settings,
  ExternalLink,
  LogOut,
  BookOpen,
} from 'lucide-react';

const contentSections = [
  { name: 'SEO & Metadata', href: '/admin/seo', icon: Search },
  { name: 'Navigation', href: '/admin/navigation', icon: Menu },
  { name: 'Hero Section', href: '/admin/hero', icon: Rocket },
  { name: 'Features', href: '/admin/features', icon: Sparkles },
  { name: 'Security', href: '/admin/security', icon: Shield },
  { name: 'Call to Action', href: '/admin/cta', icon: Megaphone },
  { name: 'Footer', href: '/admin/footer', icon: FileText },
];

const management = [
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Companies', href: '/admin/companies', icon: Building2 },
  { name: 'Blog Posts', href: '/admin/blog', icon: BookOpen },
];

const system = [
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const logout = useAuthStore((s) => s.logout);

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  const NavItem = ({ item }: { item: { name: string; href: string; icon: any } }) => {
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
          active
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        )}
      >
        <item.icon className={cn('w-4.5 h-4.5', active ? 'text-emerald-600' : 'text-gray-400')} />
        <span>{item.name}</span>
      </Link>
    );
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-60 border-r bg-white flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 h-14 border-b">
        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
          <span className="text-white text-sm font-bold">CMS</span>
        </div>
        <div>
          <p className="text-sm font-bold">1Person</p>
          <p className="text-[10px] text-gray-400">Admin Panel</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-6">
        {/* Dashboard */}
        <div>
          <NavItem item={{ name: 'Dashboard', href: '/admin', icon: LayoutDashboard }} />
        </div>

        {/* Content Sections */}
        <div>
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Content Sections
          </p>
          <div className="space-y-0.5">
            {contentSections.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        {/* Management */}
        <div>
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Management
          </p>
          <div className="space-y-0.5">
            {management.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        {/* System */}
        <div>
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            System
          </p>
          <div className="space-y-0.5">
            {system.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}
          </div>
        </div>
      </nav>

      {/* Bottom Links */}
      <div className="p-3 border-t space-y-1">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
        >
          <ExternalLink className="w-4 h-4 text-gray-400" />
          <span>View Homepage</span>
        </Link>
        <button
          onClick={() => { logout(); window.location.href = '/login'; }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
