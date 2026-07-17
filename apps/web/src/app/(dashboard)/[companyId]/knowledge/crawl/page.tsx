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
import { KnowledgeTabs } from '@/components/knowledge/knowledge-tabs';
import { api } from '@/lib/api/client';
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

const typeLabels: Record<CrawlSourceType, string> = {
  official_website: 'Official',
  news: 'News',
  blog: 'Blog',
  profile: 'Profile',
  review: 'Review',
  web: 'Web',
};

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

function formatTime(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['knowledge-crawl-discovery', companyId],
    queryFn: () => api.get<CrawlDiscoveryResponse>(
      `/knowledge/company/${companyId}/crawl/discover`,
      { token: token! },
    ),
    enabled: !!token,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const sources = data?.sources || [];

  useEffect(() => {
    if (!data) return;
    setSelected(new Set());
  }, [data?.searchedAt]);

  const selectedSources = useMemo(
    () => sources.filter((source) => selected.has(source.id) && !source.alreadyAdded),
    [selected, sources],
  );

  const toggleSource = (source: CrawlSource) => {
    if (source.alreadyAdded) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(source.id)) next.delete(source.id);
      else next.add(source.id);
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
        toast.success(`${totals.imported} source${totals.imported === 1 ? '' : 's'} imported for review`);
      }
      if (totals.failed > 0) {
        toast.warning(`${totals.failed} source${totals.failed === 1 ? '' : 's'} could not be read`);
      }
      if (totals.imported === 0 && totals.skipped > 0 && totals.failed === 0) {
        toast.info('Those sources were already added');
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['knowledge-docs', companyId] }),
        qc.invalidateQueries({ queryKey: ['knowledge-entries', companyId] }),
        qc.invalidateQueries({ queryKey: ['knowledge-crawl-discovery', companyId] }),
      ]);
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't import those sources. Please try again."));
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
            <Globe2 className="w-6 h-6 text-indigo-500" /> Crawl Data
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            AI scans your company website and public mentions, then lets you choose what to add to Knowledge.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </Button>
          <Button
            onClick={importSelected}
            disabled={selectedSources.length === 0 || isImporting}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {isImporting && importProgress
              ? `Importing ${importProgress.done}/${importProgress.total}`
              : `Import ${selectedSources.length || ''} selected`.trim()}
          </Button>
        </div>
      </div>

      <Card className="border-indigo-100 bg-indigo-50/40">
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">
              {data?.company.name || 'Company public scan'}
            </div>
            <div className="text-xs text-slate-600 truncate">
              {data?.company.websiteUrl || 'No website saved yet'}
              {data?.searchedAt ? ` · scanned ${formatTime(data.searchedAt)}` : ''}
            </div>
          </div>
          <Badge variant="outline" className="w-fit bg-white">
            Search starts automatically
          </Badge>
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
            <div className="font-semibold text-slate-900">Scanning public sources...</div>
            <p className="text-sm text-slate-500 mt-1 max-w-md">
              Checking the saved website, sitemap, public news, and available search results.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-900">Could not crawl public data</div>
              <p className="text-sm text-red-700">{friendlyError(error, 'Please try again in a moment.')}</p>
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
            <h2 className="font-semibold text-slate-900">No public sources found yet</h2>
            <p className="text-sm text-slate-500 mt-1">
              Add a company website in Brand IQ, then come back here to scan again.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href={`/${companyId}/brand-iq`}>Open Brand IQ</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {sources.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Sources found</h2>
              <p className="text-xs text-slate-500">
                {selectedSources.length} selected · large imports are processed in small safe batches.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/${companyId}/knowledge`}>Review documents</Link>
            </Button>
          </div>

          {sources.map((source) => {
            const Icon = typeIcons[source.type] || Globe2;
            const checked = selected.has(source.id);
            return (
              <Card
                key={source.id}
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
                          {typeLabels[source.type] || 'Web'}
                        </Badge>
                        <Badge variant="outline">{Math.round(source.confidence * 100)}% match</Badge>
                        <span className="text-xs text-slate-500">{source.sourceLabel}</span>
                        {source.alreadyAdded && (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Already added</Badge>
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
                            Open <ExternalLink className="w-3 h-3" />
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
