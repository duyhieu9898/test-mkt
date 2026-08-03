'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileCheck2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { usePreferredAppLanguage } from '@/lib/use-preferred-app-language';
import { Button } from '@/components/ui/button';
import { DeliverableCard } from '@/components/deliverables/deliverable-card';
import type { Deliverable } from '@/lib/deliverables';

export function ReadyOutputs({
  companyId,
  advisorBriefId,
}: {
  companyId: string;
  advisorBriefId?: string;
}) {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const [language] = usePreferredAppLanguage('en');
  const query = useQuery({
    queryKey: ['deliverables', companyId, 'ready_for_review', advisorBriefId],
    queryFn: () => api.get<{ data: Deliverable[] }>(
      `/deliverables/company/${companyId}?status=ready_for_review&limit=3`,
      { token: token! },
    ),
    enabled: Boolean(token && advisorBriefId),
  });

  if (query.isLoading) {
    return <div className="h-32 animate-pulse rounded-md bg-slate-100" />;
  }
  if (!query.data?.data.length) return null;

  const title = language === 'vi'
    ? 'AI đã chuẩn bị cho bạn'
    : language === 'ja'
      ? 'AIが確認用に準備しました'
      : 'Ready for your review';
  const description = language === 'vi'
    ? 'Các output này được tạo từ CEO Advisor và dữ liệu doanh nghiệp hiện có.'
    : language === 'ja'
      ? 'CEO Advisorと現在の企業データから作成された成果物です。'
      : 'These outputs were prepared from CEO Advisor and your current company evidence.';

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
            <FileCheck2 className="h-5 w-5 text-indigo-600" /> {title}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1 text-indigo-700"
          onClick={() => router.push(`/${companyId}/outputs`)}
        >
          {language === 'vi' ? 'Xem tất cả' : language === 'ja' ? 'すべて見る' : 'View all'}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {query.data.data.map((item) => (
          <DeliverableCard
            key={item.id}
            item={item}
            language={language}
            compact
            onReview={() => router.push(`/${companyId}/outputs?open=${item.id}`)}
          />
        ))}
      </div>
    </section>
  );
}
