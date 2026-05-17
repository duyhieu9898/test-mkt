/**
 * Content Editor (Block 4) — React Query hooks for the real-time
 * semantic content grader API.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '@/stores/auth-store';

export type GradeSeverity = 'high' | 'medium' | 'low';

export interface GradeBreakdown {
  entity_coverage: number;
  topic_coverage: number;
  brand_voice: number;
  ai_citation_likelihood: number;
  readability: number;
}

export interface GradeSuggestion {
  category: string;
  severity: GradeSeverity;
  text: string;
}

export interface GradeResult {
  id: string;
  score: number;
  breakdown: GradeBreakdown;
  suggestions: GradeSuggestion[];
  missingEntities: string[];
  serpEntities: string[];
  createdAt: string;
}

export interface PastGrade {
  id: string;
  score: number;
  targetKeyword: string;
  breakdown: GradeBreakdown;
  createdAt: string;
}

export function useGradeContent(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { content: string; targetKeyword: string }) => {
      const res = await api.post<{ success: boolean; data: GradeResult }>(
        '/content-editor/grade',
        { companyId, ...input },
        { token: token! },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-editor', 'grades', companyId] });
    },
  });
}

export function usePastGrades(companyId: string, limit = 5) {
  const token = useAuthStore((s) => s.token);

  return useQuery({
    queryKey: ['content-editor', 'grades', companyId, limit],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: PastGrade[] }>(
        `/content-editor/grades?companyId=${companyId}&limit=${limit}`,
        { token: token! },
      );
      return res.data;
    },
    enabled: !!token && !!companyId,
  });
}

export function useGradeDetail(companyId: string, id: string | null) {
  const token = useAuthStore((s) => s.token);

  return useQuery({
    queryKey: ['content-editor', 'grade', companyId, id],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: GradeResult & { contentText: string };
      }>(`/content-editor/grades/${id}?companyId=${companyId}`, { token: token! });
      return res.data;
    },
    enabled: !!token && !!companyId && !!id,
  });
}
