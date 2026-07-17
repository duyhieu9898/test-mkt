/**
 * React Query hooks for Block 6 / Đợt 6 omnichannel routes.
 *
 * The omnichannel surface is its own per-company connection layer (separate
 * from the chatbot's `chatbotChannels` which attach a deployed bot to a
 * widget/page). Tokens are encrypted server-side and never returned in plain.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '@/stores/auth-store';

export type OmniChannel = 'fb_messenger' | 'zalo' | 'whatsapp' | 'instagram';
export type OmniConnectionStatus = 'active' | 'paused' | 'disconnected';

export interface ChannelConnectionRow {
  id: string;
  companyId: string;
  channel: OmniChannel;
  status: OmniConnectionStatus;
  aiAutoReply: boolean;
  connectedAt: string;
  lastMessageAt: string | null;
  config: {
    pageId?: string;
    pageName?: string;
    appId?: string;
    verifyTokenPreview?: string | null;
    hasAccessToken?: boolean;
    publishingEnabled?: boolean;
    messagingEnabled?: boolean;
  };
}

export interface OmnichannelMessageRow {
  id: string;
  companyId: string;
  channelConnectionId: string;
  channel: OmniChannel;
  externalThreadId: string;
  externalMessageId: string | null;
  direction: 'inbound' | 'outbound';
  senderExternalId: string | null;
  senderName: string | null;
  content: string;
  attachments: Array<Record<string, unknown>>;
  aiHandled: boolean;
  receivedAt: string | null;
  sentAt: string | null;
  status: 'received' | 'replied' | 'pending_human' | 'failed';
  createdAt: string;
}

export interface FacebookPageOption {
  id: string;
  name: string;
  pictureUrl?: string;
  canPublish: boolean;
}

export function useChannelConnections(companyId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['omnichannel', 'connections', companyId],
    queryFn: () => api.get<{ data: ChannelConnectionRow[] }>(`/omnichannel/company/${companyId}`, { token: token! }),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useStartFacebookOAuth(companyId: string) {
  const token = useAuthStore((s) => s.token);
  return useMutation({
    mutationFn: () =>
      api.post<{ url: string }>(
        `/omnichannel/company/${companyId}/facebook/oauth/start`,
        {},
        { token: token! },
      ),
  });
}

export function useSelectFacebookPage(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { pageId: string; session: string }) =>
      api.post<ChannelConnectionRow>(
        `/omnichannel/company/${companyId}/facebook/oauth/select`,
        body,
        { token: token! },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['omnichannel', 'connections', companyId] });
      qc.invalidateQueries({ queryKey: ['distribution', 'connections', companyId] });
    },
  });
}

export function useDisconnectChannel(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: true }>(`/omnichannel/${id}`, { token: token! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['omnichannel', 'connections', companyId] });
    },
  });
}

export function useToggleAiAutoReply(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch<ChannelConnectionRow>(`/omnichannel/${id}/ai-auto-reply`, { enabled }, { token: token! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['omnichannel', 'connections', companyId] });
    },
  });
}

export function useOmnichannelMessages(companyId: string, channelConnectionId?: string) {
  const token = useAuthStore((s) => s.token);
  const query = channelConnectionId ? `?channelConnectionId=${channelConnectionId}` : '';
  return useQuery({
    queryKey: ['omnichannel', 'messages', companyId, channelConnectionId ?? 'all'],
    queryFn: () => api.get<{ data: OmnichannelMessageRow[] }>(`/omnichannel/company/${companyId}/messages${query}`, { token: token! }),
    enabled: !!token && !!companyId,
    select: (r) => r.data,
  });
}

export function useReplyToMessage(companyId: string) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.post<{ data: OmnichannelMessageRow }>(`/omnichannel/messages/${id}/reply`, { text }, { token: token! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['omnichannel', 'messages', companyId] });
    },
  });
}
