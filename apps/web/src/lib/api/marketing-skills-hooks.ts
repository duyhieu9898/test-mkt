/**
 * Marketing Playbooks Studio hooks (P6) — browse the 41 expert playbooks and
 * run any of them grounded in the company's Brand IQ + context.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '@/stores/auth-store';

export interface SkillCatalogEntry {
  name: string;
  category: string;
  summary: string;
}
export interface SkillCatalogGroup {
  category: string;
  items: SkillCatalogEntry[];
}
export interface RunSkillResult {
  skill: string;
  skillLabel: string;
  output: string;
  model: string;
}

export function useSkillCatalog() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['marketing-skills-catalog'],
    queryFn: () => api.get<{ data: SkillCatalogGroup[] }>(`/marketing-skills/catalog`, { token: token! }),
    enabled: !!token,
    select: (r) => r.data,
    staleTime: 1000 * 60 * 60, // catalog is static
  });
}

export function useRunSkill(companyId: string) {
  const token = useAuthStore((s) => s.token);
  return useMutation({
    mutationFn: (body: { skill: string; request: string }) =>
      api
        .post<{ data: RunSkillResult }>(`/marketing-skills/${companyId}/run`, body, { token: token! })
        .then((r) => r.data),
  });
}
