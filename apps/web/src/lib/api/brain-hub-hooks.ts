/**
 * Brain Hub hooks (Phase A).
 *
 * Wraps the /brain-hub API surface — sources, events, semantic search,
 * analytics, upload, bulk import.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';

export interface BrainSource {
  id: string;
  companyId: string;
  name: string;
  type: 'manual_upload' | 'bulk_import' | 'oauth_api' | 'webhook_inbound' | 'internal_tap' | 'polling_feed';
  subtype: string | null;
  config: Record<string, unknown>;
  status: 'active' | 'paused' | 'error';
  lastSyncedAt: string | null;
  lastError: string | null;
  eventCount: { total: number; last7d: number };
  createdAt: string;
  updatedAt: string;
}

export interface BrainEvent {
  id: string;
  sourceId: string;
  type: string;
  subject: string;
  content: string;
  topicTags: string[];
  sentiment: string | null;
  occurredAt: string;
  ingestedAt?: string;
}

export interface BrainSearchHit extends BrainEvent {
  score: number;
}

export interface AdapterDescriptor {
  type: BrainSource['type'];
  label: string;
  description: string;
  userCreatable: boolean;
  defaultEventType: string;
  phase: 'A' | 'B' | 'C';
}

export interface BrainSummary {
  totalEvents: number;
  eventsLast7d: number;
  sentimentBreakdown7d: Record<string, number>;
  eventsBySourceType7d: Record<string, number>;
}

const keys = {
  sources: (companyId: string) => ['brain-hub-sources', companyId] as const,
  events: (companyId: string, filters: Record<string, string | undefined>) =>
    ['brain-hub-events', companyId, filters] as const,
  summary: (companyId: string) => ['brain-hub-summary', companyId] as const,
  topTopics: (companyId: string, days: number) => ['brain-hub-top-topics', companyId, days] as const,
  adapters: () => ['brain-hub-adapters'] as const,
};

export function useBrainAdapters() {
  return useQuery({
    queryKey: keys.adapters(),
    queryFn: () => api.get<{ data: AdapterDescriptor[] }>('/brain-hub/adapters'),
    select: (r) => r.data,
    staleTime: 60 * 60 * 1000,
  });
}

export function useBrainSources(companyId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.sources(companyId),
    queryFn: () =>
      api.get<{ data: BrainSource[] }>(`/brain-hub/${companyId}/sources`, { token: token! }),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useBrainEvents(
  companyId: string,
  filters: { sourceId?: string; type?: string; sentiment?: string; topicTag?: string; limit?: number } = {},
) {
  const token = useAuthStore((s) => s.token);
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  return useQuery({
    queryKey: keys.events(companyId, filters as Record<string, string | undefined>),
    queryFn: () =>
      api.get<{ data: BrainEvent[] }>(
        `/brain-hub/${companyId}/events${qs.toString() ? '?' + qs.toString() : ''}`,
        { token: token! },
      ),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useBrainSummary(companyId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.summary(companyId),
    queryFn: () =>
      api.get<{ data: BrainSummary }>(`/brain-hub/${companyId}/analytics/summary`, { token: token! }),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useBrainTopTopics(companyId: string, days = 7) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: keys.topTopics(companyId, days),
    queryFn: () =>
      api.get<{ data: Array<{ tag: string; count: number }> }>(
        `/brain-hub/${companyId}/analytics/top-topics?days=${days}`,
        { token: token! },
      ),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useSemanticSearch(companyId: string) {
  const token = useAuthStore((s) => s.token);
  return useMutation({
    mutationFn: (query: string) =>
      api.post<{ data: BrainSearchHit[] }>(
        `/brain-hub/${companyId}/events/search`,
        { query, limit: 12 },
        { token: token! },
      ),
  });
}

export function useBulkImport(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      text: string;
      mode?: 'single' | 'lines' | 'csv' | 'double-newline';
    }) => api.post(`/brain-hub/${companyId}/bulk-import`, body, { token: token! }),
    onSuccess: () => invalidateAll(qc, companyId),
  });
}

export function useDeleteSource(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) =>
      api.delete(`/brain-hub/${companyId}/sources/${sourceId}`, { token: token! }),
    onSuccess: () => invalidateAll(qc, companyId),
  });
}

export function usePatchSource(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; status?: 'active' | 'paused' | 'error' }) =>
      api.patch(`/brain-hub/${companyId}/sources/${id}`, body, { token: token! }),
    onSuccess: () => invalidateAll(qc, companyId),
  });
}

/**
 * Multipart upload — bypasses the JSON `api` client because it sets a
 * Content-Type header that breaks multipart boundary detection.
 */
export function useUploadFile(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, sourceName }: { file: File; sourceName?: string }) => {
      const fd = new FormData();
      fd.append('file', file);
      if (sourceName) fd.append('sourceName', sourceName);
      const res = await fetch(`${API_URL}/brain-hub/${companyId}/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(err.error?.message || err.message || 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => invalidateAll(qc, companyId),
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>, companyId: string): void {
  qc.invalidateQueries({ queryKey: keys.sources(companyId) });
  qc.invalidateQueries({ queryKey: ['brain-hub-events', companyId] });
  qc.invalidateQueries({ queryKey: keys.summary(companyId) });
  qc.invalidateQueries({ queryKey: ['brain-hub-top-topics', companyId] });
  qc.invalidateQueries({ queryKey: ['brain-hub-reactions', companyId] });
}

/* ─── Phase B: Watchers + Reactions ───────────────────────────── */

export interface BrainWatcher {
  id: string;
  slug: string;
  name: string;
  description: string;
  condition: {
    kind: 'recurring_topic' | 'event_spike' | 'keyword_match';
    minOccurrences?: number;
    minCount?: number;
    minMatches?: number;
    windowHours: number;
    sentiment?: string;
    sourceSubtypes?: string[];
    type?: string;
    phrases?: string[];
  };
  actions: Array<{ type: 'notify' | 'chatbot_faq_draft' | 'blog_draft_launcher'; params?: Record<string, unknown> }>;
  cooldownHours: number;
  autoMode: 'review' | 'auto_high_conf';
  status: 'active' | 'paused' | 'error';
  lastFiredAt: string | null;
  fireCount: number;
}

export interface ReactionDraftHook {
  actionType: 'notify' | 'chatbot_faq_draft' | 'blog_draft_launcher';
  title: string;
  body: string;
  confidence: number;
  followUp?: { label: string; href?: string; launchId?: string };
}

export interface BrainReaction {
  id: string;
  watcherId: string;
  groupKey: string;
  headline: string;
  summary: string | null;
  drafts: ReactionDraftHook[];
  triggerEventIds: string[];
  status: 'suggested' | 'approved' | 'published' | 'dismissed' | 'expired';
  firedAt: string;
  reviewedAt: string | null;
  expiresAt: string | null;
}

const phaseBKeys = {
  watchers: (companyId: string) => ['brain-hub-watchers', companyId] as const,
  reactions: (companyId: string, status?: string) =>
    ['brain-hub-reactions', companyId, status ?? 'all'] as const,
  reactionEvents: (companyId: string, reactionId: string) =>
    ['brain-hub-reaction-events', companyId, reactionId] as const,
};

export function useBrainWatchers(companyId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: phaseBKeys.watchers(companyId),
    queryFn: () =>
      api.get<{ data: BrainWatcher[] }>(`/brain-hub/${companyId}/watchers`, { token: token! }),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function usePatchWatcher(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      status?: 'active' | 'paused';
      autoMode?: 'review' | 'auto_high_conf';
      cooldownHours?: number;
      name?: string;
    }) => api.patch(`/brain-hub/${companyId}/watchers/${id}`, body, { token: token! }),
    onSuccess: () => qc.invalidateQueries({ queryKey: phaseBKeys.watchers(companyId) }),
  });
}

export function useRunAllWatchers(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ data: { checked: number; fired: number } }>(
        `/brain-hub/${companyId}/watchers/run-all`,
        {},
        { token: token! },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: phaseBKeys.watchers(companyId) });
      qc.invalidateQueries({ queryKey: ['brain-hub-reactions', companyId] });
    },
  });
}

export function useBrainReactions(companyId: string, status?: BrainReaction['status']) {
  const token = useAuthStore((s) => s.token);
  const qs = status ? `?status=${status}` : '';
  return useQuery({
    queryKey: phaseBKeys.reactions(companyId, status),
    queryFn: () =>
      api.get<{ data: BrainReaction[] }>(`/brain-hub/${companyId}/reactions${qs}`, {
        token: token!,
      }),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useReactionEvents(companyId: string, reactionId: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: phaseBKeys.reactionEvents(companyId, reactionId ?? ''),
    queryFn: () =>
      api.get<{ data: BrainEvent[] }>(`/brain-hub/${companyId}/reactions/${reactionId}/events`, {
        token: token!,
      }),
    enabled: !!token && !!companyId && !!reactionId,
    select: (r) => r.data,
  });
}

export function useApproveReaction(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reactionId: string) =>
      api.post<{ data: { status: string; drafts: ReactionDraftHook[]; followUps: Array<{ label: string; href?: string; launchId?: string }> } }>(
        `/brain-hub/${companyId}/reactions/${reactionId}/approve`,
        {},
        { token: token! },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brain-hub-reactions', companyId] }),
  });
}

export function useDismissReaction(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reactionId: string) =>
      api.post(`/brain-hub/${companyId}/reactions/${reactionId}/dismiss`, {}, { token: token! }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brain-hub-reactions', companyId] }),
  });
}
