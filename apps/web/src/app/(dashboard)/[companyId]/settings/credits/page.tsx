'use client';

/**
 * Settings → Credits & Billing.
 *
 * Current plan, balance breakdown, and the most recent ledger entries —
 * the user-facing view of the credit system.
 */

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Wallet, Zap, Star, Gem, ArrowUpCircle, ExternalLink, KeyRound,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
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
  status?: string;
  byoKeyDiscount?: boolean;
}

interface CreditResponse {
  balance: CreditBalance;
  plan: CreditPlan;
}

interface Transaction {
  id: string;
  kind: 'debit' | 'grant' | 'topup' | 'refund';
  amount: number;
  balanceAfter: number;
  featureKey?: string;
  tier?: 'fast' | 'balanced' | 'premium';
  refKind?: string;
  refId?: string;
  createdAt: string;
  note?: string;
}

const FEATURE_LABELS: Record<string, string> = {
  campaign_banner_copy: 'Banner copywriting',
  campaign_social_post: 'Social post generation',
  brain_autoextract: 'Business Brain extraction',
  seo_content: 'SEO article writing',
  chatbot: 'Chatbot answer',
  banner_image: 'Banner image generation',
};

const TIER_ICONS: Record<string, { icon: typeof Zap; color: string }> = {
  fast: { icon: Zap, color: 'text-amber-600 bg-amber-50' },
  balanced: { icon: Star, color: 'text-indigo-600 bg-indigo-50' },
  premium: { icon: Gem, color: 'text-purple-600 bg-purple-50' },
};

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

export default function CreditsSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const token = useAuthStore((s) => s.token);

  const { data: creditsData, isLoading: loadingCredits } = useQuery({
    queryKey: ['credits', companyId],
    queryFn: () =>
      api.get<CreditResponse>(`/credits/${companyId}`, { token: token! }),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const { data: txData, isLoading: loadingTx } = useQuery({
    queryKey: ['credits-transactions', companyId],
    queryFn: () =>
      api.get<{ data: Transaction[] }>(
        `/credits/${companyId}/transactions?limit=50`,
        { token: token! },
      ),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const balance = creditsData?.balance;
  const plan = creditsData?.plan;
  const transactions = txData?.data ?? [];

  const grant = Math.max(balance?.monthlyGrant ?? 1, 1);
  const used = Math.max(grant - (balance?.monthlyBalance ?? 0), 0);
  const usedPct = Math.min(100, (used / grant) * 100);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Wallet className="w-6 h-6 text-indigo-500" /> Credits & Billing
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Manage your plan, balance, and see where every credit goes.
        </p>
      </div>

      {/* Section A — Current plan */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Current plan
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-bold text-slate-900">
                  {plan?.label || balance?.plan || 'Free'}
                </span>
                {plan?.status && (
                  <Badge variant="secondary" className="capitalize">
                    {plan.status}
                  </Badge>
                )}
                {plan?.byoKeyDiscount && (
                  <Badge className="bg-emerald-100 text-emerald-700 gap-1">
                    <KeyRound className="w-3 h-3" /> BYO key
                  </Badge>
                )}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                {plan ? formatCurrency(plan.monthlyPriceCents) : '$0'} / month
              </div>
              {balance?.billingPeriodEnd && (
                <div className="text-xs text-slate-500 mt-1">
                  Renews on {new Date(balance.billingPeriodEnd).toLocaleDateString()}
                </div>
              )}
            </div>
            <Button
              onClick={() => router.push('/pricing')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
            >
              <ArrowUpCircle className="w-4 h-4" /> Change plan
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section B — Balance */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Balance</h2>
        {loadingCredits ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="h-28 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-28 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-28 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Available
                </div>
                <div className="text-3xl font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                  <Gem className="w-6 h-6 text-indigo-500" />
                  {formatNumber(balance?.totalAvailable ?? 0)}
                </div>
                <div className="text-xs text-slate-500 mt-1">All buckets combined</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Monthly
                </div>
                <div className="text-3xl font-bold text-slate-900 mt-1">
                  {formatNumber(balance?.monthlyBalance ?? 0)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Resets each billing period
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Top-up
                </div>
                <div className="text-3xl font-bold text-slate-900 mt-1">
                  {formatNumber(balance?.topupBalance ?? 0)}
                </div>
                <div className="text-xs text-slate-500 mt-1">Never expires</div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="mt-3">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-600">Used this period</span>
              <span className="font-medium text-slate-900">
                {formatNumber(used)} / {formatNumber(grant)}
              </span>
            </div>
            <Progress
              value={usedPct}
              indicatorClassName={
                usedPct > 90
                  ? 'bg-red-500'
                  : usedPct > 50
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }
            />
            <div className="flex justify-end mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push('/pricing#topup')}
                className="gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" /> Top up
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section C — Usage history */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Usage history</h2>
        <Card>
          <CardContent className="p-0">
            {loadingTx ? (
              <div className="p-6 space-y-2">
                <div className="h-8 bg-slate-100 rounded animate-pulse" />
                <div className="h-8 bg-slate-100 rounded animate-pulse" />
                <div className="h-8 bg-slate-100 rounded animate-pulse" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No usage yet. Generate your first campaign to see credits spent.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left px-4 py-2">Date</th>
                      <th className="text-left px-4 py-2">Action</th>
                      <th className="text-left px-4 py-2">Tier</th>
                      <th className="text-right px-4 py-2">Amount</th>
                      <th className="text-right px-4 py-2">Balance</th>
                      <th className="text-right px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => {
                      const label = tx.featureKey
                        ? FEATURE_LABELS[tx.featureKey] ?? tx.featureKey
                        : tx.note || tx.kind;
                      const isDebit = tx.kind === 'debit';
                      const tierInfo = tx.tier ? TIER_ICONS[tx.tier] : null;
                      const TIcon = tierInfo?.icon;
                      const showTrace = tx.refKind === 'llm_call' && tx.refId;
                      return (
                        <tr key={tx.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                            {relativeTime(tx.createdAt)}
                          </td>
                          <td className="px-4 py-2 text-slate-900">{label}</td>
                          <td className="px-4 py-2">
                            {tierInfo && TIcon ? (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                                  tierInfo.color,
                                )}
                              >
                                <TIcon className="w-3 h-3" />
                                {tx.tier}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td
                            className={cn(
                              'px-4 py-2 text-right font-mono font-medium',
                              isDebit ? 'text-red-600' : 'text-emerald-600',
                            )}
                          >
                            {isDebit ? '-' : '+'}
                            {formatNumber(tx.amount)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-slate-600">
                            {formatNumber(tx.balanceAfter)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {showTrace && (
                              <a
                                href={`http://localhost:5050/project/1person-main/traces/${tx.refId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5"
                              >
                                Why? <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
