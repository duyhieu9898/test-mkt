'use client';

/**
 * Admin · Setup Readiness — checklist of what's configured vs. what
 * still needs founder action so platform features work end-to-end.
 *
 * Categories grouped: LLM · Search · Image · Video · Payments · Email ·
 * Channels · Observability. Each item shows status + detail + a "Fix"
 * button that deep-links into the right admin sub-page.
 */

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Wrench,
  Loader2,
  RefreshCw,
  Brain,
  Search,
  Image as ImageIcon,
  Video,
  CreditCard,
  Mail,
  MessageCircle,
  Shield,
} from 'lucide-react';
import {
  useSetupReadiness,
  type ReadinessItem,
  type ReadinessCategory,
  type ReadinessStatus,
} from '@/lib/api/setup-hooks';
import { useQueryClient } from '@tanstack/react-query';

const CATEGORY_LABEL: Record<ReadinessCategory, { label: string; icon: typeof Brain }> = {
  llm: { label: 'LLM Providers', icon: Brain },
  search: { label: 'Search & SEO', icon: Search },
  image: { label: 'Image Generation', icon: ImageIcon },
  video: { label: 'Video Generation', icon: Video },
  payments: { label: 'Payments', icon: CreditCard },
  email: { label: 'Email Delivery', icon: Mail },
  channels: { label: 'Messaging Channels', icon: MessageCircle },
  observability: { label: 'Security & Observability', icon: Shield },
};

const STATUS_META: Record<
  ReadinessStatus,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  ok: { label: 'Configured', color: 'text-emerald-600', icon: CheckCircle2 },
  warn: { label: 'Optional / partial', color: 'text-amber-600', icon: AlertTriangle },
  missing: { label: 'Missing — required', color: 'text-rose-600', icon: XCircle },
};

function StatusBadge({ status }: { status: ReadinessStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={`gap-1 ${meta.color} border-current/40 bg-current/5`}
    >
      <Icon className="w-3 h-3" /> {meta.label}
    </Badge>
  );
}

function ItemCard({ item }: { item: ReadinessItem }) {
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
            {item.label}
            <StatusBadge status={item.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {item.helpUrl && (
            <a
              href={item.helpUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 underline-offset-2 hover:underline"
            >
              Docs <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {item.status !== 'ok' && (
            <Link href={item.fixHref}>
              <Button size="sm" variant="outline" className="gap-1 h-7">
                <Wrench className="w-3 h-3" /> Configure
              </Button>
            </Link>
          )}
        </div>
      </div>
      {item.enables.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium">Enables:</span> {item.enables.join(' · ')}
        </p>
      )}
    </div>
  );
}

export default function AdminSetupPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, isFetching } = useSetupReadiness();

  if (isLoading) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" /> Checking platform readiness…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="py-20 text-center text-sm text-rose-600">
        Failed to load readiness report.
      </div>
    );
  }

  // Group by category
  const grouped = data.items.reduce<Record<ReadinessCategory, ReadinessItem[]>>(
    (acc, item) => {
      (acc[item.category] = acc[item.category] || []).push(item);
      return acc;
    },
    {} as Record<ReadinessCategory, ReadinessItem[]>,
  );

  const scoreColor =
    data.score >= 80 ? 'text-emerald-600' : data.score >= 50 ? 'text-amber-600' : 'text-rose-600';

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-1">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Setup Readiness</h1>
          <p className="text-muted-foreground text-sm">
            What still needs configuration so every platform feature actually works for your founders.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'setup', 'readiness'] })}
          disabled={isFetching}
          className="gap-1"
        >
          {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Re-check
        </Button>
      </div>

      {/* Score card */}
      <Card>
        <CardContent className="p-5 flex items-center gap-6 flex-wrap">
          <div className="flex items-baseline gap-2">
            <div className={`text-5xl font-bold tabular-nums ${scoreColor}`}>{data.score}</div>
            <div className="text-2xl text-muted-foreground">/100</div>
          </div>
          <div className="flex-1 min-w-[200px] space-y-2">
            <Progress value={data.score} className="h-2" />
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3 h-3" /> {data.summary.ok} OK
              </span>
              <span className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="w-3 h-3" /> {data.summary.warn} optional/partial
              </span>
              <span className="flex items-center gap-1 text-rose-600">
                <XCircle className="w-3 h-3" /> {data.summary.missing} required missing
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Re-checked every 30s. Last refresh: {new Date(data.generatedAt).toLocaleTimeString()}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Required-missing first if any */}
      {data.summary.missing > 0 && (
        <Card className="border-rose-200 bg-rose-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-rose-700">
              <XCircle className="w-4 h-4" /> Required configuration missing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.items
              .filter((i) => i.status === 'missing')
              .map((i) => (
                <ItemCard key={i.id} item={i} />
              ))}
          </CardContent>
        </Card>
      )}

      {/* By category */}
      {(Object.keys(CATEGORY_LABEL) as ReadinessCategory[]).map((cat) => {
        const items = grouped[cat] ?? [];
        if (items.length === 0) return null;
        const { label, icon: Icon } = CATEGORY_LABEL[cat];
        return (
          <Card key={cat}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Icon className="w-4 h-4 text-muted-foreground" /> {label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((i) => (
                <ItemCard key={i.id} item={i} />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
