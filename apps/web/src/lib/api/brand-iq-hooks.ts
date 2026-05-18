/**
 * React Query hooks for Block 2 (Brand IQ Layer).
 *
 * Profile is per-company, single active row at a time. Every other
 * agent reads it server-side via business-context.ts, so the founder
 * doesn't need to "apply" it anywhere — it just takes effect.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '@/stores/auth-store';

export type FirstPerson = 'we' | 'i' | 'the_team' | 'none';
export type SentenceLength = 'short' | 'medium' | 'long' | 'varied';
export type EmojiUsage = 'none' | 'sparingly' | 'frequent';

export interface BrandIqVoice {
  adjectives: string[];
  description: string;
  firstPerson: FirstPerson;
  sentenceLength: SentenceLength;
  signaturePhrases: string[];
  avoidPhrases: string[];
  emojiUsage: EmojiUsage;
}

export interface AudiencePersona {
  id: string;
  name: string;
  role: string;
  painPoints: string[];
  goals: string[];
  channels: string[];
}

export interface StyleGuide {
  headlineRules: string[];
  bodyRules: string[];
  ctaRules: string[];
  formattingPreferences: string[];
}

export interface VisualIdentity {
  primaryColor: string;
  secondaryColor: string;
  accentColors: string[];
  fontHeadline: string | null;
  fontBody: string | null;
  imageMood: string;
  logoUrl: string | null;
}

export interface QuarterlyOkr {
  id: string;
  objective: string;
  keyResults: string[];
  quarter: string;
}

export interface BrandIqProfile {
  id: string;
  companyId: string;
  version: number;
  isActive: boolean;
  sourceUrl: string | null;
  sourceSamples: string[];
  voice: BrandIqVoice;
  audiencePersonas: AudiencePersona[];
  styleGuide: StyleGuide;
  visualIdentity: VisualIdentity;
  okrs: QuarterlyOkr[];
  tagline: string | null;
  generatedBy: 'ai' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export function useBrandIq(companyId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['brand-iq', companyId],
    queryFn: () => api.get<{ data: BrandIqProfile | null }>(`/brand-iq/${companyId}/active`, { token: token! }),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useGenerateBrandIq(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { url?: string; samples?: string[] }) =>
      api.post<{ data: BrandIqProfile }>(`/brand-iq/${companyId}/generate`, body, { token: token! }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand-iq', companyId] }),
  });
}

export function useUpdateBrandIq(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<{
      voice: BrandIqVoice;
      audiencePersonas: AudiencePersona[];
      styleGuide: StyleGuide;
      visualIdentity: VisualIdentity;
      okrs: QuarterlyOkr[];
      tagline: string | null;
    }>) =>
      api.put<{ data: BrandIqProfile }>(`/brand-iq/${companyId}/active`, patch, { token: token! }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand-iq', companyId] }),
  });
}
