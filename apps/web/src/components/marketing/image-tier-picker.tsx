'use client';

/**
 * Image quality tier picker — opens before banner background generation.
 *
 * Fetches the live image provider catalog from /image-providers and lets
 * the user trade cost vs quality. Admin controls which providers are
 * available + their credit cost via /admin/llm-config.
 */

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, Sparkles, Gem, Coins } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

export interface ImageProviderOption {
  key: string;
  label: string;
  description: string | null;
  tier: 'fast' | 'balanced' | 'premium';
  creditCost: number;
  enabled: boolean;
  ready: boolean;
}

interface ImageTierPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (providerKey: string, creditCost: number) => void;
  title?: string;
  description?: string;
}

const TIER_META: Record<
  string,
  { icon: JSX.Element; label: string; ring: string; badge: string }
> = {
  fast: {
    icon: <Zap className="w-5 h-5" />,
    label: 'Standard',
    ring: 'border-amber-300 hover:border-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  balanced: {
    icon: <Sparkles className="w-5 h-5" />,
    label: 'Pro',
    ring: 'border-indigo-300 hover:border-indigo-500',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  premium: {
    icon: <Gem className="w-5 h-5" />,
    label: 'Ultra',
    ring: 'border-purple-300 hover:border-purple-500',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
  },
};

export function ImageTierPicker({
  open,
  onClose,
  onPick,
  title = 'Choose image quality',
  description = 'Higher quality tiers cost more credits but produce better banner images.',
}: ImageTierPickerProps) {
  const token = useAuthStore((s) => s.token);
  const [providers, setProviders] = useState<ImageProviderOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !token) return;
    setLoading(true);
    api
      .get<{ providers: ImageProviderOption[] }>('/image-providers', { token })
      .then((r) => setProviders(r.providers || []))
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, [open, token]);

  // Pick the cheapest option per tier so the dialog shows at most 3 cards.
  const byTier = new Map<string, ImageProviderOption>();
  for (const p of providers) {
    const existing = byTier.get(p.tier);
    if (!existing || p.creditCost < existing.creditCost) byTier.set(p.tier, p);
  }
  const ordered: ImageProviderOption[] = ['fast', 'balanced', 'premium']
    .map((t) => byTier.get(t))
    .filter((p): p is ImageProviderOption => !!p);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading options…
          </div>
        )}

        {!loading && ordered.length === 0 && (
          <div className="py-10 text-center text-sm text-slate-500">
            No image quality tiers are available right now. Ask your admin to enable one in
            <span className="font-mono"> Admin → LLM Configuration</span>.
          </div>
        )}

        {!loading && ordered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-2">
            {ordered.map((p) => {
              const meta = TIER_META[p.tier];
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    onPick(p.key, p.creditCost);
                    onClose();
                  }}
                  className={`text-left border-2 rounded-lg p-4 transition-all ${meta.ring} hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {meta.icon}
                      <span className="font-semibold">{meta.label}</span>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${meta.badge}`}>
                      {p.tier}
                    </Badge>
                  </div>
                  <div className="text-sm font-medium text-slate-900">{p.label}</div>
                  {p.description && (
                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-3">
                      {p.description}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-indigo-600">
                    <Coins className="w-3.5 h-3.5" />
                    {p.creditCost} credits / image
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
