'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2, FileCheck2, Library, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { friendlyError } from '@/lib/friendly-errors';
import { useAuthStore } from '@/stores/auth-store';
import { usePreferredAppLanguage } from '@/lib/use-preferred-app-language';
import { useMyCompanyAccess } from '@/lib/api/company-access-hooks';
import { hasCompanyPermission } from '@/lib/company-access';
import { DeliverableCard } from '@/components/deliverables/deliverable-card';
import { EvidenceSourceCard } from '@/components/deliverables/evidence-source-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Deliverable, DeliverableStatus } from '@/lib/deliverables';

type Filter = 'active' | 'approved' | 'all';

export default function OutputsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useAuthStore((state) => state.token);
  const [language] = usePreferredAppLanguage('en');
  const queryClient = useQueryClient();
  const accessQ = useMyCompanyAccess(companyId);
  const canReview = hasCompanyPermission(accessQ.data, 'deliverable.review');
  const [filter, setFilter] = useState<Filter>('active');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('open'));

  const query = useQuery({
    queryKey: ['deliverables', companyId],
    queryFn: () => api.get<{ data: Deliverable[] }>(
      `/deliverables/company/${companyId}?limit=100`,
      { token: token! },
    ),
    enabled: Boolean(token && companyId),
  });

  useEffect(() => {
    const requested = searchParams.get('open');
    if (requested) setSelectedId(requested);
  }, [searchParams]);

  const selected = query.data?.data.find((item) => item.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const rows = query.data?.data ?? [];
    if (filter === 'active') return rows.filter((item) => item.status === 'ready_for_review');
    if (filter === 'approved') return rows.filter((item) => item.status === 'approved' || item.status === 'published');
    return rows;
  }, [filter, query.data?.data]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Extract<DeliverableStatus, 'approved' | 'archived'> }) =>
      api.patch<{ data: Deliverable }>(
        `/deliverables/${id}/status`,
        { status },
        { token: token! },
      ),
    onSuccess: (_, variables) => {
      toast.success(variables.status === 'approved'
        ? (language === 'vi' ? 'Output đã được duyệt' : language === 'ja' ? '成果物を承認しました' : 'Output approved')
        : (language === 'vi' ? 'Output đã được lưu trữ' : language === 'ja' ? '成果物をアーカイブしました' : 'Output archived'));
      queryClient.invalidateQueries({ queryKey: ['deliverables', companyId] });
      setSelectedId(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const copy = language === 'vi'
    ? {
        title: 'Kết quả công việc từ AI',
        description: 'Các báo cáo, brief và kế hoạch AI đã chuẩn bị từ dữ liệu doanh nghiệp.',
        ready: 'Chờ duyệt',
        approved: 'Đã duyệt',
        all: 'Tất cả',
        empty: 'Chưa có output nào trong nhóm này.',
        issue: 'Vấn đề được phát hiện',
        evidence: 'Dữ liệu làm căn cứ',
        recommendation: 'Khuyến nghị',
        impact: 'Tác động kỳ vọng',
        today: 'Việc cần làm hôm nay',
        week: 'Trong 7 ngày tới',
        sources: 'Nguồn dữ liệu',
        approve: 'Duyệt output',
        archive: 'Lưu trữ',
        source: 'Xem đề xuất gốc',
      }
    : language === 'ja'
      ? {
          title: 'AI成果物',
          description: '企業データからAIが準備したレポート、概要、計画です。',
          ready: '確認待ち',
          approved: '承認済み',
          all: 'すべて',
          empty: 'このグループにはまだ成果物がありません。',
          issue: '検出された課題',
          evidence: '根拠データ',
          recommendation: '推奨事項',
          impact: '期待される効果',
          today: '今日行うこと',
          week: '今後7日間',
          sources: '情報源',
          approve: '承認する',
          archive: 'アーカイブ',
          source: '元の提案を見る',
        }
      : {
          title: 'AI Work Outputs',
          description: 'Reports, briefs, and plans AI has prepared from your company evidence.',
          ready: 'Ready for review',
          approved: 'Approved',
          all: 'All',
          empty: 'There are no outputs in this group yet.',
          issue: 'Issue detected',
          evidence: 'Evidence',
          recommendation: 'Recommendation',
          impact: 'Expected impact',
          today: 'What to do today',
          week: 'Next 7 days',
          sources: 'Sources',
          approve: 'Approve output',
          archive: 'Archive',
          source: 'View original recommendation',
        };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-950">
          <FileCheck2 className="h-6 w-6 text-indigo-600" /> {copy.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{copy.description}</p>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Output status">
        {([
          ['active', copy.ready],
          ['approved', copy.approved],
          ['all', copy.all],
        ] as Array<[Filter, string]>).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filter === value ? 'default' : 'outline'}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 py-14 text-center text-sm text-slate-500">
          {copy.empty}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((item) => (
            <DeliverableCard
              key={item.id}
              item={item}
              language={language}
              onReview={() => setSelectedId(item.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="capitalize">{selected.priority}</Badge>
                  <Badge variant="outline">{selected.ownerDepartment || 'AI Team'}</Badge>
                </div>
                <DialogTitle className="pt-2 text-left text-xl leading-snug">{selected.title}</DialogTitle>
                <DialogDescription className="text-left">Version {selected.version}</DialogDescription>
              </DialogHeader>

              <div className="space-y-5 text-sm">
                <OutputSection title={copy.issue} content={selected.content.issue} />
                <OutputSection title={copy.evidence} content={selected.content.evidenceSummary} />
                <OutputSection title={copy.recommendation} content={selected.content.recommendation} accent="indigo" />
                <OutputSection title={copy.impact} content={selected.content.expectedImpact} accent="emerald" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <OutputSection title={copy.today} content={selected.content.todayMove} />
                  <OutputSection title={copy.week} content={selected.content.sevenDayMove} />
                </div>
                {selected.evidence.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-50 text-indigo-700">
                        <Library className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="font-semibold text-slate-950">{copy.sources}</h3>
                        <p className="text-xs text-slate-500">
                          {language === 'vi'
                            ? `${selected.evidence.length} nguồn dữ liệu`
                            : language === 'ja'
                              ? `${selected.evidence.length}件の情報源`
                              : `${selected.evidence.length} ${selected.evidence.length === 1 ? 'source' : 'sources'}`}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-3">
                      {selected.evidence.map((evidence) => (
                        <EvidenceSourceCard
                          key={evidence.id}
                          evidence={evidence}
                          language={language}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {(selected.sourceType === 'ceo_advisor'
                || (canReview && selected.status === 'ready_for_review')) && (
                <DialogFooter className="gap-2 sm:gap-0">
                  {selected.sourceType === 'ceo_advisor' && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => router.push(`/${companyId}/insights`)}
                    >
                      {copy.source}
                    </Button>
                  )}
                  {canReview && selected.status === 'ready_for_review' && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-1.5"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: selected.id, status: 'archived' })}
                      >
                        <Archive className="h-4 w-4" /> {copy.archive}
                      </Button>
                      <Button
                        type="button"
                        className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: selected.id, status: 'approved' })}
                      >
                        {statusMutation.isPending
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <CheckCircle2 className="h-4 w-4" />}
                        {copy.approve}
                      </Button>
                    </>
                  )}
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OutputSection({
  title,
  content,
  accent,
}: {
  title: string;
  content?: string;
  accent?: 'indigo' | 'emerald';
}) {
  if (!content) return null;
  const className = accent === 'indigo'
    ? 'border-indigo-100 bg-indigo-50 text-indigo-950'
    : accent === 'emerald'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-950'
      : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <section className={`rounded-md border p-3 ${className}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</h3>
      <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{content}</p>
    </section>
  );
}
