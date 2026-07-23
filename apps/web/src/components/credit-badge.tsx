'use client';

/**
 * Header credit balance badge — shown on every dashboard page when a
 * companyId is present in the route. Click to open a small popover with
 * balance breakdown and CTAs.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Gem, Mail, Wallet } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface CreditBalance {
  totalAvailable: number;
  monthlyBalance: number;
  topupBalance: number;
  rolloverBalance: number;
  monthlyGrant: number;
  plan: string;
  billingPeriodEnd: string | null;
}

interface CreditPlan {
  key: string;
  label: string;
  monthlyPriceCents: number;
  features?: string[];
}

interface CreditResponse {
  balance: CreditBalance;
  plan: CreditPlan;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

function humanCountdown(iso: string | null): string {
  if (!iso) return '—';
  const end = new Date(iso).getTime();
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return 'today';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const mins = Math.floor(diff / (1000 * 60));
  return `${mins} min${mins === 1 ? '' : 's'}`;
}

export function CreditBadge() {
  const params = useParams();
  const router = useRouter();
  const companyId = (params?.companyId as string | undefined) || undefined;
  const token = useAuthStore((s) => s.token);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  const { data, isError } = useQuery({
    queryKey: ['credits', companyId],
    queryFn: () =>
      api.get<CreditResponse>(`/credits/${companyId}`, { token: token! }),
    enabled: !!token && !!companyId,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!companyId || !token || isError || !data) return null;

  const { balance, plan } = data;
  const available = balance.totalAvailable;
  const grant = Math.max(balance.monthlyGrant, 1);
  const pct = (balance.monthlyBalance / grant) * 100;
  const used = Math.max(grant - balance.monthlyBalance, 0);
  const usedPct = Math.min(100, (used / grant) * 100);

  const isOut = available <= 0;
  const isCritical = pct < 10;
  const isLow = pct < 50 && !isCritical;

  const pillClass = isOut || isCritical
    ? 'text-red-700 bg-red-50 border-red-200 animate-pulse'
    : isLow
    ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-emerald-700 bg-emerald-50 border-emerald-200';

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-sm transition-colors',
          pillClass,
        )}
      >
        <Gem className="w-3.5 h-3.5" />
        {isOut ? 'Out of credits' : `${formatNumber(available)} credits`}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border shadow-xl p-4 z-50">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-slate-900">Credits</div>
            <Badge variant="secondary" className="text-xs">
              {plan?.label || balance.plan}
            </Badge>
          </div>

          <div className="mb-3">
            <div className="text-xs text-slate-500">Available</div>
            <div className="text-3xl font-bold text-slate-900 flex items-center gap-1.5">
              <Gem className="w-6 h-6 text-indigo-500" />
              {formatNumber(available)}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-[10px] uppercase text-slate-500">Monthly</div>
              <div className="text-sm font-semibold text-slate-900">
                {formatNumber(balance.monthlyBalance)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-[10px] uppercase text-slate-500">Top-up</div>
              <div className="text-sm font-semibold text-slate-900">
                {formatNumber(balance.topupBalance)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-[10px] uppercase text-slate-500">Rollover</div>
              <div className="text-sm font-semibold text-slate-900">
                {formatNumber(balance.rolloverBalance)}
              </div>
            </div>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
              <span>Used this period</span>
              <span>
                {formatNumber(used)} / {formatNumber(grant)}
              </span>
            </div>
            <Progress
              value={usedPct}
              indicatorClassName={
                isCritical ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
              }
            />
            <div className="text-[11px] text-slate-500 mt-1">
              Resets in {humanCountdown(balance.billingPeriodEnd)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setOpen(false);
                router.push(`/${companyId}/settings/credits`);
              }}
            >
              <Wallet className="w-3.5 h-3.5 mr-1" /> Usage
            </Button>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => {
                setOpen(false);
                window.location.href = 'mailto:support@1person.ai?subject=Add credits to my 1Person account';
              }}
            >
              <Mail className="w-3.5 h-3.5 mr-1" /> Support
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
