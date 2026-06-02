/**
 * Content Autopilot hooks (P8) — configure + run the daily auto-blog engine.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '@/stores/auth-store';

export interface AutopilotTargets {
  wordpress: boolean;
  facebook: boolean;
  linkedin: boolean;
  instagram: boolean;
}
export interface AutopilotConfig {
  id: string;
  companyId: string;
  enabled: boolean;
  postsPerDay: number;
  targets: AutopilotTargets;
  mode: 'draft' | 'autopublish';
  keywordQueue: string[];
  usedKeywords: string[];
  lastRunAt: string | null;
  nextRunAt: string | null;
}
export interface AutopilotLaunch {
  id: string;
  keyword: string;
  status: string;
  steps: { key: string; label: string; status: string }[];
  createdAt: string;
}
export interface AutopilotData {
  config: AutopilotConfig | null;
  history: AutopilotLaunch[];
}

export function useAutopilot(companyId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['autopilot', companyId],
    queryFn: () => api.get<{ data: AutopilotData }>(`/autopilot/${companyId}`, { token: token! }),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useUpdateAutopilot(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<{
      enabled: boolean;
      postsPerDay: number;
      targets: AutopilotTargets;
      mode: 'draft' | 'autopublish';
      keywordQueue: string[];
    }>) => api.put<{ data: { config: AutopilotConfig } }>(`/autopilot/${companyId}`, patch, { token: token! }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['autopilot', companyId] }),
  });
}

export function useRunAutopilotNow(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ data: { ran: boolean; keyword?: string; launchId?: string } }>(
        `/autopilot/${companyId}/run-now`,
        {},
        { token: token! },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['autopilot', companyId] }),
  });
}
