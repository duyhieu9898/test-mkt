/**
 * React Query hooks for Block 3 (AI Employees + Vector Memory).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '@/stores/auth-store';

export interface EmployeeKpi {
  key: string;
  label: string;
  source: string;
  value: string | number;
}

export interface EmployeeCard {
  slug: string;
  name: string;
  roleTitle: string;
  department: string;
  avatarEmoji: string;
  accentColor: string;
  intro: string;
  kpis: EmployeeKpi[];
}

export interface MemorySummary {
  total: number;
  bySource: Record<string, number>;
}

export interface EmployeeChatMessage {
  role: 'founder' | 'employee';
  text: string;
  at: string;
  citations?: Array<{ sourceType: string; preview: string; score: number }>;
}

export interface EmployeeDetail extends EmployeeCard {
  thread: EmployeeChatMessage[];
}

export function useTeam(companyId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['team', companyId],
    queryFn: () => api.get<{ data: { employees: EmployeeCard[]; memory: MemorySummary } }>(`/team/${companyId}`, { token: token! }),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useEmployee(companyId: string, slug: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['team', companyId, slug],
    queryFn: () => api.get<{ data: EmployeeDetail }>(`/team/${companyId}/${slug}`, { token: token! }),
    enabled: !!token && !!companyId && !!slug,
    select: (r) => r.data,
  });
}

export function useSendMessage(companyId: string, slug: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      api.post<{ data: { reply: EmployeeChatMessage; thread: EmployeeChatMessage[] } }>(
        `/team/${companyId}/${slug}/chat`,
        { message },
        { token: token! },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team', companyId, slug] });
    },
  });
}
