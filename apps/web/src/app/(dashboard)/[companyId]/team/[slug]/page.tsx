'use client';

/**
 * Employee DM — Block 3.
 *
 * Slack-style thread with one named employee. Each reply may carry
 * citations (semantic-search hits the employee leaned on) which the
 * founder can expand to verify what the answer was grounded in.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Send,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Quote,
} from 'lucide-react';
import { useEmployee, useSendMessage, type EmployeeChatMessage } from '@/lib/api/team-hooks';

const SOURCE_LABEL: Record<string, string> = {
  brand_iq: 'Brand IQ',
  knowledge_base: 'Knowledge base',
  blog_post: 'Blog post',
  gsc_query: 'Search Console',
  geo_mention: 'GEO mention',
  meeting: 'Meeting',
  manual: 'Manual note',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function CitationBlock({ citations }: { citations: EmployeeChatMessage['citations'] }) {
  const [open, setOpen] = useState(false);
  if (!citations || citations.length === 0) return null;
  return (
    <div className="mt-2 border-t pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Quote className="w-3 h-3" />
        Grounded on {citations.length} memory snippet{citations.length === 1 ? '' : 's'}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {citations.map((c, i) => (
            <div key={i} className="rounded bg-muted/60 p-2 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[9px]">
                  {SOURCE_LABEL[c.sourceType] ?? c.sourceType}
                </Badge>
                <span className="text-[10px] text-muted-foreground">score {c.score.toFixed(3)}</span>
              </div>
              <p className="text-muted-foreground leading-snug whitespace-pre-wrap break-words">
                {c.preview}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EmployeeChatPage() {
  const { companyId, slug } = useParams<{ companyId: string; slug: string }>();
  const { data: employee, isLoading } = useEmployee(companyId, slug);
  const send = useSendMessage(companyId, slug);
  const [draft, setDraft] = useState('');
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [employee?.thread?.length]);

  if (isLoading || !employee) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" /> Loading…
      </div>
    );
  }

  const submit = async () => {
    const txt = draft.trim();
    if (!txt) return;
    setDraft('');
    try {
      await send.mutateAsync(txt);
    } catch (e) {
      toast.error((e as Error).message || 'Failed to send');
      setDraft(txt); // restore so founder doesn't lose typing
    }
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto p-1">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/${companyId}/team`}>
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-3 h-3" /> Team
          </Button>
        </Link>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
          style={{ background: `${employee.accentColor}22` }}
        >
          {employee.avatarEmoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-lg">{employee.name}</div>
          <div className="text-xs text-muted-foreground">{employee.roleTitle}</div>
        </div>
      </div>

      {/* KPI strip */}
      {employee.kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {employee.kpis.map((k) => (
            <Card key={k.key}>
              <CardContent className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
                <div className="font-semibold text-base mt-0.5">{k.value || '—'}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Intro */}
      <Card className="bg-muted/30">
        <CardContent className="p-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p>{employee.intro}</p>
          </div>
        </CardContent>
      </Card>

      {/* Thread */}
      <Card className="flex flex-col" style={{ minHeight: 400 }}>
        <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '60vh' }}>
          {employee.thread.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-12">
              No messages yet. Say hi to {employee.name} 👋
            </p>
          )}
          {employee.thread.map((m, idx) => (
            <div
              key={idx}
              className={m.role === 'founder' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={
                  m.role === 'founder'
                    ? 'max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-sm'
                    : 'max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm'
                }
                style={
                  m.role === 'employee'
                    ? { background: `${employee.accentColor}11`, borderLeft: `3px solid ${employee.accentColor}` }
                    : undefined
                }
              >
                <div className="whitespace-pre-wrap break-words">{m.text}</div>
                <div
                  className={
                    'text-[10px] mt-1 ' +
                    (m.role === 'founder' ? 'text-primary-foreground/70' : 'text-slate-500')
                  }
                >
                  {formatTime(m.at)}
                </div>
                {m.role === 'employee' && <CitationBlock citations={m.citations} />}
              </div>
            </div>
          ))}
          {send.isPending && (
            <div className="flex justify-start">
              <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin inline-block mr-1" />
                {employee.name} is thinking…
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-3 flex gap-2 items-end">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={`Message ${employee.name}… (Enter to send, Shift+Enter for new line)`}
            rows={2}
            className="resize-none text-sm"
            disabled={send.isPending}
          />
          <Button
            onClick={submit}
            disabled={send.isPending || !draft.trim()}
            className="gap-1 self-stretch"
            style={{ background: employee.accentColor }}
          >
            {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </Card>
    </div>
  );
}
