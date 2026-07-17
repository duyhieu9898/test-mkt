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
      label: 'Confirm company understanding',
      description: 'Check what AI knows about your business and customers.',
      href: `/${companyId}/growth-plan`,
      completed: companyUnderstood,
      icon: Building2,
    },
    {
      id: 'knowledge',
      label: 'Add trusted business knowledge',
      description: 'Give AI facts about products, pricing, FAQs, and policies.',
      href: `/${companyId}/knowledge`,
      completed: knowledgeCount > 0,
      icon: BookOpen,
    },
    {
      id: 'brand',
      label: 'Review Brand IQ',
      description: 'Confirm your audience, positioning, tone, and brand rules.',
      href: `/${companyId}/brand-iq`,
      completed: Boolean(brandIq),
      icon: Palette,
    },
    {
      id: 'advisor',
      label: 'Review your first CEO advice',
      description: 'See the highest-value actions AI recommends next.',
      href: `/${companyId}/insights`,
      completed: advisorReady,
      icon: Sparkles,
    },
  ];

  const optionalSteps: SetupStep[] = [
    {
      id: 'market',
      label: 'Analyze your market',
      description: 'Track competitors and discover positioning opportunities.',
      href: `/${companyId}/market`,
      completed: competitorCount > 0,
      optional: true,
      icon: Globe,
    },
    {
      id: 'landing-page',
      label: 'Create a marketing landing page',
      description: 'Turn an offer or campaign idea into a page that can capture leads.',
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
    ? 'Setup priority'
    : advisorRecommendation
      ? 'Recommended by CEO Advisor'
      : 'Suggested next step';
  const readinessScore = Math.min(
    100,
    (companyUnderstood ? 20 : 0)
      + (knowledgeCount > 0 ? 25 : 0)
      + (brandIq ? 30 : 0)
      + (competitorCount > 0 ? 10 : 0)
      + (advisorReady ? 15 : 0),
  );
  const readinessLabel = readinessScore >= 75
    ? 'Strong'
    : readinessScore >= 45
      ? 'Growing'
      : 'Getting started';
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
            <p className="mt-3 text-sm font-medium text-slate-800">Checking your company setup</p>
            <p className="mt-1 text-xs text-slate-500">
              Reading the latest Knowledge, Brand IQ, market, and landing-page status.
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
                  Getting started with {company?.name || 'your company'}
                </h2>
                <Badge variant="outline" className="text-[10px] text-violet-700">
                  {requiredCompleted} of {requiredSteps.length} essentials
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                The more reliable context you provide, the more specific your AI recommendations become.
              </p>
            </div>
            <div className="min-w-[180px]">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">AI readiness</span>
                <span className="font-semibold text-violet-700">
                  {readinessLabel} · {readinessScore}%
                </span>
              </div>
              <Progress value={readinessScore} className="h-2 bg-violet-50" />
              {statusUnavailable && (
                <p className="mt-1.5 text-[11px] text-amber-700">
                  Some setup status could not be checked.
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
                  ? 'Review recommendation'
                  : nextStep.id === 'advisor'
                    ? 'Show my recommendations'
                    : `Start: ${nextStep.label}`}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>

            <div className="mt-5 border-t pt-4">
              <p className="text-xs font-medium text-slate-500">AI currently understands</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {company?.industry && <Badge variant="secondary">{company.industry}</Badge>}
                {audience && <Badge variant="secondary">{audience}</Badge>}
                {offeringsCount > 0 && <Badge variant="secondary">{offeringsCount} offerings</Badge>}
                {knowledgeCount > 0 && <Badge variant="secondary">{knowledgeCount} knowledge facts</Badge>}
                {brandIq && <Badge variant="secondary">Brand voice ready</Badge>}
              </div>
            </div>
          </div>

          <div className="p-5">
            <p className="text-xs font-semibold uppercase text-slate-500">Setup checklist</p>
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
                        <span className="text-[10px] font-medium text-slate-400">Optional</span>
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
