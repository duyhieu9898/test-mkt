'use client';

import { ArrowRight, Bot, FileCheck2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  deliverableTypeLabel,
  type Deliverable,
} from '@/lib/deliverables';
import type { AppLanguage } from '@/lib/app-language';

const priorityClass: Record<Deliverable['priority'], string> = {
  urgent: 'border-red-200 bg-red-50 text-red-700',
  high: 'border-amber-200 bg-amber-50 text-amber-700',
  medium: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  low: 'border-slate-200 bg-slate-50 text-slate-600',
};

export function DeliverableCard({
  item,
  language,
  onReview,
  compact = false,
}: {
  item: Deliverable;
  language: AppLanguage;
  onReview: () => void;
  compact?: boolean;
}) {
  const reviewLabel = language === 'vi' ? 'Xem output' : language === 'ja' ? '確認する' : 'Review output';
  return (
    <Card className="border-0 shadow-sm ring-1 ring-slate-200">
      <CardContent className={cn('p-4', !compact && 'sm:p-5')}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
            <FileCheck2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                {deliverableTypeLabel(item.type, language)}
              </Badge>
              <Badge variant="outline" className={cn('capitalize', priorityClass[item.priority])}>
                {item.priority}
              </Badge>
            </div>
            <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-slate-950">
              {item.title}
            </h3>
            {item.summary && (
              <p className={cn('mt-1 text-sm leading-relaxed text-slate-600', compact ? 'line-clamp-2' : 'line-clamp-3')}>
                {item.summary}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Bot className="h-3.5 w-3.5" />
                {item.ownerDepartment || (language === 'vi' ? 'AI Team' : language === 'ja' ? 'AIチーム' : 'AI Team')}
              </span>
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={onReview}>
                {reviewLabel} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
