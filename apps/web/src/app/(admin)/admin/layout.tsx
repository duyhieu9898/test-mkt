'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { api } from '@/lib/api/client';
import { Shield, RefreshCw } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, setLoading, token, user } = useAuthStore();
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setLoading(false);
  }, [setLoading]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        await api.get('/auth/admin/check', { token: token || undefined });
        setIsAdmin(true);
      } catch {
        setIsAdmin(false);
      } finally {
        setAdminChecked(true);
      }
    };
    if (token && isAuthenticated) checkAdmin();
  }, [token, isAuthenticated]);

  if (isLoading || !adminChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-gray-500 mb-4">
            You don&apos;t have admin privileges.<br />
            Please sign in with an admin account.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="text-sm text-emerald-600 hover:underline"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar />
      <main className="ml-60 p-8">
        {children}
      </main>
    </div>
  );
}
