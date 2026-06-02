/**
 * Setup Readiness hooks — admin checklist of what config is missing.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '@/stores/auth-store';

export type ReadinessStatus = 'ok' | 'warn' | 'missing';
export type ReadinessCategory =
  | 'llm'
  | 'search'
  | 'image'
  | 'video'
  | 'payments'
  | 'email'
  | 'channels'
  | 'observability';

export interface ReadinessItem {
  id: string;
  category: ReadinessCategory;
  label: string;
  status: ReadinessStatus;
  detail: string;
  fixHref: string;
  helpUrl?: string;
  enables: string[];
}

export interface ReadinessReport {
  score: number;
  items: ReadinessItem[];
  summary: { total: number; ok: number; warn: number; missing: number };
  generatedAt: string;
}

export function useSetupReadiness() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['admin', 'setup', 'readiness'],
    queryFn: () => api.get<{ data: ReadinessReport }>('/admin/setup/readiness', { token: token! }),
    enabled: !!token,
    select: (r) => r.data,
    refetchInterval: 30_000,
  });
}
