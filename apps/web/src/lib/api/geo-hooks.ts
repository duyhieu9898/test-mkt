/**
 * GEO (Generative Engine Optimization) hooks — Block 1
 *
 * Wraps the /geo API surface for the AI Visibility dashboard. Uses the
 * shared TanStack-Query + apiClient pattern from `hooks.ts`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '@/stores/auth-store';

export interface GeoPromptStat {
  id: string;
  promptText: string;
  active: boolean;
  createdAt: string;
  runCount: number;
  brandHits: number;
  lastRunAt: string | null;
}

export interface GeoMention {
  id: string;
  promptId: string;
  provider: string;
  runAt: string;
  responseText: string;
  brandMentioned: boolean;
  mentionPosition: number | null;
  competitorsMentioned: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'unknown';
}

export interface ShareOfVoice {
  current: { sovPercent: number; brand: number; total: number };
  previous: { sovPercent: number; brand: number; total: number };
  deltaPercent: number;
  periodDays: number;
}

export interface RunResult {
  promptId: string;
  brand: string;
  mentions: GeoMention[];
  providersUsed: string[];
  providersSkipped: Array<{ provider: string; reason: string }>;
}

const keys = {
  prompts: (companyId: string) => ['geo-prompts', companyId] as const,
  sov: (companyId: string, days: number) => ['geo-sov', companyId, days] as const,
  mentions: (companyId: string, promptId?: string) =>
    ['geo-mentions', companyId, promptId ?? 'all'] as const,
};

export function useGeoPrompts(companyId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.prompts(companyId),
    queryFn: () =>
      api.get<{ data: GeoPromptStat[] }>(`/geo/${companyId}/prompts`, { token: token! }),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useShareOfVoice(companyId: string, days = 7) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.sov(companyId, days),
    queryFn: () =>
      api.get<{ data: ShareOfVoice }>(`/geo/${companyId}/share-of-voice?days=${days}`, {
        token: token!,
      }),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useGeoMentions(companyId: string, promptId?: string, limit = 20) {
  const token = useAuthStore((s) => s.token);
  const qs = new URLSearchParams({ limit: String(limit) });
  if (promptId) qs.set('promptId', promptId);
  return useQuery({
    queryKey: keys.mentions(companyId, promptId),
    queryFn: () =>
      api.get<{ data: GeoMention[] }>(`/geo/${companyId}/mentions?${qs.toString()}`, {
        token: token!,
      }),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useCreateGeoPrompt(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (promptText: string) =>
      api.post(`/geo/${companyId}/prompts`, { promptText }, { token: token! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.prompts(companyId) });
    },
  });
}

export function useDeleteGeoPrompt(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/geo/${companyId}/prompts/${id}`, { token: token! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.prompts(companyId) });
      qc.invalidateQueries({ queryKey: ['geo-mentions', companyId] });
    },
  });
}

export function useRunGeoPrompt(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean; data: RunResult; charged: number }>(
        `/geo/${companyId}/prompts/${id}/run`,
        {},
        { token: token! },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.prompts(companyId) });
      qc.invalidateQueries({ queryKey: ['geo-mentions', companyId] });
      qc.invalidateQueries({ queryKey: ['geo-sov', companyId] });
    },
  });
}
