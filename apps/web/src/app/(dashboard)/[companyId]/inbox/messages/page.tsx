'use client';

/**
 * Inbox · Messages — Block 6 / Đợt 6 unified omnichannel message viewer.
 *
 * Lists all inbound + outbound messages across connected channels (FB
 * Messenger today; Zalo/WhatsApp/IG reserved). Each thread shows a
 * reply textarea so the founder can respond manually when AI auto-reply
 * is off.
 */

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Inbox, Loader2, Send, MessageCircle, Sparkles, User } from 'lucide-react';
import {
  useChannelConnections,
  useOmnichannelMessages,
  useReplyToMessage,
  type OmnichannelMessageRow,
} from '@/lib/api/channels-hooks';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const CHANNEL_LABEL: Record<string, string> = {
  fb_messenger: 'Messenger',
  zalo: 'Zalo',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
};

export default function InboxMessagesPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const connectionsQuery = useChannelConnections(companyId);
  const messagesQuery = useOmnichannelMessages(companyId);
  const reply = useReplyToMessage(companyId);

  const messages = messagesQuery.data ?? [];
  const connections = connectionsQuery.data ?? [];
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);

  // Group messages by thread (external_thread_id + connection)
  const threads = useMemo(() => {
    const map = new Map<string, OmnichannelMessageRow[]>();
    for (const m of messages) {
      const key = `${m.channelConnectionId}::${m.externalThreadId}`;
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    // Sort each thread chronologically, sort threads by latest message desc
    const out: Array<{ key: string; messages: OmnichannelMessageRow[] }> = [];
    Array.from(map.entries()).forEach(([key, arr]) => {
      arr.sort(
        (a: OmnichannelMessageRow, b: OmnichannelMessageRow) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      out.push({ key, messages: arr });
    });
    out.sort((a, b) => {
      const ta = new Date(a.messages[a.messages.length - 1]?.createdAt ?? 0).getTime();
      const tb = new Date(b.messages[b.messages.length - 1]?.createdAt ?? 0).getTime();
      return tb - ta;
    });
    return out;
  }, [messages]);

  const handleReply = async (msgId: string) => {
    const text = (replyText[msgId] ?? '').trim();
    if (!text) {
      toast.error('Type a reply first.');
      return;
    }
    try {
      await reply.mutateAsync({ id: msgId, text });
      toast.success('Reply sent');
      setReplyText((s) => ({ ...s, [msgId]: '' }));
      setActiveReplyId(null);
    } catch (e) {
      toast.error((e as Error).message || 'Failed to send reply');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-1">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Inbox className="w-6 h-6 text-primary" /> Inbox · Messages
        </h1>
        <p className="text-muted-foreground text-sm">
          Unified inbox across all connected channels. When AI auto-reply is off, you can respond manually here.
        </p>
      </div>

      {connections.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <MessageCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <div className="font-semibold text-slate-900">No channels connected yet</div>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Connect Facebook Messenger (or other channels when they go live) to start receiving messages here.
            </p>
            <a href={`/${companyId}/channels`} className="inline-block mt-4">
              <Button>Go to Channels →</Button>
            </a>
          </CardContent>
        </Card>
      )}

      {connections.length > 0 && messagesQuery.isLoading && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading messages…
        </div>
      )}

      {connections.length > 0 && !messagesQuery.isLoading && threads.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <div className="font-semibold text-slate-900">No messages yet</div>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Send a test message to your connected Page on Messenger — it will appear here within seconds.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {threads.map(({ key, messages: thread }) => {
          const head = thread[0]!;
          const last = thread[thread.length - 1]!;
          const senderName = thread.find((m) => m.direction === 'inbound')?.senderName || 'Unknown sender';
          return (
            <Card key={key}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    {senderName}
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {CHANNEL_LABEL[head.channel] || head.channel}
                    </Badge>
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">{timeAgo(last.createdAt)}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {thread.map((m) => (
                    <div
                      key={m.id}
                      className={
                        m.direction === 'inbound'
                          ? 'flex justify-start'
                          : 'flex justify-end'
                      }
                    >
                      <div
                        className={
                          m.direction === 'inbound'
                            ? 'max-w-[80%] rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm'
                            : 'max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-sm'
                        }
                      >
                        <div className="whitespace-pre-wrap break-words">{m.content}</div>
                        <div
                          className={
                            'text-[10px] mt-1 flex items-center gap-1 ' +
                            (m.direction === 'inbound' ? 'text-slate-500' : 'text-primary-foreground/70')
                          }
                        >
                          {m.aiHandled && (
                            <span className="flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5" /> AI
                            </span>
                          )}
                          <span>{timeAgo(m.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reply box — only on the latest inbound message */}
                {last.direction === 'inbound' && (
                  <div className="border-t pt-3 mt-2">
                    {activeReplyId === last.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={replyText[last.id] ?? ''}
                          onChange={(e) =>
                            setReplyText((s) => ({ ...s, [last.id]: e.target.value }))
                          }
                          placeholder="Type your reply…"
                          rows={2}
                          className="text-sm"
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActiveReplyId(null);
                              setReplyText((s) => ({ ...s, [last.id]: '' }));
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleReply(last.id)}
                            disabled={reply.isPending}
                            className="gap-1"
                          >
                            {reply.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Send className="w-3 h-3" />
                            )}
                            Send
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => setActiveReplyId(last.id)}
                      >
                        <Send className="w-3 h-3" /> Reply manually
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
