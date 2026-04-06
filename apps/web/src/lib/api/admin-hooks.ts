import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '@/stores/auth-store';

function useToken() {
  return useAuthStore((s) => s.token);
}

// Dashboard
export function useAdminDashboard() {
  const token = useToken();
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.get<any>('/admin/dashboard', { token: token || undefined }),
    enabled: !!token,
  });
}

// Site Config
export function useAdminSiteConfig(section: string, locale: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['admin', 'site-config', section, locale],
    queryFn: () => api.get<any>(`/admin/site-config/${section}/${locale}`, { token: token || undefined }),
    enabled: !!token && !!section && !!locale,
  });
}

export function useAdminUpdateSiteConfig() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ section, locale, content }: { section: string; locale: string; content: any }) =>
      api.put(`/admin/site-config/${section}/${locale}`, { content }, { token: token || undefined }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'site-config', vars.section, vars.locale] });
    },
  });
}

// Users
export function useAdminUsers(filters?: { search?: string; role?: string; status?: string; limit?: number; offset?: number }) {
  const token = useToken();
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.role) params.set('role', filters.role);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();

  return useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: () => api.get<any>(`/admin/users${qs ? `?${qs}` : ''}`, { token: token || undefined }),
    enabled: !!token,
  });
}

export function useAdminUserStats() {
  const token = useToken();
  return useQuery({
    queryKey: ['admin', 'users', 'stats'],
    queryFn: () => api.get<any>('/admin/users/stats', { token: token || undefined }),
    enabled: !!token,
  });
}

export function useAdminChangeRole() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.patch(`/admin/users/${userId}/role`, { role }, { token: token || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useAdminChangeUserStatus() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...data }: { userId: string; approvalStatus?: string; isActive?: boolean }) =>
      api.patch(`/admin/users/${userId}/status`, data, { token: token || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

// Companies
export function useAdminCompanies(filters?: { status?: string; limit?: number; offset?: number }) {
  const token = useToken();
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();

  return useQuery({
    queryKey: ['admin', 'companies', filters],
    queryFn: () => api.get<any>(`/admin/companies${qs ? `?${qs}` : ''}`, { token: token || undefined }),
    enabled: !!token,
  });
}

export function useAdminCompanyStats() {
  const token = useToken();
  return useQuery({
    queryKey: ['admin', 'companies', 'stats'],
    queryFn: () => api.get<any>('/admin/companies/stats', { token: token || undefined }),
    enabled: !!token,
  });
}

export function useAdminChangeCompanyStatus() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, status }: { companyId: string; status: string }) =>
      api.patch(`/admin/companies/${companyId}/status`, { status }, { token: token || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'companies'] });
    },
  });
}

// Blog
export function useAdminBlogPosts() {
  const token = useToken();
  return useQuery({
    queryKey: ['admin', 'blog'],
    queryFn: () => api.get<any>('/blog/admin/posts', { token: token || undefined }),
    enabled: !!token,
  });
}

export function useAdminBlogPost(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['admin', 'blog', id],
    queryFn: () => api.get<any>(`/blog/admin/posts/${id}`, { token: token || undefined }),
    enabled: !!token && !!id,
  });
}

export function useAdminCreateBlogPost() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/blog/admin/posts', data, { token: token || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'blog'] }); },
  });
}

export function useAdminUpdateBlogPost() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      api.patch(`/blog/admin/posts/${id}`, data, { token: token || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'blog'] }); },
  });
}

export function useAdminDeleteBlogPost() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/blog/admin/posts/${id}`, { token: token || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'blog'] }); },
  });
}
