'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  ExternalLink,
  FileText,
  Globe,
  History,
  Loader2,
  Power,
  Server,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  companyId: string;
  onPublished?: (url: string) => void;
}

interface PageData {
  id: string;
  name: string;
  slug: string;
  status: string;
  subdomain: string | null;
  publishedUrl: string | null;
  deploymentProvider: string | null;
  wordpressReviewUrl: string | null;
}

interface WordPressPage {
  id: number;
  title: string;
  slug: string;
  link: string;
  parent: number;
  template: string;
}

interface PublishOptions {
  hosted: {
    baseDomain: string | null;
    baseUrl: string | null;
    urlMode: 'path' | 'subdomain';
  };
  wordpress: {
    connected: boolean;
    siteUrl?: string;
    pages: WordPressPage[];
    templates: Array<{ value: string; label: string }>;
    menus: Array<{ id: number; name: string; locations: string[] }>;
    current?: {
      pageId: number;
      parentPageId: number | null;
      template: string | null;
    } | null;
  };
}

interface PublishHistoryItem {
  id: string;
  target: string;
  publicationStatus: 'draft' | 'publish';
  status: 'pending' | 'building' | 'deploying' | 'live' | 'failed' | 'rolled_back';
  isCurrent: boolean;
  version: number | null;
  versionId: string | null;
  url: string | null;
  createdAt: string;
  errorMessage: string | null;
}

type PublishTarget = 'hosted' | 'wordpress';
type WordPressStatus = 'draft' | 'publish';

const HOSTED_PUBLISHING_ENABLED = false;

function normalizeSubdomain(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+/, '');
}

function getPageDepth(page: WordPressPage, pagesById: Map<number, WordPressPage>) {
  let depth = 0;
  let parentId = page.parent;
  const visited = new Set<number>();
  while (parentId && !visited.has(parentId) && depth < 5) {
    visited.add(parentId);
    depth += 1;
    parentId = pagesById.get(parentId)?.parent || 0;
  }
  return depth;
}

function formatPublishedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function PublishHistoryPanel({
  items,
  loading,
  open,
  expanded,
  onOpenChange,
  onExpandedChange,
  onPreview,
  previewingVersionId,
  offlineConfirmationOpen,
  onOfflineConfirmationChange,
  unpublishing,
}: {
  items: PublishHistoryItem[];
  loading: boolean;
  open: boolean;
  expanded: boolean;
  onOpenChange: () => void;
  onExpandedChange: () => void;
  onPreview: (item: PublishHistoryItem) => void;
  previewingVersionId: string | null;
  offlineConfirmationOpen: boolean;
  onOfflineConfirmationChange: (open: boolean) => void;
  unpublishing: boolean;
}) {
  const visibleItems = expanded ? items : items.slice(0, 3);

  return (
    <div className="border">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
        onClick={onOpenChange}
        aria-expanded={open}
      >
        <History className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Publish history</span>
          <span className="block text-sm text-muted-foreground">
            {loading
              ? 'Loading publishing activity...'
              : items.length === 0
              ? 'This page has not been published yet.'
              : `${items.length} publish ${items.length === 1 ? 'activity' : 'activities'}`}
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t">
          {loading ? (
            <div className="flex items-center justify-center px-4 py-5 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-5 text-center text-sm text-muted-foreground">
              Your draft and live publishing activity will appear here.
            </div>
          ) : (
            <>
              <div className="divide-y">
                {visibleItems.map((item) => {
                  const isFailed = item.status === 'failed';
                  const title = isFailed
                    ? 'Publish failed'
                    : item.target === 'wordpress'
                      ? item.publicationStatus === 'draft'
                        ? 'Saved as a WordPress draft'
                        : 'Published on WordPress'
                      : 'Published as a public website';
                  const statusLabel = isFailed
                    ? 'Needs attention'
                    : item.isCurrent
                      ? item.publicationStatus === 'draft'
                        ? 'Current draft'
                        : 'Currently live'
                      : 'Previous version';

                  return (
                    <div
                      key={item.id}
                      className={`flex flex-wrap items-start gap-3 px-4 py-3 ${
                        item.isCurrent ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        isFailed ? 'bg-red-100 text-red-700' : item.isCurrent ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
                      }`}>
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-[180px] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{title}</p>
                          <span className={`text-xs font-medium ${
                            isFailed ? 'text-red-700' : item.isCurrent ? 'text-emerald-700' : 'text-muted-foreground'
                          }`}>
                            {statusLabel}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatPublishedAt(item.createdAt)}
                          {item.version ? ` · Version ${item.version}` : ''}
                        </p>
                        {isFailed && item.errorMessage && (
                          <p className="mt-1 text-xs text-red-700">{item.errorMessage}</p>
                        )}
                      </div>
                      <div className="flex w-full flex-wrap justify-end gap-2 pl-11 sm:w-auto sm:shrink-0 sm:pl-0">
                        {item.isCurrent && item.url ? (
                          <Button variant="outline" size="sm" asChild>
                            <a href={item.url} target="_blank" rel="noreferrer">
                              {item.publicationStatus === 'draft' ? 'Review' : 'Open'}
                              <ExternalLink className="ml-2 h-3.5 w-3.5" />
                            </a>
                          </Button>
                        ) : item.versionId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPreview(item)}
                            disabled={previewingVersionId === item.versionId}
                          >
                            {previewingVersionId === item.versionId
                              ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                              : <Eye className="mr-2 h-3.5 w-3.5" />}
                            Preview
                          </Button>
                        ) : null}
                        {item.isCurrent && item.publicationStatus === 'publish' && !isFailed && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                            onClick={() => onOfflineConfirmationChange(!offlineConfirmationOpen)}
                            disabled={unpublishing}
                          >
                            <Power className="mr-2 h-3.5 w-3.5" />
                            Take offline
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {items.length > 3 && (
                <div className="border-t px-4 py-2 text-center">
                  <Button variant="ghost" size="sm" onClick={onExpandedChange}>
                    {expanded ? 'Show less' : `Show all (${items.length})`}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function PublishDialog({
  open,
  onOpenChange,
  pageId,
  companyId,
  onPublished,
}: PublishDialogProps) {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<PublishTarget>('wordpress');
  const [subdomain, setSubdomain] = useState('');
  const [wpStatus, setWpStatus] = useState<WordPressStatus>('draft');
  const [placement, setPlacement] = useState<'root' | 'child'>('root');
  const [parentPageId, setParentPageId] = useState('');
  const [template, setTemplate] = useState('default');
  const [menuId, setMenuId] = useState('none');
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [previewingVersionId, setPreviewingVersionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [offlineConfirmationOpen, setOfflineConfirmationOpen] = useState(false);

  const { data: page } = useQuery<PageData>({
    queryKey: ['publish-dialog-page', pageId],
    queryFn: async () => {
      const result = await api.get<{ success: boolean; data: PageData }>(
        `/landing-pages/${pageId}`,
        { token: token! },
      );
      return result.data;
    },
    enabled: !!token && open,
  });
  const { data: options, isLoading: optionsLoading } = useQuery<PublishOptions>({
    queryKey: ['landing-page-publish-options', pageId],
    queryFn: () => api.get<PublishOptions>(`/landing-pages/${pageId}/publish-options`, { token: token! }),
    enabled: !!token && open,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: publishHistory = [], isLoading: historyLoading } = useQuery<PublishHistoryItem[]>({
    queryKey: ['landing-page-publish-history', pageId],
    queryFn: async () => {
      const result = await api.get<{ history: PublishHistoryItem[] }>(
        `/landing-pages/${pageId}/publish-history`,
        { token: token! },
      );
      return result.history;
    },
    enabled: !!token && open,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!page) return;
    setSubdomain(page.subdomain || page.slug || '');
    if (page.deploymentProvider === 'wordpress') setTarget('wordpress');
    if (page.deploymentProvider === 'cloudflare' && HOSTED_PUBLISHING_ENABLED) setTarget('hosted');
    if (page.deploymentProvider === 'wordpress' && page.status === 'published') setWpStatus('publish');
  }, [page, open]);

  useEffect(() => {
    if (!open) setOfflineConfirmationOpen(false);
  }, [open]);

  useEffect(() => {
    const current = options?.wordpress.current;
    if (!current) return;
    setPlacement(current.parentPageId ? 'child' : 'root');
    setParentPageId(current.parentPageId ? String(current.parentPageId) : '');
    setTemplate(current.template || 'default');
  }, [options?.wordpress.current]);

  const isPublished = page?.status === 'published' && !!page.publishedUrl;
  const publishedTarget: PublishTarget | null = page?.deploymentProvider === 'wordpress'
    ? 'wordpress'
    : page?.deploymentProvider === 'cloudflare'
      ? 'hosted'
      : null;
  const normalizedSubdomain = normalizeSubdomain(subdomain);
  const hostedConfigured = options?.hosted.urlMode === 'path'
    ? !!options.hosted.baseUrl
    : !!options?.hosted.baseDomain;
  const websiteUrl = options?.hosted.urlMode === 'path' && options.hosted.baseUrl
    ? `${options.hosted.baseUrl.replace(/\/+$/, '')}/${normalizedSubdomain || 'your-site'}`
    : options?.hosted.baseDomain
      ? `https://${normalizedSubdomain || 'your-site'}.${options.hosted.baseDomain}`
      : '';
  const pagesById = useMemo(
    () => new Map((options?.wordpress.pages || []).map((item) => [item.id, item])),
    [options?.wordpress.pages],
  );
  const wordpressPages = useMemo(
    () => [...(options?.wordpress.pages || [])].sort((a, b) => a.title.localeCompare(b.title)),
    [options?.wordpress.pages],
  );

  const invalidatePageData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['landingPage', pageId] }),
      queryClient.invalidateQueries({ queryKey: ['landingPages'] }),
      queryClient.invalidateQueries({ queryKey: ['publish-dialog-page', pageId] }),
      queryClient.invalidateQueries({ queryKey: ['landing-page-publish-history', pageId] }),
    ]);
  };

  const handlePublish = async () => {
    if (!token) return;
    if (target === 'hosted') {
      if (!HOSTED_PUBLISHING_ENABLED) return toast.info('Public website publishing is coming soon.');
      if (!hostedConfigured) return toast.error('Hosted website URL is not configured.');
      if (normalizedSubdomain.length < 3) return toast.error('Website address must use at least 3 characters.');
    }
    if (target === 'wordpress') {
      if (!options?.wordpress.connected) return toast.error('Connect WordPress before publishing.');
      if (placement === 'child' && !parentPageId) return toast.error('Choose the page this landing page belongs under.');
    }

    setSubmitting(true);
    try {
      const result = await api.post<{
        success: boolean;
        publishedUrl: string;
        message: string;
      }>(
        `/landing-pages/${pageId}/publish`,
        target === 'hosted'
          ? { target, subdomain: normalizedSubdomain }
          : {
            target,
            wordpress: {
              status: wpStatus,
              parentPageId: placement === 'child' ? Number(parentPageId) : undefined,
              template: template === 'default' ? undefined : template,
              menuId: menuId === 'none' ? undefined : Number(menuId),
            },
          },
        { token },
      );
      await invalidatePageData();
      toast.success(result.message || 'Landing page published.');
      onPublished?.(result.publishedUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not publish landing page.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnpublish = async () => {
    if (!token) return;
    setUnpublishing(true);
    try {
      await api.post(`/landing-pages/${pageId}/unpublish`, {}, { token });
      await invalidatePageData();
      toast.success('Landing page is now offline.');
      setOfflineConfirmationOpen(false);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not take the page offline.');
    } finally {
      setUnpublishing(false);
    }
  };

  const handlePreviewVersion = async (item: PublishHistoryItem) => {
    if (!token || !item.versionId) return;
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      toast.error('Allow pop-ups to preview this version.');
      return;
    }
    previewWindow.opener = null;
    previewWindow.document.write('<!doctype html><title>Loading preview</title><p style="font-family:system-ui;padding:24px">Loading preview...</p>');
    setPreviewingVersionId(item.versionId);
    try {
      const result = await api.get<{ html: string }>(
        `/landing-pages/${pageId}/publish-history/${item.versionId}/preview`,
        { token },
      );
      previewWindow.document.open();
      previewWindow.document.write(result.html);
      previewWindow.document.close();
    } catch (error) {
      previewWindow.close();
      toast.error(error instanceof Error ? error.message : 'Could not preview this version.');
    } finally {
      setPreviewingVersionId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Publish landing page
          </DialogTitle>
          <DialogDescription>
            Add this page to your WordPress website or publish it as a new public website.
          </DialogDescription>
        </DialogHeader>

        <PublishHistoryPanel
          items={publishHistory}
          loading={historyLoading}
          open={historyOpen}
          expanded={historyExpanded}
          onOpenChange={() => setHistoryOpen((value) => !value)}
          onExpandedChange={() => setHistoryExpanded((value) => !value)}
          onPreview={handlePreviewVersion}
          previewingVersionId={previewingVersionId}
          offlineConfirmationOpen={offlineConfirmationOpen}
          onOfflineConfirmationChange={setOfflineConfirmationOpen}
          unpublishing={unpublishing}
        />

        {offlineConfirmationOpen && isPublished && (
          <div className="flex flex-col gap-3 border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-700" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-900">
                Take this landing page offline?
              </p>
              <p className="text-xs text-red-800">
                Visitors will no longer be able to open it. The page and its publish history stay saved, so you can publish it again later.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOfflineConfirmationOpen(false)}
                disabled={unpublishing}
              >
                Keep it live
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={handleUnpublish}
                disabled={unpublishing}
              >
                {unpublishing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Yes, take offline
              </Button>
            </div>
          </div>
        )}

        {optionsLoading ? (
          <div className="flex min-h-56 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            <div className="space-y-3">
              <Label>Where should this page go?</Label>
              <RadioGroup
                value={target}
                onValueChange={(value) => {
                  if (value === 'hosted' && !HOSTED_PUBLISHING_ENABLED) {
                    toast.info('Create a new public website is coming soon.');
                    return;
                  }
                  setTarget(value as PublishTarget);
                }}
                className="grid gap-3 sm:grid-cols-2"
              >
                <label className={`flex gap-3 border p-4 ${target === 'hosted' ? 'border-primary bg-primary/5' : ''} ${!HOSTED_PUBLISHING_ENABLED || (isPublished && publishedTarget !== 'hosted') ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                  <RadioGroupItem
                    value="hosted"
                    disabled={!HOSTED_PUBLISHING_ENABLED || (isPublished && publishedTarget !== 'hosted')}
                  />
                  <Server className="h-5 w-5 shrink-0" />
                  <span>
                    <span className="flex items-center gap-2 font-semibold">
                      Create a new public website
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Coming soon
                      </span>
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      We host it and give you a public link.
                    </span>
                  </span>
                </label>
                <label className={`flex cursor-pointer gap-3 border p-4 ${target === 'wordpress' ? 'border-primary bg-primary/5' : ''} ${isPublished && publishedTarget !== 'wordpress' ? 'cursor-not-allowed opacity-50' : ''}`}>
                  <RadioGroupItem value="wordpress" disabled={isPublished && publishedTarget !== 'wordpress'} />
                  <Globe className="h-5 w-5 shrink-0" />
                  <span>
                    <span className="block font-semibold">Add to my WordPress website</span>
                    <span className="block text-sm text-muted-foreground">
                      {options?.wordpress.connected
                        ? options.wordpress.siteUrl
                        : 'WordPress is not connected yet.'}
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            {target === 'hosted' ? (
              <div className="space-y-2">
                <Label htmlFor="site-address">Website address</Label>
                <div className="flex items-center">
                  {options?.hosted.urlMode === 'path' && (
                    <div className="h-10 max-w-[65%] truncate border bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {options.hosted.baseUrl?.replace(/\/+$/, '') || 'URL not configured'}/
                    </div>
                  )}
                  <Input
                    id="site-address"
                    value={subdomain}
                    onChange={(event) => setSubdomain(normalizeSubdomain(event.target.value))}
                    className={`font-mono ${
                      options?.hosted.urlMode === 'path' ? 'rounded-l-none' : 'rounded-r-none'
                    }`}
                    maxLength={60}
                    disabled={isPublished}
                  />
                  {options?.hosted.urlMode !== 'path' && (
                    <div className="h-10 max-w-[55%] truncate border border-l-0 bg-muted px-3 py-2 text-sm text-muted-foreground">
                      .{options?.hosted.baseDomain || 'domain not configured'}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {websiteUrl || 'Ask an administrator to configure hosted website publishing.'}
                </p>
              </div>
            ) : !options?.wordpress.connected ? (
              <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Connect WordPress in Website Publishing settings before publishing this page.
                <Button variant="link" className="h-auto px-2 text-amber-900" asChild>
                  <a href={`/${companyId}/settings?tab=publishing`}>Open settings</a>
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-3">
                  <Label>Page location</Label>
                  <RadioGroup
                    value={placement}
                    onValueChange={(value) => setPlacement(value as 'root' | 'child')}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    <label className={`flex cursor-pointer items-center gap-3 border p-3 ${placement === 'root' ? 'border-primary bg-primary/5' : ''}`}>
                      <RadioGroupItem value="root" />
                      <span>
                        <span className="block font-medium">Standalone page</span>
                        <span className="block text-xs text-muted-foreground">Example: /{page?.slug}</span>
                      </span>
                    </label>
                    <label className={`flex cursor-pointer items-center gap-3 border p-3 ${placement === 'child' ? 'border-primary bg-primary/5' : ''}`}>
                      <RadioGroupItem value="child" />
                      <span>
                        <span className="block font-medium">Under an existing page</span>
                        <span className="block text-xs text-muted-foreground">Example: /products/{page?.slug}</span>
                      </span>
                    </label>
                  </RadioGroup>
                </div>

                {placement === 'child' && (
                  <div className="space-y-2">
                    <Label>Choose the parent page</Label>
                    <Select value={parentPageId} onValueChange={setParentPageId}>
                      <SelectTrigger><SelectValue placeholder="Select a page" /></SelectTrigger>
                      <SelectContent>
                        {wordpressPages.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {'- '.repeat(getPageDepth(item, pagesById))}{item.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-3">
                  <Label>What should happen first?</Label>
                  <RadioGroup
                    value={wpStatus}
                    onValueChange={(value) => setWpStatus(value as WordPressStatus)}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    <label className={`flex cursor-pointer gap-3 border p-3 ${wpStatus === 'draft' ? 'border-primary bg-primary/5' : ''}`}>
                      <RadioGroupItem value="draft" />
                      <span>
                        <span className="block font-medium">Save as draft</span>
                        <span className="block text-xs text-muted-foreground">Review it in WordPress before going live.</span>
                      </span>
                    </label>
                    <label className={`flex cursor-pointer gap-3 border p-3 ${wpStatus === 'publish' ? 'border-primary bg-primary/5' : ''}`}>
                      <RadioGroupItem value="publish" />
                      <span>
                        <span className="block font-medium">Publish now</span>
                        <span className="block text-xs text-muted-foreground">Visitors can see it immediately.</span>
                      </span>
                    </label>
                  </RadioGroup>
                </div>

                {(options.wordpress.templates.length > 0 || options.wordpress.menus.length > 0) && (
                  <details className="border px-4 py-3">
                    <summary className="cursor-pointer font-medium">Advanced options</summary>
                    <div className="grid gap-4 pt-4 sm:grid-cols-2">
                      {options.wordpress.templates.length > 0 && (
                        <div className="space-y-2">
                          <Label>Page template</Label>
                          <Select value={template} onValueChange={setTemplate}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Default theme template</SelectItem>
                              {options.wordpress.templates
                                .filter((item) => item.value)
                                .map((item) => (
                                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {options.wordpress.menus.length > 0 && !isPublished && wpStatus === 'publish' && (
                        <div className="space-y-2">
                          <Label>Add a link to a menu</Label>
                          <Select value={menuId} onValueChange={setMenuId}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Do not add to a menu</SelectItem>
                              {options.wordpress.menus.map((menu) => (
                                <SelectItem key={menu.id} value={String(menu.id)}>
                                  {menu.name}{menu.locations.length ? ` (${menu.locations.join(', ')})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={handlePublish}
              disabled={
                submitting
                || optionsLoading
                || (target === 'hosted' && !HOSTED_PUBLISHING_ENABLED)
                || (target === 'hosted' && (!hostedConfigured || normalizedSubdomain.length < 3))
                || (target === 'wordpress' && !options?.wordpress.connected)
              }
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              {isPublished ? 'Publish changes' : wpStatus === 'draft' && target === 'wordpress' ? 'Create draft' : 'Publish'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
