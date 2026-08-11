import { Badge } from '@/components/ui/badge';

const statusClassName: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  saved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  draft: 'border-amber-200 bg-amber-50 text-amber-800',
  pending_review: 'border-amber-200 bg-amber-50 text-amber-800',
  recommended: 'border-violet-200 bg-violet-50 text-violet-700',
  handled_manually: 'border-sky-200 bg-sky-50 text-sky-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
  paused: 'border-slate-200 bg-slate-50 text-slate-700',
  archived: 'border-slate-200 bg-slate-50 text-slate-700',
  completed: 'border-slate-200 bg-slate-50 text-slate-700',
};

export function MetaAdsStatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge variant="outline" className={statusClassName[status] || 'border-slate-200 bg-slate-50 text-slate-700'}>{label ? `${label} · ` : ''}{status.replaceAll('_', ' ').toUpperCase()}</Badge>;
}
