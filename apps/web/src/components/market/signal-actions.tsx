'use client';

/**
 * Per-signal quick actions menu.
 * Each signal type gets a 1-click action:
 *   product_launch → write comparison blog
 *   pricing_change → review your pricing
 *   hire → save intel to Brain (already auto-saved)
 *   news → save to weekly digest context
 *   content → counter-content idea in blog
 */

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FileText, DollarSign, Brain, Sparkles } from 'lucide-react';

interface Props {
  companyId: string;
  signalType: string;
  signalText: string;
  competitorName: string;
}

export function SignalActions({ companyId, signalType, signalText, competitorName }: Props) {
  const router = useRouter();

  const lower = signalType.toLowerCase();
  let action: { icon: typeof FileText; label: string; path: string; hint: string } | null = null;

  if (lower === 'product_launch' || lower === 'launch') {
    action = {
      icon: FileText,
      label: 'Counter-content',
      path: `/${companyId}/blog?seed=${encodeURIComponent(`Respond to ${competitorName}: ${signalText}`)}`,
      hint: 'Generate a blog post responding to this launch',
    };
  } else if (lower === 'pricing_change' || lower === 'pricing') {
    action = {
      icon: DollarSign,
      label: 'Review pricing',
      path: `/${companyId}/landing-pages?filter=pricing`,
      hint: 'Compare your pricing page',
    };
  } else if (lower === 'content') {
    action = {
      icon: Sparkles,
      label: 'Counter-idea',
      path: `/${companyId}/blog?seed=${encodeURIComponent(`Differentiated take on: ${signalText}`)}`,
      hint: 'Generate a differentiated blog idea',
    };
  } else if (lower === 'hire' || lower === 'news') {
    action = {
      icon: Brain,
      label: 'In Brain',
      path: `/${companyId}/brain`,
      hint: 'Auto-saved — view Brain context',
    };
  }

  if (!action) return null;
  const Icon = action.icon;

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 px-2 text-[11px] gap-1 text-slate-500 hover:text-indigo-600"
      onClick={() => router.push(action!.path)}
      title={action.hint}
    >
      <Icon className="w-3 h-3" />
      {action.label}
    </Button>
  );
}
