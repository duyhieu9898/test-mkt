'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminDashboard } from '@/lib/api/admin-hooks';
import { useSetupReadiness } from '@/lib/api/setup-hooks';
import { Button } from '@/components/ui/button';
import {
  Search,
  Menu,
  Rocket,
  Sparkles,
  Shield,
  Megaphone,
  FileText,
  BookOpen,
  Users,
  Building2,
  Newspaper,
  Activity,
  Loader2,
  Gauge,
  ArrowRight,
  AlertTriangle,
  XCircle,
  CheckCircle2,
} from 'lucide-react';

const sections = [
  { title: 'SEO & Metadata', icon: Search, desc: 'Title, description, keywords', href: '/admin/seo' },
  { title: 'Navigation', icon: Menu, desc: 'Menu links, CTA buttons', href: '/admin/navigation' },
  { title: 'Hero Section', icon: Rocket, desc: 'Heading, description, stats', href: '/admin/hero' },
  { title: 'Features', icon: Sparkles, desc: 'Feature highlight grid', href: '/admin/features' },
  { title: 'Security', icon: Shield, desc: 'Trust & security section', href: '/admin/security' },
  { title: 'Call to Action', icon: Megaphone, desc: 'CTA section & badges', href: '/admin/cta' },
  { title: 'Footer', icon: FileText, desc: 'Footer links & contact', href: '/admin/footer' },
  { title: 'Blog Posts', icon: BookOpen, desc: 'Create & manage blog articles', href: '/admin/blog' },
];

export default function AdminDashboardPage() {
  const { data, isLoading } = useAdminDashboard();

  const stats = [
    { label: 'Total Users', value: data?.totalUsers ?? '-', icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Active Companies', value: data?.activeCompanies ?? '-', icon: Building2, color: 'text-purple-600 bg-purple-50' },
    { label: 'Blog Posts', value: data?.blogPosts ?? '-', icon: Newspaper, color: 'text-orange-600 bg-orange-50' },
    { label: 'System Health', value: data?.systemHealth ?? '-', icon: Activity, color: 'text-green-600 bg-green-50' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your CMS</p>
      </div>

      <SetupReadinessBanner />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <Card key={stat.label} className="border border-gray-200">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-lg ${stat.color}`}>
                      <stat.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">{stat.label}</p>
                      <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Section Cards */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Content Sections</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {sections.map((section) => (
                <Link key={section.href} href={section.href}>
                  <Card className="border border-gray-200 hover:border-green-300 hover:shadow-md transition-all cursor-pointer h-full">
                    <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                      <div className="p-3 rounded-full bg-green-50 text-green-600">
                        <section.icon className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{section.title}</p>
                        <p className="text-sm text-gray-500 mt-1">{section.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SetupReadinessBanner() {
  const { data, isLoading } = useSetupReadiness();
  if (isLoading || !data) return null;

  const { score, summary } = data;
  const scoreColor =
    score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-rose-600';
  const bgColor =
    score >= 80
      ? 'border-emerald-200 bg-emerald-50/50'
      : score >= 50
        ? 'border-amber-200 bg-amber-50/50'
        : 'border-rose-200 bg-rose-50/50';

  // When everything is OK, show a compact success line
  if (score === 100) {
    return (
      <Card className={bgColor}>
        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">All required configuration is in place.</span>
            <span className="text-muted-foreground">Score 100/100.</span>
          </div>
          <Link href="/admin/setup">
            <Button variant="ghost" size="sm" className="gap-1">
              View checklist <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={bgColor}>
      <CardContent className="p-5 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Gauge className={`w-8 h-8 ${scoreColor}`} />
          <div>
            <div className="text-sm text-muted-foreground">Setup readiness</div>
            <div className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{score}<span className="text-base text-muted-foreground">/100</span></div>
          </div>
        </div>
        <div className="flex-1 min-w-[200px] text-sm space-y-1">
          {summary.missing > 0 && (
            <p className="flex items-center gap-1 text-rose-700">
              <XCircle className="w-3.5 h-3.5" />
              <span className="font-medium">{summary.missing} required configuration missing</span>
              <span className="text-muted-foreground">— features will fail until fixed.</span>
            </p>
          )}
          {summary.warn > 0 && (
            <p className="flex items-center gap-1 text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5" />
              {summary.warn} optional or partial — some features run in degraded mode.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Re-checked every 30s. {summary.ok} of {summary.total} items configured.
          </p>
        </div>
        <Link href="/admin/setup">
          <Button size="sm" className="gap-1">
            Review checklist <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
