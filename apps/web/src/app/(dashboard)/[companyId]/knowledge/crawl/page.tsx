'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe2,
  Loader2,
  Newspaper,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { KnowledgeTabs } from '@/components/knowledge/knowledge-tabs';
import { api } from '@/lib/api/client';
import { useCompany } from '@/lib/api/hooks';
import { normalizeAppLanguage, type AppLanguage } from '@/lib/app-language';
import { friendlyError } from '@/lib/friendly-errors';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

type CrawlSourceType = 'official_website' | 'news' | 'blog' | 'profile' | 'review' | 'web';

interface CrawlSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
  type: CrawlSourceType;
  sourceLabel: string;
  confidence: number;
  selectedByDefault: boolean;
  alreadyAdded: boolean;
}

interface CrawlDiscoveryResponse {
  company: {
    id: string;
    name: string;
    websiteUrl: string | null;
    domain: string | null;
  };
  searchFocus?: {
    query: string | null;
    targetUrl: string | null;
    domain: string | null;
    mode: 'public_google' | 'website';
  };
  sources: CrawlSource[];
  warnings: string[];
  searchedAt: string;
}

interface CrawlImportResponse {
  imported: number;
  skipped: number;
  failed: number;
  results: Array<{
    url: string;
    ok: boolean;
    status: 'imported' | 'skipped' | 'failed';
    documentId?: string;
    message?: string;
  }>;
}

interface CreditResponse {
  balance: { totalAvailable: number };
  costs?: {
    knowledgeCrawlDiscover?: number;
    supportMessage?: string;
  };
}

const typeIcons: Record<CrawlSourceType, typeof Globe2> = {
  official_website: ShieldCheck,
  news: Newspaper,
  blog: FileText,
  profile: Globe2,
  review: Search,
  web: Globe2,
};

const IMPORT_BATCH_SIZE = 8;
const IMPORT_SNIPPET_MAX_CHARS = 700;
const IMPORT_TITLE_MAX_CHARS = 255;

const crawlCopy: Record<AppLanguage, {
  title: string;
  subtitle: string;
  refresh: string;
  importSelected: (count: number) => string;
  importing: (done: number, total: number) => string;
  websiteLabel: string;
  websiteHelp: string;
  websitePlaceholder: string;
  topicLabel: string;
  topicHelp: string;
  topicPlaceholder: string;
  crawl: string;
  companyPublicScan: string;
  websiteScan: (url: string | null) => string;
  publicScan: (query: string | null) => string;
  publicBusinessScan: string;
  scanned: (time: string) => string;
  websiteOnly: string;
  freePublicDiscovery: string;
  scanningTitle: string;
  scanningWebsite: string;
  scanningPublic: string;
  crawlErrorTitle: string;
  retryMessage: string;
  noSourcesTitle: string;
  noSourcesFocused: string;
  noSourcesDefault: string;
  openBrandIq: string;
  sourcesFound: string;
  selectedSummary: (count: number) => string;
  reviewDocuments: string;
  alreadyAdded: string;
  open: string;
  match: string;
  importSuccess: (count: number) => string;
  importWarning: (count: number) => string;
  importInfo: string;
  importError: string;
  typeLabels: Record<CrawlSourceType, string>;
}> = {
  en: {
    title: 'Crawl Data',
    subtitle: 'AI scans your website, social profiles, blogs, news, and public mentions, then lets you choose what to add to Knowledge.',
    refresh: 'Refresh',
    importSelected: (count) => `Import ${count || ''} selected`.trim(),
    importing: (done, total) => `Importing ${done}/${total}`,
    websiteLabel: 'Website link',
    websiteHelp: 'Optional. If filled, AI only scans pages inside this website.',
    websitePlaceholder: 'Example: kidleaderhub.com',
    topicLabel: 'What do you want to crawl?',
    topicHelp: 'Optional. Leave blank to crawl data about the current business.',
    topicPlaceholder: 'Example: robotics classes for kids in Vietnam',
    crawl: 'Crawl',
    companyPublicScan: 'Company public scan',
    websiteScan: (url) => `Website scan: ${url || ''}`,
    publicScan: (query) => `Public scan: ${query || ''}`,
    publicBusinessScan: 'Public scan about the current business',
    scanned: (time) => ` · scanned ${time}`,
    websiteOnly: 'Website only',
    freePublicDiscovery: 'Free public discovery',
    scanningTitle: 'Scanning public sources...',
    scanningWebsite: 'Checking the website, sitemap, and internal pages that match your focus.',
    scanningPublic: 'Checking free public sources such as social profiles, blogs, news, and web mentions.',
    crawlErrorTitle: 'Could not crawl public data',
    retryMessage: 'Please try again in a moment.',
    noSourcesTitle: 'No public sources found yet',
    noSourcesFocused: 'Try a more specific website, brand name, or topic.',
    noSourcesDefault: 'Add a company website in Brand IQ, then come back here to scan again.',
    openBrandIq: 'Open Brand IQ',
    sourcesFound: 'Sources found',
    selectedSummary: (count) => `${count} selected · large imports are processed in small safe batches.`,
    reviewDocuments: 'Review documents',
    alreadyAdded: 'Already added',
    open: 'Open',
    match: 'match',
    importSuccess: (count) => `${count} source${count === 1 ? '' : 's'} imported for review`,
    importWarning: (count) => `${count} source${count === 1 ? '' : 's'} could not be read`,
    importInfo: 'Those sources were already added',
    importError: "We couldn't import those sources. Please try again.",
    typeLabels: {
      official_website: 'Official',
      news: 'News',
      blog: 'Blog',
      profile: 'Profile',
      review: 'Review',
      web: 'Web',
    },
  },
  vi: {
    title: 'Crawl Data',
    subtitle: 'AI quét website, hồ sơ mạng xã hội, blog, tin tức và các nguồn công khai, sau đó cho bạn chọn nội dung đưa vào Knowledge.',
    refresh: 'Làm mới',
    importSelected: (count) => `Import ${count || ''} mục đã chọn`.trim(),
    importing: (done, total) => `Đang import ${done}/${total}`,
    websiteLabel: 'Link website',
    websiteHelp: 'Không bắt buộc. Nếu nhập, AI chỉ quét các trang bên trong website này.',
    websitePlaceholder: 'VD: kidleaderhub.com',
    topicLabel: 'Bạn muốn crawl nội dung gì?',
    topicHelp: 'Không bắt buộc. Để trống để crawl dữ liệu về doanh nghiệp hiện tại.',
    topicPlaceholder: 'VD: lớp robotics cho trẻ em tại Việt Nam',
    crawl: 'Crawl',
    companyPublicScan: 'Quét thông tin công khai của công ty',
    websiteScan: (url) => `Quét trong website: ${url || ''}`,
    publicScan: (query) => `Quét nguồn công khai: ${query || ''}`,
    publicBusinessScan: 'Quét nguồn công khai về doanh nghiệp hiện tại',
    scanned: (time) => ` · đã quét ${time}`,
    websiteOnly: 'Chỉ trong website',
    freePublicDiscovery: 'Tìm kiếm công khai miễn phí',
    scanningTitle: 'Đang quét nguồn công khai...',
    scanningWebsite: 'Đang kiểm tra website, sitemap và các trang nội bộ phù hợp với nội dung bạn muốn tìm.',
    scanningPublic: 'Đang kiểm tra các nguồn miễn phí như hồ sơ mạng xã hội, blog, tin tức và nhắc đến trên web.',
    crawlErrorTitle: 'Không thể crawl dữ liệu công khai',
    retryMessage: 'Vui lòng thử lại sau ít phút.',
    noSourcesTitle: 'Chưa tìm thấy nguồn công khai',
    noSourcesFocused: 'Hãy thử website, tên thương hiệu hoặc chủ đề cụ thể hơn.',
    noSourcesDefault: 'Thêm website công ty trong Brand IQ, rồi quay lại đây để quét lại.',
    openBrandIq: 'Mở Brand IQ',
    sourcesFound: 'Nguồn tìm thấy',
    selectedSummary: (count) => `${count} mục đã chọn · dữ liệu lớn sẽ được import theo từng nhóm nhỏ an toàn.`,
    reviewDocuments: 'Xem documents',
    alreadyAdded: 'Đã thêm',
    open: 'Mở',
    match: 'khớp',
    importSuccess: (count) => `Đã import ${count} nguồn để review`,
    importWarning: (count) => `${count} nguồn không đọc được`,
    importInfo: 'Các nguồn này đã được thêm trước đó',
    importError: 'Không thể import các nguồn này. Vui lòng thử lại.',
    typeLabels: {
      official_website: 'Chính thức',
      news: 'Tin tức',
      blog: 'Blog',
      profile: 'Hồ sơ',
      review: 'Đánh giá',
      web: 'Web',
    },
  },
  ja: {
    title: 'データをクロール',
    subtitle: 'AIがWebサイト、SNSプロフィール、ブログ、ニュース、公開メンションを確認し、Knowledgeに追加する情報を選べます。',
    refresh: '更新',
    importSelected: (count) => `${count || ''}件をインポート`.trim(),
    importing: (done, total) => `インポート中 ${done}/${total}`,
    websiteLabel: 'Webサイトリンク',
    websiteHelp: '任意。入力すると、このWebサイト内のページだけをクロールします。',
    websitePlaceholder: '例: kidleaderhub.com',
    topicLabel: '何についてクロールしますか？',
    topicHelp: '任意。空欄の場合は現在の事業についてクロールします。',
    topicPlaceholder: '例: 子ども向けロボット教室',
    crawl: 'クロール',
    companyPublicScan: '会社の公開情報スキャン',
    websiteScan: (url) => `Webサイト内スキャン: ${url || ''}`,
    publicScan: (query) => `公開情報スキャン: ${query || ''}`,
    publicBusinessScan: '現在の事業に関する公開情報スキャン',
    scanned: (time) => ` · スキャン ${time}`,
    websiteOnly: 'Webサイト内のみ',
    freePublicDiscovery: '無料の公開情報検索',
    scanningTitle: '公開情報をスキャン中...',
    scanningWebsite: '指定されたテーマに合うWebサイト、サイトマップ、内部ページを確認しています。',
    scanningPublic: 'SNSプロフィール、ブログ、ニュース、Web上の言及など無料の公開情報を確認しています。',
    crawlErrorTitle: '公開データをクロールできませんでした',
    retryMessage: '少し時間をおいてもう一度お試しください。',
    noSourcesTitle: '公開ソースがまだ見つかりません',
    noSourcesFocused: 'より具体的なWebサイト、ブランド名、またはテーマで試してください。',
    noSourcesDefault: 'Brand IQに会社のWebサイトを追加してから、もう一度スキャンしてください。',
    openBrandIq: 'Brand IQを開く',
    sourcesFound: '見つかったソース',
    selectedSummary: (count) => `${count}件選択中 · 大きなインポートは安全な小分け処理で実行されます。`,
    reviewDocuments: 'ドキュメントを確認',
    alreadyAdded: '追加済み',
    open: '開く',
    match: '一致',
    importSuccess: (count) => `${count}件のソースをレビュー用にインポートしました`,
    importWarning: (count) => `${count}件のソースを読み取れませんでした`,
    importInfo: 'これらのソースはすでに追加されています',
    importError: 'ソースをインポートできませんでした。もう一度お試しください。',
    typeLabels: {
      official_website: '公式',
      news: 'ニュース',
      blog: 'ブログ',
      profile: 'プロフィール',
      review: 'レビュー',
      web: 'Web',
    },
  },
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function compactSourceForImport(source: CrawlSource) {
  return {
    url: source.url,
    title: source.title.slice(0, IMPORT_TITLE_MAX_CHARS),
    type: source.type,
    snippet: source.snippet.slice(0, IMPORT_SNIPPET_MAX_CHARS),
  };
}

function sourceSelectionKey(source: CrawlSource) {
  return source.url.trim().replace(/\/$/, '').toLowerCase();
}

function formatTime(value?: string, language: AppLanguage = 'en') {
  if (!value) return '';
  return new Intl.DateTimeFormat(language === 'ja' ? 'ja-JP' : language === 'vi' ? 'vi-VN' : undefined, {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

export default function KnowledgeCrawlPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const qc = useQueryClient();
  const { data: company } = useCompany(companyId);
  const language = normalizeAppLanguage(company?.settings?.language);
  const tx = crawlCopy[language] || crawlCopy.en;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [websiteInput, setWebsiteInput] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [activeWebsiteInput, setActiveWebsiteInput] = useState('');
  const [activeTopicInput, setActiveTopicInput] = useState('');

  const { data: creditsData } = useQuery<CreditResponse>({
    queryKey: ['credits', companyId],
    queryFn: () => api.get(`/credits/${companyId}`, { token: token! }),
    enabled: !!token,
    staleTime: 30 * 1000,
  });
  const crawlCreditCost = creditsData?.costs?.knowledgeCrawlDiscover ?? 20;
  const hasEnoughCrawlCredits =
    !creditsData || creditsData.balance.totalAvailable >= crawlCreditCost;

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['knowledge-crawl-discovery', companyId, activeWebsiteInput, activeTopicInput, language],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (activeWebsiteInput.trim()) qs.set('websiteUrl', activeWebsiteInput.trim());
      if (activeTopicInput.trim()) qs.set('q', activeTopicInput.trim());
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return api.get<CrawlDiscoveryResponse>(
        `/knowledge/company/${companyId}/crawl/discover${suffix}`,
        { token: token! },
      );
    },
    enabled: !!token && hasEnoughCrawlCredits,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const sources = data?.sources || [];

  const selectedSources = useMemo(
    () => sources.filter((source) => selected.has(sourceSelectionKey(source)) && !source.alreadyAdded),
    [selected, sources],
  );

  useEffect(() => {
    if (!data) return;
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ['credits', companyId] });
  }, [data?.searchedAt]);

  const runFocusedCrawl = () => {
    if (!hasEnoughCrawlCredits) {
      toast.error(creditsData?.costs?.supportMessage || 'You do not have enough credits for this action.');
      return;
    }
    const nextWebsite = websiteInput.trim();
    const nextTopic = topicInput.trim();
    setActiveWebsiteInput(nextWebsite);
    setActiveTopicInput(nextTopic);
    setSelected(new Set());
    if (nextWebsite === activeWebsiteInput && nextTopic === activeTopicInput) {
      refetch();
    }
  };

  const toggleSource = (source: CrawlSource) => {
    if (source.alreadyAdded) return;
    const key = sourceSelectionKey(source);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const importSelected = async () => {
    if (!token || selectedSources.length === 0 || isImporting) return;
    setIsImporting(true);
    setImportProgress({ done: 0, total: selectedSources.length });
    try {
      const totals = { imported: 0, skipped: 0, failed: 0 };

      for (const batch of chunkArray(selectedSources, IMPORT_BATCH_SIZE)) {
        const res = await api.post<CrawlImportResponse>(
          `/knowledge/company/${companyId}/crawl/import`,
          {
            visibility: 'internal',
            sources: batch.map(compactSourceForImport),
          },
          { token },
        );

        totals.imported += res.imported;
        totals.skipped += res.skipped;
        totals.failed += res.failed;
        setImportProgress((current) => ({
          done: Math.min((current?.done || 0) + batch.length, selectedSources.length),
          total: selectedSources.length,
        }));
      }

      if (totals.imported > 0) {
        toast.success(tx.importSuccess(totals.imported));
      }
      if (totals.failed > 0) {
        toast.warning(tx.importWarning(totals.failed));
      }
      if (totals.imported === 0 && totals.skipped > 0 && totals.failed === 0) {
        toast.info(tx.importInfo);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['knowledge-docs', companyId] }),
        qc.invalidateQueries({ queryKey: ['knowledge-entries', companyId] }),
        qc.invalidateQueries({ queryKey: ['knowledge-crawl-discovery', companyId] }),
        qc.invalidateQueries({ queryKey: ['credits', companyId] }),
      ]);
    } catch (err) {
      toast.error(friendlyError(err, tx.importError));
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <KnowledgeTabs />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Globe2 className="w-6 h-6 text-indigo-500" /> {tx.title}
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            {tx.subtitle}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (!hasEnoughCrawlCredits) {
                toast.error(creditsData?.costs?.supportMessage || 'You do not have enough credits for this action.');
                return;
              }
              refetch();
            }}
            disabled={isFetching || !hasEnoughCrawlCredits}
            className="gap-2"
          >
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {tx.refresh} · {crawlCreditCost} credits
          </Button>
          <Button
            onClick={importSelected}
            disabled={selectedSources.length === 0 || isImporting}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {isImporting && importProgress
              ? tx.importing(importProgress.done, importProgress.total)
              : tx.importSelected(selectedSources.length)}
          </Button>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <label className="text-sm font-semibold text-slate-900">
                {tx.websiteLabel}
              </label>
              <p className="text-xs text-slate-500 mt-1">
                {tx.websiteHelp}
              </p>
              <Input
                value={websiteInput}
                onChange={(event) => setWebsiteInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') runFocusedCrawl();
                }}
                placeholder={tx.websitePlaceholder}
                className="mt-2"
              />
            </div>
            <div className="min-w-0">
              <label className="text-sm font-semibold text-slate-900">
                {tx.topicLabel}
              </label>
              <p className="text-xs text-slate-500 mt-1">
                {tx.topicHelp}
              </p>
              <Input
                value={topicInput}
                onChange={(event) => setTopicInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') runFocusedCrawl();
                }}
                placeholder={tx.topicPlaceholder}
                className="mt-2"
              />
            </div>
            <Button
              onClick={runFocusedCrawl}
              disabled={isFetching || !hasEnoughCrawlCredits}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white lg:w-36"
            >
              {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {tx.crawl} · {crawlCreditCost} credits
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-indigo-100 bg-indigo-50/40">
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">
              {data?.company.name || tx.companyPublicScan}
            </div>
            <div className="text-xs text-slate-600 truncate">
              {data?.searchFocus?.mode === 'website'
                ? tx.websiteScan(data.searchFocus.targetUrl)
                : data?.searchFocus?.query
                  ? tx.publicScan(data.searchFocus.query)
                  : tx.publicBusinessScan}
              {data?.searchedAt ? tx.scanned(formatTime(data.searchedAt, language)) : ''}
            </div>
          </div>
          <Badge variant="outline" className="w-fit bg-white">
            {data?.searchFocus?.mode === 'website' ? tx.websiteOnly : tx.freePublicDiscovery}
          </Badge>
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
            <div className="font-semibold text-slate-900">{tx.scanningTitle}</div>
            <p className="text-sm text-slate-500 mt-1 max-w-md">
              {activeWebsiteInput
                ? tx.scanningWebsite
                : tx.scanningPublic}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-900">{tx.crawlErrorTitle}</div>
              <p className="text-sm text-red-700">{friendlyError(error, tx.retryMessage)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && data?.warnings?.length ? (
        <div className="space-y-2">
          {data.warnings.map((warning) => (
            <Card key={warning} className="border-amber-200 bg-amber-50">
              <CardContent className="p-3 flex items-start gap-2 text-sm text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{warning}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!isLoading && data && sources.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Globe2 className="w-9 h-9 text-slate-300 mx-auto mb-3" />
            <h2 className="font-semibold text-slate-900">{tx.noSourcesTitle}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {activeWebsiteInput || activeTopicInput
                ? tx.noSourcesFocused
                : tx.noSourcesDefault}
            </p>
            {!activeWebsiteInput && !activeTopicInput && (
              <Button asChild variant="outline" className="mt-4">
                <Link href={`/${companyId}/brand-iq`}>{tx.openBrandIq}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {sources.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">{tx.sourcesFound}</h2>
              <p className="text-xs text-slate-500">
                {tx.selectedSummary(selectedSources.length)}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/${companyId}/knowledge`}>{tx.reviewDocuments}</Link>
            </Button>
          </div>

          {sources.map((source) => {
            const Icon = typeIcons[source.type] || Globe2;
            const key = sourceSelectionKey(source);
            const checked = selected.has(key);
            return (
              <Card
                key={key}
                className={cn(
                  'transition-colors',
                  checked && !source.alreadyAdded ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200',
                  source.alreadyAdded && 'bg-slate-50',
                )}
              >
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <Checkbox
                      checked={source.alreadyAdded ? false : checked}
                      disabled={source.alreadyAdded}
                      onCheckedChange={() => toggleSource(source)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="secondary" className="gap-1">
                          <Icon className="w-3 h-3" />
                          {tx.typeLabels[source.type] || tx.typeLabels.web}
                        </Badge>
                        <Badge variant="outline">{Math.round(source.confidence * 100)}% {tx.match}</Badge>
                        <span className="text-xs text-slate-500">{source.sourceLabel}</span>
                        {source.alreadyAdded && (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{tx.alreadyAdded}</Badge>
                        )}
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900 line-clamp-2">{source.title}</h3>
                          <p className="text-sm text-slate-600 line-clamp-2 mt-1">{source.snippet || source.url}</p>
                          <p className="text-xs text-slate-500 truncate mt-2">{source.url}</p>
                        </div>
                        <Button asChild variant="ghost" size="sm" className="shrink-0 gap-1">
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {tx.open} <ExternalLink className="w-3 h-3" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
