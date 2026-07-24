'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  Circle,
  Globe,
  LayoutTemplate,
  Loader2,
  Palette,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api/client';
import { useBrandIq } from '@/lib/api/brand-iq-hooks';
import { useCompany, useLandingPages } from '@/lib/api/hooks';
import { usePreferredAppLanguage } from '@/lib/use-preferred-app-language';
import { useAuthStore } from '@/stores/auth-store';

interface GettingStartedHubProps {
  companyId: string;
  advisorReady: boolean;
  advisorRecommendation?: {
    title: string;
    why: string;
    link?: string;
  };
  competitorCount: number;
  externalStatusLoading?: boolean;
  externalStatusError?: boolean;
}

interface SetupStep {
  id: string;
  label: string;
  description: string;
  href: string;
  completed: boolean;
  optional?: boolean;
  icon: typeof Building2;
}

export function GettingStartedHub({
  companyId,
  advisorReady,
  advisorRecommendation,
  competitorCount,
  externalStatusLoading = false,
  externalStatusError = false,
}: GettingStartedHubProps) {
  const token = useAuthStore((state) => state.token);
  const companyQuery = useCompany(companyId);
  const brandIqQuery = useBrandIq(companyId);
  const landingPagesQuery = useLandingPages(companyId);
  const knowledgeQuery = useQuery({
    queryKey: ['knowledge-entries', companyId, 'dashboard-summary'],
    queryFn: () => api.get<{ data: unknown[] }>(
      `/knowledge/company/${companyId}/search?q=`,
      { token: token! },
    ),
    enabled: Boolean(token && companyId),
  });

  const company = companyQuery.data;
  const [language] = usePreferredAppLanguage('en');
  const text = (en: string, ja: string, vi: string) => (
    language === 'ja' ? ja : language === 'vi' ? vi : en
  );
  const brandIq = brandIqQuery.data;
  const knowledgeCount = knowledgeQuery.data?.data?.length ?? 0;
  const landingPageCount = landingPagesQuery.data?.length ?? 0;
  const companyUnderstood = Boolean(
    company?.name
    && (company.industry || company.description || company.businessPlan?.valueProposition),
  );

  const requiredSteps: SetupStep[] = [
    {
      id: 'company',
      label: text('Confirm company understanding', '会社理解を確認', 'Xác nhận hiểu biết về công ty'),
      description: text(
        'Check what AI knows about your business and customers.',
        'AIが事業と顧客について理解している内容を確認します。',
        'Kiểm tra những gì AI hiểu về doanh nghiệp và khách hàng của bạn.',
      ),
      href: `/${companyId}/growth-plan`,
      completed: companyUnderstood,
      icon: Building2,
    },
    {
      id: 'knowledge',
      label: text('Add trusted business knowledge', '信頼できる事業知識を追加', 'Thêm kiến thức kinh doanh đáng tin cậy'),
      description: text(
        'Give AI facts about products, pricing, FAQs, and policies.',
        '商品、価格、FAQ、ポリシーなどの正確な情報をAIに提供します。',
        'Cung cấp cho AI thông tin chính xác về sản phẩm, giá, FAQ và chính sách.',
      ),
      href: `/${companyId}/knowledge`,
      completed: knowledgeCount > 0,
      icon: BookOpen,
    },
    {
      id: 'brand',
      label: text('Review Brand IQ', 'Brand IQを確認', 'Xem lại Brand IQ'),
      description: text(
        'Confirm your audience, positioning, tone, and brand rules.',
        '対象顧客、ポジショニング、トーン、ブランドルールを確認します。',
        'Xác nhận khách hàng mục tiêu, định vị, giọng thương hiệu và quy tắc brand.',
      ),
      href: `/${companyId}/brand-iq`,
      completed: Boolean(brandIq),
      icon: Palette,
    },
    {
      id: 'advisor',
      label: text('Review your first CEO advice', '最初のCEOアドバイスを確認', 'Xem CEO advice đầu tiên'),
      description: text(
        'See the highest-value actions AI recommends next.',
        'AIが次に推奨する重要度の高いアクションを確認します。',
        'Xem các hành động có giá trị cao nhất mà AI đề xuất tiếp theo.',
      ),
      href: `/${companyId}/insights`,
      completed: advisorReady,
      icon: Sparkles,
    },
  ];

  const optionalSteps: SetupStep[] = [
    {
      id: 'market',
      label: text('Analyze your market', '市場を分析', 'Phân tích thị trường'),
      description: text(
        'Track competitors and discover positioning opportunities.',
        '競合を追跡し、ポジショニングの機会を見つけます。',
        'Theo dõi đối thủ và tìm cơ hội định vị tốt hơn.',
      ),
      href: `/${companyId}/market`,
      completed: competitorCount > 0,
      optional: true,
      icon: Globe,
    },
    {
      id: 'landing-page',
      label: text('Create a marketing landing page', 'マーケティング用ランディングページを作成', 'Tạo landing page marketing'),
      description: text(
        'Turn an offer or campaign idea into a page that can capture leads.',
        'オファーやキャンペーン案を、リード獲得できるページに変えます。',
        'Biến ưu đãi hoặc ý tưởng campaign thành trang có thể thu lead.',
      ),
      href: `/${companyId}/landing-pages?action=generate`,
      completed: landingPageCount > 0,
      optional: true,
      icon: LayoutTemplate,
    },
  ];

  const requiredCompleted = requiredSteps.filter((item) => item.completed).length;
  const allSteps = [...requiredSteps, ...optionalSteps];
  const missingEssential = requiredSteps.find((item) => !item.completed);
  const fallbackStep = optionalSteps.find((item) => !item.completed) ?? requiredSteps[3]!;
  const nextStep: SetupStep = missingEssential
    ?? (advisorRecommendation
      ? {
          id: 'ai-recommendation',
          label: advisorRecommendation.title,
          description: advisorRecommendation.why,
          href: advisorRecommendation.link || `/${companyId}/insights`,
          completed: false,
          icon: Sparkles,
        }
      : fallbackStep);
  const recommendationSource = missingEssential
    ? text('Setup priority', 'セットアップ優先', 'Ưu tiên thiết lập')
    : advisorRecommendation
      ? text('Recommended by CEO Advisor', 'CEO Advisorのおすすめ', 'CEO Advisor đề xuất')
      : text('Suggested next step', '次のおすすめステップ', 'Bước tiếp theo được gợi ý');
  const readinessScore = Math.min(
    100,
    (companyUnderstood ? 20 : 0)
      + (knowledgeCount > 0 ? 25 : 0)
      + (brandIq ? 30 : 0)
      + (competitorCount > 0 ? 10 : 0)
      + (advisorReady ? 15 : 0),
  );
  const readinessLabel = readinessScore >= 75
    ? text('Strong', '強い', 'Tốt')
    : readinessScore >= 45
      ? text('Growing', '成長中', 'Đang cải thiện')
      : text('Getting started', '開始段階', 'Mới bắt đầu');
  const audience = company?.businessPlan?.targetAudience?.demographics?.[0];
  const offeringsCount = company?.businessPlan?.offerings?.length ?? 0;
  const isLoading = companyQuery.isLoading
    || brandIqQuery.isLoading
    || knowledgeQuery.isLoading
    || landingPagesQuery.isLoading
    || externalStatusLoading;
  const statusUnavailable = companyQuery.isError
    || brandIqQuery.isError
    || knowledgeQuery.isError
    || landingPagesQuery.isError
    || externalStatusError;

  if (isLoading) {
    return (
      <Card className="border-violet-100 bg-white">
        <CardContent className="flex min-h-[220px] items-center justify-center p-6">
          <div className="text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-violet-600" />
            <p className="mt-3 text-sm font-medium text-slate-800">
              {text('Checking your company setup', '会社のセットアップ状況を確認中', 'Đang kiểm tra thiết lập công ty')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {text(
                'Reading the latest Knowledge, Brand IQ, market, and landing-page status.',
                '最新のKnowledge、Brand IQ、市場、ランディングページ状況を確認しています。',
                'Đang đọc trạng thái mới nhất của Knowledge, Brand IQ, thị trường và landing page.',
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-violet-100 bg-white">
      <CardContent className="p-0">
        <div className="border-b px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-slate-900">
                  {text('Getting started with', 'セットアップ開始', 'Bắt đầu với')} {company?.name || text('your company', 'あなたの会社', 'công ty của bạn')}
                </h2>
                <Badge variant="outline" className="text-[10px] text-violet-700">
                  {text(
                    `${requiredCompleted} of ${requiredSteps.length} essentials`,
                    `${requiredCompleted} / ${requiredSteps.length} 必須項目`,
                    `${requiredCompleted}/${requiredSteps.length} mục quan trọng`,
                  )}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {text(
                  'The more reliable context you provide, the more specific your AI recommendations become.',
                  '信頼できる情報を増やすほど、AIの提案はより具体的になります。',
                  'Bạn càng cung cấp nhiều context đáng tin cậy, đề xuất của AI càng cụ thể và chính xác.',
                )}
              </p>
            </div>
            <div className="min-w-[180px]">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">{text('AI readiness', 'AI準備度', 'Mức sẵn sàng của AI')}</span>
                <span className="font-semibold text-violet-700">
                  {readinessLabel} · {readinessScore}%
                </span>
              </div>
              <Progress value={readinessScore} className="h-2 bg-violet-50" />
              {statusUnavailable && (
                <p className="mt-1.5 text-[11px] text-amber-700">
                  {text(
                    'Some setup status could not be checked.',
                    '一部のセットアップ状況を確認できませんでした。',
                    'Một số trạng thái thiết lập chưa kiểm tra được.',
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.05fr_1.4fr]">
          <div className="border-b p-5 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase text-violet-600">Your next best step</p>
              <Badge variant="outline" className="text-[10px] font-medium text-violet-700">
                {recommendationSource}
              </Badge>
            </div>
            <div className="mt-3 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                <nextStep.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{nextStep.label}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-600">{nextStep.description}</p>
              </div>
            </div>
            <Button asChild className="mt-5 gap-2 bg-violet-600 hover:bg-violet-700">
              <Link href={nextStep.href}>
                {nextStep.id === 'ai-recommendation'
                  ? text('Review recommendation', 'おすすめを確認', 'Xem đề xuất')
                  : nextStep.id === 'advisor'
                    ? text('Show my recommendations', 'おすすめを表示', 'Xem đề xuất của tôi')
                    : `${text('Start', '開始', 'Bắt đầu')}: ${nextStep.label}`}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>

            <div className="mt-5 border-t pt-4">
              <p className="text-xs font-medium text-slate-500">
                {text('AI currently understands', 'AIが現在理解していること', 'AI hiện đang hiểu')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {company?.industry && <Badge variant="secondary">{company.industry}</Badge>}
                {audience && <Badge variant="secondary">{audience}</Badge>}
                {offeringsCount > 0 && (
                  <Badge variant="secondary">
                    {offeringsCount} {text('offerings', '提供内容', 'sản phẩm/dịch vụ')}
                  </Badge>
                )}
                {knowledgeCount > 0 && (
                  <Badge variant="secondary">
                    {knowledgeCount} {text('knowledge facts', 'ナレッジ情報', 'kiến thức')}
                  </Badge>
                )}
                {brandIq && (
                  <Badge variant="secondary">
                    {text('Brand voice ready', 'ブランドボイス準備済み', 'Brand voice đã sẵn sàng')}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="p-5">
            <p className="text-xs font-semibold uppercase text-slate-500">
              {text('Setup checklist', 'セットアップチェックリスト', 'Checklist thiết lập')}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {allSteps.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex min-h-[72px] items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                    item.completed
                      ? 'border-transparent hover:bg-slate-50'
                      : 'border-violet-100 bg-violet-50/40 hover:bg-violet-50/70'
                  }`}
                >
                  {item.completed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium text-slate-800">{item.label}</p>
                      {item.optional && (
                        <span className="text-[10px] font-medium text-slate-400">
                          {text('Optional', '任意', 'Không bắt buộc')}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-slate-500">
                      {item.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
