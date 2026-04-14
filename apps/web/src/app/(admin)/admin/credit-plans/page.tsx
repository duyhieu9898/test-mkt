'use client';

/**
 * Admin — Subscription Plans
 *
 * Configure pricing tiers and credit allocations (Phase B-4). All 5 plans
 * (free, pro, team, business, enterprise) are rendered as cards; clicking
 * Edit opens a dialog that PUTs /admin/credits/plans/:key.
 */

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Wallet,
  Pencil,
  Loader2,
  Save,
  Check,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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

interface CreditPlan {
  key: string;
  label: string;
  description: string | null;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  monthlyGrant: number;
  rolloverMonths: number;
  seats: number;
  byoKeyDiscountPct: number;
  features: string[];
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
  enabled: boolean;
  sortOrder: number;
}

const PLAN_ACCENTS: Record<string, string> = {
  free: 'border-slate-200',
  pro: 'border-indigo-200 bg-indigo-50/30',
  team: 'border-emerald-200 bg-emerald-50/30',
  business: 'border-purple-200 bg-purple-50/30',
  enterprise: 'border-amber-200 bg-amber-50/30',
};

function formatPrice(cents: number) {
  if (!cents) return '$0';
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function yearlyDiscount(monthlyCents: number, yearlyCents: number) {
  if (!monthlyCents || !yearlyCents) return 0;
  const fullYear = monthlyCents * 12;
  const saved = fullYear - yearlyCents;
  if (saved <= 0) return 0;
  return Math.round((saved / fullYear) * 100);
}

export default function CreditPlansPage() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CreditPlan | null>(null);
  const [seeding, setSeeding] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'credit-plans'],
    queryFn: () =>
      api.get<{ data: CreditPlan[] }>('/admin/credits/plans', {
        token: token || undefined,
      }),
    enabled: !!token,
  });

  const plans = (data?.data ?? []).slice().sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );

  const onSeed = async () => {
    if (!token) return;
    setSeeding(true);
    try {
      await api.post('/admin/credits/plans/seed', {}, { token });
      toast.success('Default plans seeded');
      qc.invalidateQueries({ queryKey: ['admin', 'credit-plans'] });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSeeding(false);
    }
  };

  const onToggleEnabled = async (plan: CreditPlan, enabled: boolean) => {
    if (!token) return;
    try {
      await api.put(`/admin/credits/plans/${plan.key}`, { enabled }, { token });
      qc.invalidateQueries({ queryKey: ['admin', 'credit-plans'] });
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-indigo-500" />
            Subscription Plans
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Configure pricing tiers and credit allocations. Changes apply to
            new signups immediately.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSeed}
            disabled={seeding}
            className="gap-2"
          >
            {seeding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Seed defaults
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-16 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading plans…
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-slate-500">
            No plans configured yet. Click{' '}
            <strong>Seed defaults</strong> to create the 5 default tiers.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const discount = yearlyDiscount(
              plan.monthlyPriceCents,
              plan.yearlyPriceCents,
            );
            return (
              <Card
                key={plan.key}
                className={`${PLAN_ACCENTS[plan.key] ?? 'border-slate-200'} ${
                  !plan.enabled ? 'opacity-60' : ''
                }`}
              >
                <CardContent className="p-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-900">
                          {plan.label}
                        </h3>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {plan.key}
                        </Badge>
                      </div>
                      {plan.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {plan.description}
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={plan.enabled}
                      onCheckedChange={(checked) =>
                        onToggleEnabled(plan, checked)
                      }
                    />
                  </div>

                  {/* Price */}
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-slate-900">
                        {formatPrice(plan.monthlyPriceCents)}
                      </span>
                      <span className="text-sm text-slate-500">/mo</span>
                    </div>
                    {plan.yearlyPriceCents > 0 && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatPrice(plan.yearlyPriceCents)}/yr
                        {discount > 0 && (
                          <span className="text-emerald-600 font-medium">
                            {' '}
                            (−{discount}%)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Grant + seats */}
                  <div className="space-y-1.5 text-sm text-slate-700">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span>
                        <strong>{plan.monthlyGrant.toLocaleString()}</strong>{' '}
                        credits/month
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span>
                        {plan.seats} {plan.seats === 1 ? 'seat' : 'seats'}
                      </span>
                    </div>
                    {plan.rolloverMonths > 0 && (
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500" />
                        <span>
                          Rollover {plan.rolloverMonths}{' '}
                          {plan.rolloverMonths === 1 ? 'month' : 'months'}
                        </span>
                      </div>
                    )}
                    {plan.byoKeyDiscountPct > 0 && (
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500" />
                        <span>
                          {plan.byoKeyDiscountPct}% off with own API key
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Features */}
                  {plan.features && plan.features.length > 0 && (
                    <ul className="space-y-1 border-t pt-3">
                      {plan.features.map((f, i) => (
                        <li
                          key={i}
                          className="text-xs text-slate-600 flex items-start gap-1.5"
                        >
                          <span className="text-slate-400 mt-0.5">•</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Stripe IDs */}
                  {(plan.stripePriceIdMonthly || plan.stripePriceIdYearly) && (
                    <div className="border-t pt-3 space-y-0.5">
                      {plan.stripePriceIdMonthly && (
                        <div className="font-mono text-[10px] text-slate-400 truncate">
                          M: {plan.stripePriceIdMonthly}
                        </div>
                      )}
                      {plan.stripePriceIdYearly && (
                        <div className="font-mono text-[10px] text-slate-400 truncate">
                          Y: {plan.stripePriceIdYearly}
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setEditing(plan)}
                  >
                    <Pencil className="w-4 h-4" />
                    Edit
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PlanEditDialog
        plan={editing}
        onClose={() => setEditing(null)}
        token={token}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ['admin', 'credit-plans'] });
        }}
      />
    </div>
  );
}

// ─── Edit dialog ─────────────────────────────────────────────────────

function PlanEditDialog({
  plan,
  onClose,
  token,
  onSaved,
}: {
  plan: CreditPlan | null;
  onClose: () => void;
  token: string | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    label: '',
    description: '',
    monthlyPriceDollars: 0,
    yearlyPriceDollars: 0,
    monthlyGrant: 0,
    rolloverMonths: 0,
    seats: 1,
    byoKeyDiscountPct: 0,
    featuresText: '',
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    enabled: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!plan) return;
    setForm({
      label: plan.label ?? '',
      description: plan.description ?? '',
      monthlyPriceDollars: (plan.monthlyPriceCents ?? 0) / 100,
      yearlyPriceDollars: (plan.yearlyPriceCents ?? 0) / 100,
      monthlyGrant: plan.monthlyGrant ?? 0,
      rolloverMonths: plan.rolloverMonths ?? 0,
      seats: plan.seats ?? 1,
      byoKeyDiscountPct: plan.byoKeyDiscountPct ?? 0,
      featuresText: (plan.features ?? []).join('\n'),
      stripePriceIdMonthly: plan.stripePriceIdMonthly ?? '',
      stripePriceIdYearly: plan.stripePriceIdYearly ?? '',
      enabled: plan.enabled ?? true,
    });
  }, [plan]);

  if (!plan) return null;

  const onSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await api.put(
        `/admin/credits/plans/${plan.key}`,
        {
          label: form.label,
          description: form.description || null,
          monthlyPriceCents: Math.round(form.monthlyPriceDollars * 100),
          yearlyPriceCents: Math.round(form.yearlyPriceDollars * 100),
          monthlyGrant: Number(form.monthlyGrant),
          rolloverMonths: Number(form.rolloverMonths),
          seats: Number(form.seats),
          byoKeyDiscountPct: Number(form.byoKeyDiscountPct),
          features: form.featuresText
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          stripePriceIdMonthly: form.stripePriceIdMonthly || null,
          stripePriceIdYearly: form.stripePriceIdYearly || null,
          enabled: form.enabled,
        },
        { token },
      );
      toast.success(`${form.label} saved`);
      onSaved();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <Dialog open={!!plan} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit plan
            <Badge variant="secondary" className="font-mono text-[10px]">
              {plan.key}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Update pricing and credit allocation. Changes apply to new signups
            immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="mb-1.5 block">Label</Label>
            <Input
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="Pro"
            />
          </div>

          <div>
            <Label className="mb-1.5 block">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="For solo founders scaling their first company"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Monthly price (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.monthlyPriceDollars}
                onChange={(e) =>
                  set('monthlyPriceDollars', Number(e.target.value))
                }
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Yearly price (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.yearlyPriceDollars}
                onChange={(e) =>
                  set('yearlyPriceDollars', Number(e.target.value))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Monthly credit grant</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.monthlyGrant}
                onChange={(e) => set('monthlyGrant', Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Rollover months</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.rolloverMonths}
                onChange={(e) => set('rolloverMonths', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Seats</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={form.seats}
                onChange={(e) => set('seats', Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">BYO key discount (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={form.byoKeyDiscountPct}
                onChange={(e) =>
                  set('byoKeyDiscountPct', Number(e.target.value))
                }
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">
              Features (one per line)
            </Label>
            <Textarea
              value={form.featuresText}
              onChange={(e) => set('featuresText', e.target.value)}
              placeholder={'Unlimited campaigns\nPriority support\nCustom branding'}
              rows={5}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Stripe price ID (monthly)</Label>
              <Input
                value={form.stripePriceIdMonthly}
                onChange={(e) => set('stripePriceIdMonthly', e.target.value)}
                placeholder="price_1ABC..."
                className="font-mono text-xs"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Stripe price ID (yearly)</Label>
              <Input
                value={form.stripePriceIdYearly}
                onChange={(e) => set('stripePriceIdYearly', e.target.value)}
                placeholder="price_1XYZ..."
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <Label className="mb-0.5 block">Enabled</Label>
              <p className="text-xs text-slate-500">
                Disabled plans are hidden from the pricing page.
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => set('enabled', v)}
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
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
