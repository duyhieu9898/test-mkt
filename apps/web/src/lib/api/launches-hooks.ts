/**
 * Block 8 — Campaign Launcher hooks.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '@/stores/auth-store';

export type LaunchStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';
export type LaunchOverallStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';

export interface LaunchStep {
  key: string;
  label: string;
  status: LaunchStepStatus;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  result?: Record<string, unknown>;
  error?: string;
}

export interface LaunchTargets {
  wordpress: boolean;
  facebook: boolean;
  linkedin: boolean;
  instagram: boolean;
}

export interface CampaignLaunch {
  id: string;
  companyId: string;
  keyword: string;
  brief: string | null;
  targets: LaunchTargets;
  status: LaunchOverallStatus;
  steps: LaunchStep[];
  blogPostId: string | null;
  heroImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useLaunches(companyId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['launches', companyId],
    queryFn: () => api.get<{ data: CampaignLaunch[] }>(`/launches/${companyId}`, { token: token! }),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useLaunch(companyId: string, launchId: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['launches', companyId, launchId],
    queryFn: () => api.get<{ data: CampaignLaunch }>(`/launches/${companyId}/${launchId}`, { token: token! }),
    enabled: !!token && !!companyId && !!launchId,
    select: (r) => r.data,
    // While the launch is running, poll every 2s; otherwise stop.
    refetchInterval: (q) => {
      const status = (q.state.data as any)?.data?.status;
      return status === 'queued' || status === 'running' ? 2000 : false;
    },
  });
}

export function useStartLaunch(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { keyword: string; brief?: string; targets: LaunchTargets }) =>
      api.post<{ data: { launchId: string } }>(`/launches/${companyId}`, body, { token: token! }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['launches', companyId] }),
  });
}
