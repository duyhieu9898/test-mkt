'use client';

/**
 * "Why this output?" — explainability panel.
 *
 * Shows which model + tier + credit cost + business-context sources
 * were used to generate a piece of content, and deep-links into the
 * Langfuse trace inspector for the full prompt + tokens + timing.
 *
 * Per ADR-01 (Langfuse for LLM observability), we intentionally do NOT
 * rebuild the trace inspector in-app. Users who want to drill down click
 * the "Open full trace" button to open Langfuse.
 */

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink, Sparkles, Zap, Gem, Coins, BookOpen, Brain } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

export interface Lineage {
  generatedAt?: string;
  featureKey?: string;
  provider?: string;
  model?: string;
  tierUsed?: 'fast' | 'balanced' | 'premium';
  configSource?: 'db' | 'env' | 'default';
  creditCost?: number;
  traceId?: string;
  traceUrl?: string;
  sources?: {
    companyName?: string;
    industry?: string;
    productsCount?: number;
    faqsCount?: number;
    brandVoice?: string[];
    brandStyle?: string;
    brandColors?: { primary?: string; secondary?: string };
  };
}

export interface ExplainPayload {
  bannerId?: string;
  name?: string;
  lineage: Lineage | null;
  imageProvider?: string | null;
  backgroundPrompt?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  fetchUrl: string | null;
}

const TIER_META: Record<
  string,
  { icon: JSX.Element; label: string; badge: string }
> = {
  fast: {
    icon: <Zap className="w-4 h-4" />,
    label: 'Standard',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  balanced: {
    icon: <Sparkles className="w-4 h-4" />,
    label: 'Pro',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  premium: {
    icon: <Gem className="w-4 h-4" />,
    label: 'Ultra',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
  },
};

export function WhyThisOutputDialog({ open, onClose, fetchUrl }: Props) {
  const token = useAuthStore((s) => s.token);

  const { data, isLoading } = useQuery<ExplainPayload>({
    queryKey: ['explain', fetchUrl],
    queryFn: () => api.get<ExplainPayload>(fetchUrl!, { token: token! }),
    enabled: open && !!token && !!fetchUrl,
  });

  const lineage = data?.lineage ?? null;
  const tierMeta = lineage?.tierUsed ? TIER_META[lineage.tierUsed] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-500" /> Why this output?
          </DialogTitle>
          <DialogDescription>
            Everything that shaped this piece of content — model, quality tier, and
            which parts of your Business Brain were used.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        )}

        {!isLoading && !lineage && (
          <div className="py-8 text-center text-sm text-slate-500">
            No lineage was recorded for this item. Regenerate it to capture the full
            trace.
          </div>
        )}

        {!isLoading && lineage && (
          <div className="space-y-4 py-2">
            {/* Model + tier + cost row */}
            <div className="rounded-lg border p-3 bg-slate-50/50">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
                Model
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {lineage.provider ?? '—'}:{lineage.model ?? '—'}
                </Badge>
                {tierMeta && (
                  <Badge variant="outline" className={`gap-1 text-[11px] ${tierMeta.badge}`}>
                    {tierMeta.icon} {tierMeta.label}
                  </Badge>
                )}
                {typeof lineage.creditCost === 'number' && lineage.creditCost > 0 && (
                  <Badge variant="outline" className="gap-1 text-[11px] border-indigo-200 text-indigo-700 bg-indigo-50">
                    <Coins className="w-3 h-3" /> {lineage.creditCost} credits
                  </Badge>
                )}
                {lineage.configSource && (
                  <Badge variant="outline" className="text-[10px]">
                    config: {lineage.configSource}
                  </Badge>
                )}
              </div>
              {lineage.generatedAt && (
                <div className="mt-2 text-[11px] text-slate-500">
                  Generated {new Date(lineage.generatedAt).toLocaleString()}
                </div>
              )}
            </div>

            {/* Sources */}
            {lineage.sources && (
              <div className="rounded-lg border p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Business Brain sources used
                </div>
                <div className="text-sm space-y-1">
                  {lineage.sources.companyName && (
                    <div>
                      <span className="text-slate-500">Company:</span>{' '}
                      <span className="font-medium">{lineage.sources.companyName}</span>
                    </div>
                  )}
                  {lineage.sources.industry && (
                    <div>
                      <span className="text-slate-500">Industry:</span>{' '}
                      {lineage.sources.industry}
                    </div>
                  )}
                  {lineage.sources.brandVoice && lineage.sources.brandVoice.length > 0 && (
                    <div>
                      <span className="text-slate-500">Brand voice:</span>{' '}
                      {lineage.sources.brandVoice.join(', ')}
                    </div>
                  )}
                  {lineage.sources.brandStyle && (
                    <div>
                      <span className="text-slate-500">Brand style:</span>{' '}
                      {lineage.sources.brandStyle}
                    </div>
                  )}
                  {typeof lineage.sources.productsCount === 'number' && (
                    <div>
                      <span className="text-slate-500">Products in context:</span>{' '}
                      {lineage.sources.productsCount}
                    </div>
                  )}
                  {typeof lineage.sources.faqsCount === 'number' && (
                    <div>
                      <span className="text-slate-500">FAQs in context:</span>{' '}
                      {lineage.sources.faqsCount}
                    </div>
                  )}
                  {lineage.sources.brandColors && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Brand colors:</span>
                      {lineage.sources.brandColors.primary && (
                        <span
                          className="inline-block w-4 h-4 rounded border"
                          style={{ backgroundColor: lineage.sources.brandColors.primary }}
                        />
                      )}
                      {lineage.sources.brandColors.secondary && (
                        <span
                          className="inline-block w-4 h-4 rounded border"
                          style={{ backgroundColor: lineage.sources.brandColors.secondary }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Image-gen lineage (if present) */}
            {data?.imageProvider && (
              <div className="rounded-lg border p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
                  Background image
                </div>
                <div className="text-sm">
                  Generated with{' '}
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {data.imageProvider}
                  </Badge>
                </div>
                {data.backgroundPrompt && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-indigo-600">
                      View image prompt
                    </summary>
                    <pre className="mt-2 text-[10px] bg-slate-50 rounded p-2 whitespace-pre-wrap max-h-40 overflow-auto">
                      {data.backgroundPrompt}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {lineage?.traceUrl && (
            <Button
              asChild
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <a href={lineage.traceUrl} target="_blank" rel="noreferrer">
                Open full trace <ExternalLink className="w-4 h-4 ml-1.5" />
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
