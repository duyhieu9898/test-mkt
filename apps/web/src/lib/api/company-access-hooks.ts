import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '@/stores/auth-store';
import type { CompanyAssignableRole, CompanyRole } from '@/lib/company-access';

export interface CompanyAccessRole {
  role: CompanyRole;
  label: string;
  description: string;
  permissions: string[];
}

export interface MyCompanyAccess {
  company: { id: string; name: string };
  role: CompanyRole;
  roleLabel: string;
  roleDescription: string;
  permissions: string[];
  isOwner: boolean;
  isPlatformAdmin: boolean;
  canManageMembers: boolean;
  roles: CompanyAccessRole[];
}

export interface CompanyMember {
  id: string;
  companyId: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  };
  role: CompanyRole;
  roleLabel: string;
  status: 'active' | 'suspended' | 'removed';
  isOwner: boolean;
  editable: boolean;
  creditsUsed?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyMembersResponse {
  roles: CompanyAccessRole[];
  members: CompanyMember[];
}

export function useMyCompanyAccess(companyId?: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['company-access', companyId, 'me'],
    queryFn: () => api.get<MyCompanyAccess>(`/access/company/${companyId}/me`, { token: token! }),
    enabled: !!token && !!companyId,
    staleTime: 30_000,
  });
}

export function useCompanyMembers(companyId?: string) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ['company-access', companyId, 'members'],
    queryFn: () => api.get<CompanyMembersResponse>(`/access/company/${companyId}/members`, { token: token! }),
    enabled: !!token && !!companyId,
  });
}

export function useAddCompanyMember(companyId: string) {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; role: CompanyAssignableRole }) =>
      api.post<{ member: CompanyMember }>(`/access/company/${companyId}/members`, data, { token: token! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-access', companyId, 'members'] });
    },
  });
}

export function useUpdateCompanyMember(companyId: string) {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { memberId: string; role?: CompanyAssignableRole; status?: 'active' | 'suspended' }) =>
      api.patch(`/access/company/${companyId}/members/${data.memberId}`, {
        role: data.role,
        status: data.status,
      }, { token: token! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-access', companyId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['company-access', companyId, 'me'] });
    },
  });
}

export function useRemoveCompanyMember(companyId: string) {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`/access/company/${companyId}/members/${memberId}`, { token: token! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-access', companyId, 'members'] });
    },
  });
}
