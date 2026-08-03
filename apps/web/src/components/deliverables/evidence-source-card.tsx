'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  Briefcase,
  Building2,
  ExternalLink,
  FileText,
  Globe2,
  GraduationCap,
  LayoutTemplate,
  Megaphone,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AppLanguage } from '@/lib/app-language';
import type { Deliverable } from '@/lib/deliverables';

type Evidence = Deliverable['evidence'][number];

interface SourcePresentation {
  icon: LucideIcon;
  containerClass: string;
  iconClass: string;
  badgeClass: string;
}

const defaultPresentation: SourcePresentation = {
  icon: FileText,
  containerClass: 'border-slate-200 bg-slate-50/70',
  iconClass: 'bg-white text-slate-600 ring-slate-200',
  badgeClass: 'border-slate-200 bg-white text-slate-600',
};

const sourcePresentations: Record<string, SourcePresentation> = {
  campaign: {
    icon: Megaphone,
    containerClass: 'border-violet-200 bg-violet-50',
    iconClass: 'bg-violet-600 text-white ring-violet-600',
    badgeClass: 'border-violet-200 bg-white text-violet-700',
  },
  market: {
    icon: Globe2,
    containerClass: 'border-amber-200 bg-amber-50/80',
    iconClass: 'bg-white text-amber-700 ring-amber-200',
    badgeClass: 'border-amber-200 bg-white text-amber-700',
  },
  knowledge: {
    icon: BookOpen,
    containerClass: 'border-blue-200 bg-blue-50/80',
    iconClass: 'bg-white text-blue-700 ring-blue-200',
    badgeClass: 'border-blue-200 bg-white text-blue-700',
  },
  brain: {
    icon: Brain,
    containerClass: 'border-indigo-200 bg-indigo-50/70',
    iconClass: 'bg-white text-indigo-700 ring-indigo-200',
    badgeClass: 'border-indigo-200 bg-white text-indigo-700',
  },
  blog: {
    icon: FileText,
    containerClass: 'border-emerald-200 bg-emerald-50/70',
    iconClass: 'bg-white text-emerald-700 ring-emerald-200',
    badgeClass: 'border-emerald-200 bg-white text-emerald-700',
  },
  landing_page: {
    icon: LayoutTemplate,
    containerClass: 'border-cyan-200 bg-cyan-50/70',
    iconClass: 'bg-white text-cyan-700 ring-cyan-200',
    badgeClass: 'border-cyan-200 bg-white text-cyan-700',
  },
  sales: {
    icon: Briefcase,
    containerClass: 'border-rose-200 bg-rose-50/70',
    iconClass: 'bg-white text-rose-700 ring-rose-200',
    badgeClass: 'border-rose-200 bg-white text-rose-700',
  },
  business: {
    icon: Building2,
    containerClass: 'border-slate-200 bg-slate-50/80',
    iconClass: 'bg-white text-slate-700 ring-slate-200',
    badgeClass: 'border-slate-200 bg-white text-slate-700',
  },
  learning: {
    icon: GraduationCap,
    containerClass: 'border-teal-200 bg-teal-50/70',
    iconClass: 'bg-white text-teal-700 ring-teal-200',
    badgeClass: 'border-teal-200 bg-white text-teal-700',
  },
  coverage: {
    icon: BarChart3,
    containerClass: 'border-orange-200 bg-orange-50/70',
    iconClass: 'bg-white text-orange-700 ring-orange-200',
    badgeClass: 'border-orange-200 bg-white text-orange-700',
  },
};

const sourceCopy: Record<AppLanguage, Record<string, [string, string]>> = {
  en: {
    campaign: ['Campaign', 'Open campaign'],
    market: ['Market insight', 'Open market'],
    knowledge: ['Knowledge', 'Open knowledge'],
    brain: ['Brain data', 'Open Brain'],
    blog: ['Blog', 'Open blog'],
    landing_page: ['Landing page', 'Open landing pages'],
    sales: ['Sales', 'Open sales'],
    business: ['Company data', 'Open source'],
    learning: ['Campaign learning', 'Open learning'],
    coverage: ['Content coverage', 'Open analysis'],
    default: ['Source', 'Open source'],
  },
  vi: {
    campaign: ['Chiến dịch', 'Mở chiến dịch'],
    market: ['Thông tin thị trường', 'Mở thị trường'],
    knowledge: ['Kiến thức công ty', 'Mở Knowledge'],
    brain: ['Dữ liệu Brain', 'Mở Brain'],
    blog: ['Bài blog', 'Mở bài blog'],
    landing_page: ['Landing page', 'Mở Landing Pages'],
    sales: ['Dữ liệu bán hàng', 'Mở Sales'],
    business: ['Dữ liệu công ty', 'Mở nguồn'],
    learning: ['Bài học chiến dịch', 'Mở bài học'],
    coverage: ['Độ phủ nội dung', 'Mở phân tích'],
    default: ['Nguồn dữ liệu', 'Mở nguồn'],
  },
  ja: {
    campaign: ['キャンペーン', 'キャンペーンを開く'],
    market: ['市場インサイト', '市場を開く'],
    knowledge: ['社内ナレッジ', 'ナレッジを開く'],
    brain: ['Brainデータ', 'Brainを開く'],
    blog: ['ブログ', 'ブログを開く'],
    landing_page: ['ランディングページ', 'ページを開く'],
    sales: ['営業データ', '営業を開く'],
    business: ['企業データ', '情報源を開く'],
    learning: ['キャンペーン学習', '学習を開く'],
    coverage: ['コンテンツカバレッジ', '分析を開く'],
    default: ['情報源', '情報源を開く'],
  },
};

export function EvidenceSourceCard({
  evidence,
  language,
}: {
  evidence: Evidence;
  language: AppLanguage;
}) {
  const presentation = sourcePresentations[evidence.sourceType] ?? defaultPresentation;
  const Icon = presentation.icon;
  const [sourceLabel, actionLabel] = sourceCopy[language][evidence.sourceType]
    ?? sourceCopy[language].default;
  const external = Boolean(evidence.link && /^https?:\/\//i.test(evidence.link));

  return (
    <article className={`rounded-md border p-3 ${presentation.containerClass}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1 ${presentation.iconClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Badge variant="outline" className={presentation.badgeClass}>
                {sourceLabel}
              </Badge>
              <p className="mt-1.5 font-semibold leading-snug text-slate-900">
                {evidence.label}
              </p>
            </div>
            {evidence.link && (
              <Button asChild size="sm" variant="outline" className="h-8 shrink-0 gap-1 bg-white">
                {external ? (
                  <a href={evidence.link} target="_blank" rel="noreferrer">
                    {actionLabel} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <Link href={evidence.link}>
                    {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </Button>
            )}
          </div>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-slate-600">
            {evidence.detail}
          </p>
        </div>
      </div>
    </article>
  );
}
