'use client';

/**
 * Admin — Credit Usage Monitoring
 *
 * Cross-tenant view of credit economics. Auto-refreshes every 30s and
 * lets admins issue manual grants (topup / refund / grant) from the
 * top-spenders table.
 */

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Users,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Wallet,
  Zap,
  RefreshCw,
  Loader2,
  Save,
  ArrowUpDown,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { friendlyError } from '@/lib/friendly-errors';

interface TopSpender {
  tenantId: string;
  tenantName: string | null;
  plan: string | null;
  available: number;
  spent30d: number;
}

interface MonitoringOverview {
  tenants: { total: number; lowBalance: number };
  credits: { spent30d: number; granted30d: number };
  topSpenders: TopSpender[];
}

type SortDir = 'asc' | 'desc';

function StatCard({
  icon: Icon,
  label,
  value,
  description,
  tone = 'neutral',
}: {
  icon: any;
  label: string;
  value: string | number;
  description?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const tones = {
    good: { ring: 'border-emerald-200', icon: 'text-emerald-600', bg: 'bg-emerald-50' },
    warn: { ring: 'border-amber-200', icon: 'text-amber-600', bg: 'bg-amber-50' },
    bad: { ring: 'border-red-200', icon: 'text-red-600', bg: 'bg-red-50' },
    neutral: { ring: 'border-gray-200', icon: 'text-gray-600', bg: 'bg-gray-50' },
  }[tone];
  return (
    <Card className={`border ${tones.ring}`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`p-2.5 rounded-lg ${tones.bg}`}>
            <Icon className={`w-5 h-5 ${tones.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-3xl font-bold text-slate-900">{value}</p>
            {description && (
              <p className="text-xs text-slate-500 mt-1">{description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CreditMonitoringPage() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [granting, setGranting] = useState<TopSpender | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading, dataUpdatedAt, isFetching, refetch } = useQuery<MonitoringOverview>({
    queryKey: ['admin', 'credit-monitoring'],
    queryFn: () =>
      api.get<MonitoringOverview>('/admin/credits/monitoring/overview', {
        token: token || undefined,
      }),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const sortedSpenders = useMemo(() => {
    const list = data?.topSpenders ?? [];
    return list.slice().sort((a, b) =>
      sortDir === 'desc' ? b.spent30d - a.spent30d : a.spent30d - b.spent30d,
    );
  }, [data, sortDir]);

  const lastRefreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : '—';

  const lowBalanceCount = data?.tenants.lowBalance ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-indigo-500" />
            Credit Usage Monitoring
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Cross-tenant view of credit economics. Auto-refreshes every 30s.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>Last refreshed: {lastRefreshed}</span>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg hover:bg-slate-100 transition"
            title="Refresh now"
          >
            <RefreshCw
              className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total tenants"
          value={isLoading ? '—' : (data?.tenants.total ?? 0).toLocaleString()}
          description="Workspaces on the platform"
          tone="neutral"
        />
        <StatCard
          icon={AlertCircle}
          label="Low balance"
          value={isLoading ? '—' : lowBalanceCount.toLocaleString()}
          description="Tenants under 10% of monthly grant"
          tone={lowBalanceCount > 0 ? 'bad' : 'good'}
        />
        <StatCard
          icon={TrendingDown}
          label="Credits spent (30d)"
          value={isLoading ? '—' : (data?.credits.spent30d ?? 0).toLocaleString()}
          description="Total debits in last 30 days"
          tone="neutral"
        />
        <StatCard
          icon={Zap}
          label="Credits granted (30d)"
          value={isLoading ? '—' : (data?.credits.granted30d ?? 0).toLocaleString()}
          description="Total grants + top-ups in last 30 days"
          tone="good"
        />
      </div>

      {/* Top spenders table */}
      <Card>
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Top spenders (30 days)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Highest credit consumers — issue manual grants for support or refunds.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : sortedSpenders.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No tenant activity yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="text-left px-5 py-3">Tenant</th>
                  <th className="text-left px-5 py-3">Plan</th>
                  <th className="text-right px-5 py-3">
                    <span className="inline-flex items-center gap-1">
                      <Wallet className="w-3.5 h-3.5" /> Available
                    </span>
                  </th>
                  <th className="text-right px-5 py-3">
                    <button
                      onClick={() =>
                        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                      }
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Spent (30d)
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  </th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedSpenders.map((t) => (
                  <tr
                    key={t.tenantId}
                    className="border-t hover:bg-slate-50/50"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">
                        {t.tenantName || '(unnamed)'}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400 truncate max-w-[220px]">
                        {t.tenantId}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {t.plan ?? 'free'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-slate-700">
                      {Number(t.available ?? 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-indigo-600">
                      {Number(t.spent30d ?? 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGranting(t)}
                        className="gap-1.5"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        Grant
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <GrantDialog
        spender={granting}
        onClose={() => setGranting(null)}
        token={token}
        onSaved={() => {
          setGranting(null);
          qc.invalidateQueries({ queryKey: ['admin', 'credit-monitoring'] });
        }}
      />
    </div>
  );
}

// ─── Grant dialog ────────────────────────────────────────────────────

function GrantDialog({
  spender,
  onClose,
  token,
  onSaved,
}: {
  spender: TopSpender | null;
  onClose: () => void;
  token: string | null;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState<number>(100);
  const [kind, setKind] = useState<'grant' | 'topup' | 'refund'>('grant');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  if (!spender) return null;

  const onSave = async () => {
    if (!token) return;
    if (!amount || amount <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }
    setSaving(true);
    try {
      await api.post(
        `/admin/credits/grant/${spender.tenantId}`,
        { amount: Number(amount), kind, note: note || undefined },
        { token },
      );
      toast.success(
        `Granted ${amount} credits to ${spender.tenantName || 'tenant'}`,
      );
      setAmount(100);
      setKind('grant');
      setNote('');
      onSaved();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!spender} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-indigo-500" />
            Grant credits
          </DialogTitle>
          <DialogDescription>
            Issue credits to{' '}
            <strong>{spender.tenantName || '(unnamed)'}</strong>. This is
            logged in the audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="mb-1.5 block">Amount</Label>
            <Input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>

          <div>
            <Label className="mb-1.5 block">Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grant">Grant (one-time gift)</SelectItem>
                <SelectItem value="topup">Top-up (paid purchase)</SelectItem>
                <SelectItem value="refund">Refund</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block">Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for this grant (shown in audit log)"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Grant credits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
