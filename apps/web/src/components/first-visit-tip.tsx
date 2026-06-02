'use client';

/**
 * First-visit tip — a tiny dismissible card at the top of a page that
 * appears only the first time a user lands there. Persists dismissal in
 * localStorage by `tipKey`.
 *
 * Used on Market, Sales, CEO Advisor (doc 10 walkthrough G7). Intentionally
 * simpler than GuidedTour (coach marks on /campaigns) — one row, one CTA,
 * one dismiss.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';

interface Props {
  tipKey: string;
  title: string;
  body: string;
}

export function FirstVisitTip({ tipKey, title, body }: Props) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(`1person.tip.${tipKey}.dismissed`);
      if (!dismissed) setVisible(true);
    } catch { /* private mode — skip */ }
  }, [tipKey]);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(`1person.tip.${tipKey}.dismissed`, '1'); } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-purple-50/50">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 text-sm">{title}</div>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{body}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={dismiss}
          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700 shrink-0"
          aria-label="Dismiss tip"
        >
          <X className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
