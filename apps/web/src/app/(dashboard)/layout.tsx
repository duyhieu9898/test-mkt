'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { CreditBadge } from '@/components/credit-badge';
import { CompanyGuidedTour } from '@/components/guided-tour/company-guided-tour';
import { NavigationProgress } from '@/components/layout/navigation-progress';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading, setLoading } = useAuthStore();

  useEffect(() => {
    setLoading(false);
  }, [setLoading]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <NavigationProgress />
      <Sidebar />
      <CompanyGuidedTour />
      <div className="lg:pl-64">
        <Header />
        <main className="p-4 pt-16 sm:p-6 lg:pt-6">{children}</main>
      </div>
      <div className="fixed top-4 right-4 z-30">
        <CreditBadge />
      </div>
    </div>
  );
}
