'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Building2,
  Save,
  Loader2,
  Globe,
  User,
  Settings,
  Link2,
  CheckCircle2,
  AlertCircle,
  Unplug,
  Code2,
  Github,
} from 'lucide-react';
import { useCompany, useCurrentUser } from '@/lib/api/hooks';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

// Platform icon mapping
const PLATFORM_ICONS: Record<string, string> = {
  facebook: '📘',
  instagram: '📸',
  linkedin: '💼',
  tiktok: '🎵',
  youtube: '▶️',
  twitter: '🐦',
  google: '🔍',
  google_search_console: '🌐',
  google_drive: '🌐',
  onedrive: '🌐',
};

interface PlatformInfo {
  platformId: string;
  displayName: string;
  description: string;
  category: string;
  hasSocial: boolean;
  hasAds: boolean;
  supportedFeatures: string[];
}

interface ConnectionStatus {
  connected: boolean;
  status: string;
  connectedAt?: string;
  accountName?: string;
  type: string;
}

type PublishingDestinationType = 'wordpress' | 'custom_api' | 'github';
type PublishingConnectionState = {
  type: PublishingDestinationType;
  connected: boolean;
  message: string;
} | null;

const GENERIC_PUBLISHING_NAMES = ['WordPress', 'Custom API', 'GitHub Repo'];

function isPlaceholderEndpointUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const sampleHosts = ['com', 'org', 'net'].map((tld) => ['example', tld].join('.'));
    return sampleHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

const DEFAULT_CUSTOM_API_PAYLOAD_TEMPLATE = `{
  "title": "{{title}}",
  "slug": "{{slug}}",
  "contentHtml": "{{contentHtml}}",
  "contentMarkdown": "{{contentMarkdown}}",
  "excerpt": "{{excerpt}}",
  "metaDescription": "{{metaDescription}}",
  "status": "{{status}}",
  "tags": {{tagsJson}},
  "images": {{imagesJson}}
}`;

export default function SettingsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const companyId = params.companyId as string;
  const requestedTab = searchParams.get('tab');
  const initialTab = requestedTab === 'integrations' || requestedTab === 'account' || requestedTab === 'publishing' ? requestedTab : 'company';
  const token = useAuthStore((state) => state.token);

  // REAL data from API
  const { data: company, isLoading: companyLoading } = useCompany(companyId);
  const { data: user, isLoading: userLoading } = useCurrentUser();

  // Editable form state — initialized from real data
  const [companyName, setCompanyName] = useState('');
  const [companyIndustry, setCompanyIndustry] = useState('');
  const [companyDescription, setCompanyDescription] = useState('');
  const [companyLanguage, setCompanyLanguage] = useState('en');
  const [isSaving, setIsSaving] = useState(false);

  // Dynamic platform data from API
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([]);
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionStatus>>({});
  const [loadingPlatforms, setLoadingPlatforms] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

  const [publishingLoading, setPublishingLoading] = useState(true);
  const [publishingSaving, setPublishingSaving] = useState(false);
  const [publishingTesting, setPublishingTesting] = useState(false);
  const [publishingConnection, setPublishingConnection] = useState<PublishingConnectionState>(null);
  const [publishingType, setPublishingType] = useState<PublishingDestinationType>('wordpress');
  const [publishingName, setPublishingName] = useState('');
  const [wordpressInfo, setWordpressInfo] = useState<{ siteUrl?: string; username?: string; connected?: boolean } | null>(null);
  const [wpSiteUrl, setWpSiteUrl] = useState('');
  const [wpUsername, setWpUsername] = useState('');
  const [wpAppPassword, setWpAppPassword] = useState('');
  const [wpConnecting, setWpConnecting] = useState(false);
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customHeaderName, setCustomHeaderName] = useState('Authorization');
  const [customHeaderValue, setCustomHeaderValue] = useState('');
  const [customPayloadTemplate, setCustomPayloadTemplate] = useState(DEFAULT_CUSTOM_API_PAYLOAD_TEMPLATE);
  const [customResponseIdPath, setCustomResponseIdPath] = useState('');
  const [customResponseUrlPath, setCustomResponseUrlPath] = useState('');
  const [githubRepository, setGithubRepository] = useState('');
  const [githubBranch, setGithubBranch] = useState('main');
  const [githubContentFolder, setGithubContentFolder] = useState('content/blog');
  const [githubFileFormat, setGithubFileFormat] = useState<'markdown' | 'mdx'>('markdown');
  const [githubToken, setGithubToken] = useState('');

  const handlePublishingTypeSelect = useCallback((nextType: PublishingDestinationType) => {
    setPublishingType(nextType);
    setPublishingConnection(null);
    setPublishingName((current) => (
      GENERIC_PUBLISHING_NAMES.includes(current.trim()) ? '' : current
    ));
  }, []);

  // Populate form from real company data
  useEffect(() => {
    if (company) {
      setCompanyName(company.name || '');
      setCompanyIndustry(company.industry || '');
      setCompanyDescription(company.description || '');
      setCompanyLanguage((company as any).settings?.language || 'en');
    }
  }, [company]);

  // Load platforms and connection statuses from API
  const loadIntegrations = useCallback(async (options?: { preserveConnectedPlatform?: string }) => {
    if (!token) return;
    try {
      const [platformsRes, statusRes] = await Promise.all([
        api.get<{ platforms: PlatformInfo[] }>('/integrations/platforms', { token }),
        api.get<{ connections: Record<string, ConnectionStatus> }>(`/integrations/all-status?companyId=${companyId}`, { token }),
      ]);
      setPlatforms(platformsRes.platforms || []);
      const nextConnections = statusRes.connections || {};
      setConnectionStatuses((current) => {
        const preservePlatform = options?.preserveConnectedPlatform;
        if (!preservePlatform || nextConnections[preservePlatform]?.connected) {
          return nextConnections;
        }

        // OAuth callbacks can arrive before the follow-up status endpoint
        // reflects the new row. Keep the just-connected card green while the
        // short polling loop below catches up with the database.
        const currentStatus = current[preservePlatform];
        if (!currentStatus?.connected) return nextConnections;
        return {
          ...nextConnections,
          [preservePlatform]: currentStatus,
        };
      });
    } catch {
      // Fallback — at minimum show GSC
      setConnectionStatuses((current) => {
        const preservePlatform = options?.preserveConnectedPlatform;
        if (preservePlatform && current[preservePlatform]?.connected) return current;
        return {};
      });
    } finally {
      setLoadingPlatforms(false);
    }
  }, [companyId, token]);

  useEffect(() => { loadIntegrations(); }, [loadIntegrations]);

  const loadPublishing = useCallback(async () => {
    if (!token) return;
    setPublishingLoading(true);
    try {
      const res = await api.get<{
        data: any;
        wordpress: { siteUrl?: string; username?: string; connected?: boolean } | null;
      }>(`/publishing/${companyId}`, { token });
      const data = res.data || {};
      const destinationType = ['wordpress', 'custom_api', 'github'].includes(data.destinationType)
        ? data.destinationType as PublishingDestinationType
        : 'wordpress';
      setPublishingType(destinationType);
      setPublishingConnection(null);
      setPublishingName(GENERIC_PUBLISHING_NAMES.includes((data.destinationName || '').trim()) ? '' : data.destinationName || '');
      setWordpressInfo(res.wordpress);
      setCustomEndpoint(data.customApi?.endpointUrl || '');
      setCustomHeaderName(data.customApi?.authHeaderName || 'Authorization');
      setCustomHeaderValue('');
      setCustomPayloadTemplate(data.customApi?.payloadTemplate || DEFAULT_CUSTOM_API_PAYLOAD_TEMPLATE);
      setCustomResponseIdPath(data.customApi?.responseIdPath || '');
      setCustomResponseUrlPath(data.customApi?.responseUrlPath || '');
      setGithubRepository(data.github?.repository || '');
      setGithubBranch(data.github?.branch || 'main');
      setGithubContentFolder(data.github?.contentFolder || 'content/blog');
      setGithubFileFormat(data.github?.fileFormat || 'markdown');
      setGithubToken('');
    } catch {
      setPublishingType('wordpress');
    } finally {
      setPublishingLoading(false);
    }
  }, [companyId, token]);

  useEffect(() => { loadPublishing(); }, [loadPublishing]);

  const pollConnectedPlatform = useCallback((platformId: string) => {
    if (!token) return;

    [0, 1000, 2500, 5000, 8000, 12000, 16000, 22000, 30000, 45000, 60000].forEach((delay) => {
      window.setTimeout(async () => {
        try {
          const statusRes = await api.get<{ connections: Record<string, ConnectionStatus> }>(
            `/integrations/all-status?companyId=${companyId}`,
            { token },
          );
          const nextConnections = statusRes.connections || {};
          if (!nextConnections[platformId]?.connected) return;

          setConnectingPlatform((current) => current === platformId ? null : current);
          setConnectionStatuses((current) => ({
            ...current,
            ...nextConnections,
            [platformId]: nextConnections[platformId]!,
          }));
        } catch {
          // Polling is best-effort; the regular Settings refresh still applies.
        }
      }, delay);
    });
  }, [companyId, token]);

  const checkConnectedPlatformNow = useCallback(async (platformId: string) => {
    if (!token) return false;

    try {
      const statusRes = await api.get<{ connections: Record<string, ConnectionStatus> }>(
        `/integrations/all-status?companyId=${companyId}`,
        { token },
      );
      const nextConnections = statusRes.connections || {};
      if (!nextConnections[platformId]?.connected) return false;

      setConnectingPlatform((current) => current === platformId ? null : current);
      setConnectionStatuses((current) => ({
        ...current,
        ...nextConnections,
        [platformId]: nextConnections[platformId]!,
      }));
      return true;
    } catch {
      return false;
    }
  }, [companyId, token]);

  // Listen for OAuth popup messages
  useEffect(() => {
    const normalizeOAuthPlatform = (platformId: string) => (
      platformId === 'one_drive' ? 'onedrive' : platformId
    );

    const refreshAfterOAuth = (rawPlatformId: string) => {
      const platformId = normalizeOAuthPlatform(rawPlatformId);
      setConnectingPlatform(null);
      // Update immediately so the Settings card reflects successful OAuth even
      // before the follow-up status request completes.
      setConnectionStatuses((current) => ({
        ...current,
        [platformId]: {
          connected: true,
          status: 'connected',
          connectedAt: new Date().toISOString(),
          accountName: current[platformId]?.accountName,
          type: current[platformId]?.type || 'social',
        },
      }));

      void loadIntegrations({ preserveConnectedPlatform: platformId });
      pollConnectedPlatform(platformId);
      [1000, 2500, 5000].forEach((delay) => {
        window.setTimeout(
          () => void loadIntegrations({ preserveConnectedPlatform: platformId }),
          delay,
        );
      });
    };

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'oauth_success') {
        const platformId = normalizeOAuthPlatform(event.data.platform);
        toast.success(`${platformId} connected!`);
        refreshAfterOAuth(platformId);
      } else if (event.data?.type === 'oauth_error') {
        toast.error(`Failed to connect ${event.data.platform}: ${event.data.error}`);
        setConnectingPlatform(null);
        void loadIntegrations();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadIntegrations, pollConnectedPlatform]);

  const handleSaveCompany = async () => {
    if (!token) return;
    setIsSaving(true);
    try {
      await api.patch(`/companies/${companyId}`, {
        name: companyName,
        industry: companyIndustry,
        description: companyDescription,
      }, { token });
      toast.success('Company settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnect = async (platformId: string) => {
    if (!token) return;
    setConnectingPlatform(platformId);
    try {
      const { url } = await api.post<{ url: string }>(`/integrations/${platformId}/connect`, { companyId }, { token });
      const popup = window.open(url, '_blank', 'width=600,height=700');
      if (!popup) {
        toast.error('Popup was blocked. Allow popups and try again.');
        setConnectingPlatform(null);
        return;
      }

      pollConnectedPlatform(platformId);
      const activePollTimer = window.setInterval(async () => {
        const connected = await checkConnectedPlatformNow(platformId);
        if (connected) window.clearInterval(activePollTimer);
      }, 1000);
      const focusHandler = () => {
        void checkConnectedPlatformNow(platformId);
        pollConnectedPlatform(platformId);
      };
      window.addEventListener('focus', focusHandler);

      // OAuth normally clears loading via postMessage from the callback page.
      // This fallback prevents a stuck button if the user closes the popup or
      // the callback origin is misconfigured and the message never arrives.
      const closedTimer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(closedTimer);
          window.clearInterval(activePollTimer);
          window.removeEventListener('focus', focusHandler);
          setConnectingPlatform((current) => current === platformId ? null : current);
          void checkConnectedPlatformNow(platformId);
          void loadIntegrations({ preserveConnectedPlatform: platformId });
          pollConnectedPlatform(platformId);
        }
      }, 500);
      window.setTimeout(() => {
        window.clearInterval(closedTimer);
        window.clearInterval(activePollTimer);
        window.removeEventListener('focus', focusHandler);
        setConnectingPlatform((current) => current === platformId ? null : current);
        void checkConnectedPlatformNow(platformId);
        void loadIntegrations({ preserveConnectedPlatform: platformId });
        pollConnectedPlatform(platformId);
      }, 120_000);
    } catch {
      toast.error('This integration is not available right now. Please try again later.');
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async (platformId: string, displayName: string) => {
    if (!token) return;
    try {
      await api.post(`/integrations/${platformId}/disconnect`, { companyId }, { token });
      toast.success(`${displayName} disconnected`);
      loadIntegrations();
    } catch {
      toast.error('Failed to disconnect. Please try again.');
    }
  };

  const handleConnectWordPress = async () => {
    if (!token) return;
    if (!wpSiteUrl.trim() || !wpUsername.trim() || !wpAppPassword.trim()) {
      toast.error('Please fill in Site URL, Username, and Application Password');
      return;
    }

    setWpConnecting(true);
    try {
      const res = await api.post<{ message?: string; siteUrl?: string }>(
        `/seo-engine/company/${companyId}/wordpress/connect`,
        {
          siteUrl: wpSiteUrl.trim(),
          username: wpUsername.trim(),
          appPassword: wpAppPassword,
        },
        { token },
      );
      const connectedSiteUrl = res.siteUrl || wpSiteUrl.trim().replace(/\/$/, '');

      await api.put(`/publishing/${companyId}`, {
        destinationType: 'wordpress',
        destinationName: publishingName || connectedSiteUrl,
      }, { token });

      setPublishingType('wordpress');
      setPublishingName((current) => current || connectedSiteUrl);
      setWordpressInfo({
        siteUrl: connectedSiteUrl,
        username: wpUsername.trim(),
        connected: true,
      });
      setWpSiteUrl('');
      setWpUsername('');
      setWpAppPassword('');
      toast.success(res.message || 'WordPress connected successfully');
      await loadPublishing();
    } catch (e) {
      toast.error((e as Error).message || 'Could not connect to WordPress');
    } finally {
      setWpConnecting(false);
    }
  };

  const buildPublishingPayload = () => ({
    destinationType: publishingType,
    destinationName: publishingName || undefined,
    customApi: publishingType === 'custom_api' ? {
      endpointUrl: customEndpoint.trim(),
      authHeaderName: customHeaderName,
      authHeaderValue: customHeaderValue,
      payloadTemplate: customPayloadTemplate,
      responseIdPath: customResponseIdPath,
      responseUrlPath: customResponseUrlPath,
    } : undefined,
    github: publishingType === 'github' ? {
      repository: githubRepository,
      branch: githubBranch,
      contentFolder: githubContentFolder,
      fileFormat: githubFileFormat,
      token: githubToken,
    } : undefined,
  });

  const handleSavePublishing = async () => {
    if (!token) return;
    if (publishingType === 'wordpress' && !wordpressInfo?.connected) {
      toast.error('Connect WordPress before saving it as the website destination');
      return;
    }
    if (publishingType === 'custom_api' && !customEndpoint.trim()) {
      toast.error('Enter the Custom API endpoint before saving.');
      return;
    }
    if (publishingType === 'custom_api' && isPlaceholderEndpointUrl(customEndpoint)) {
      toast.error('Custom API endpoint cannot use a sample URL. Enter the real website API endpoint.');
      return;
    }
    setPublishingSaving(true);
    try {
      const payload = buildPublishingPayload();
      await api.put(`/publishing/${companyId}`, payload, { token });
      toast.success('Website publishing destination saved');
      setCustomHeaderValue('');
      setGithubToken('');
      await loadPublishing();
      try {
        const testResult = await testPublishingDestination(payload.destinationType, payload);
        toast.success(testResult?.message || 'Publishing destination connected');
      } catch (testError) {
        toast.error(`Saved, but connection check failed: ${(testError as Error).message}`);
      }
    } catch (e) {
      toast.error((e as Error).message || 'Could not save publishing destination');
    } finally {
      setPublishingSaving(false);
    }
  };

  const testPublishingDestination = async (
    type = publishingType,
    payload: ReturnType<typeof buildPublishingPayload> = buildPublishingPayload(),
  ) => {
    if (!token) return;
    try {
      const res = await api.post<{ ok: boolean; message: string; destinationType?: PublishingDestinationType }>(
        `/publishing/${companyId}/test`,
        payload,
        { token },
      );
      const resultType = res.destinationType || type;
      setPublishingConnection({
        type: resultType,
        connected: res.ok,
        message: res.message,
      });
      if (!res.ok) {
        throw new Error(res.message);
      }
      return res;
    } catch (e) {
      const message = (e as Error).message || 'Could not test publishing destination';
      setPublishingConnection({
        type,
        connected: false,
        message,
      });
      throw e;
    }
  };

  const handleTestPublishing = async () => {
    if (publishingType === 'custom_api' && !customEndpoint.trim()) {
      toast.error('Enter the Custom API endpoint before testing.');
      return;
    }
    if (publishingType === 'custom_api' && isPlaceholderEndpointUrl(customEndpoint)) {
      toast.error('Custom API endpoint cannot use a sample URL. Enter the real website API endpoint.');
      return;
    }
    setPublishingTesting(true);
    try {
      const payload = buildPublishingPayload();
      const res = await testPublishingDestination(payload.destinationType, payload);
      toast.success(res?.message || 'Publishing destination connected');
    } catch (e) {
      toast.error((e as Error).message || 'Could not test publishing destination');
    } finally {
      setPublishingTesting(false);
    }
  };

  const activePublishingConnection = publishingConnection?.type === publishingType
    ? publishingConnection
    : null;
  const customApiStatus = publishingConnection?.type === 'custom_api'
    ? (publishingConnection.connected ? 'Connected' : 'Connection failed')
    : 'Requires endpoint contract';
  const githubStatus = publishingConnection?.type === 'github'
    ? (publishingConnection.connected ? 'Connected' : 'Connection failed')
    : 'Requires repo token';

  if (companyLoading || userLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Account and integrations</p>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="company" className="gap-1">
            <Building2 className="w-3.5 h-3.5" />
            Company
          </TabsTrigger>
          <TabsTrigger value="account" className="gap-1">
            <User className="w-3.5 h-3.5" />
            Account
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1">
            <Link2 className="w-3.5 h-3.5" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="publishing" className="gap-1">
            <Globe className="w-3.5 h-3.5" />
            Publishing
          </TabsTrigger>
        </TabsList>

        {/* === COMPANY TAB === */}
        <TabsContent value="company" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>This data was set during onboarding. Update if needed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Company Name</label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Your company name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Industry</label>
                <Input
                  value={companyIndustry}
                  onChange={(e) => setCompanyIndustry(e.target.value)}
                  placeholder="e.g. Education Technology"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={companyDescription}
                  onChange={(e) => setCompanyDescription(e.target.value)}
                  placeholder="What does your company do?"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Content Language</label>
                <p className="text-xs text-muted-foreground">AI will generate all content (banners, posts, pages) in this language</p>
                <Select value={companyLanguage} onValueChange={setCompanyLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="vi">Tiếng Việt</SelectItem>
                    <SelectItem value="zh">中文 (Chinese)</SelectItem>
                    <SelectItem value="ja">日本語 (Japanese)</SelectItem>
                    <SelectItem value="ko">한국어 (Korean)</SelectItem>
                    <SelectItem value="th">ภาษาไทย (Thai)</SelectItem>
                    <SelectItem value="fr">Français (French)</SelectItem>
                    <SelectItem value="es">Español (Spanish)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Show what AI detected */}
              {company && (
                <div className="pt-4 border-t">
                  <p className="text-xs text-muted-foreground mb-2">AI-detected business info:</p>
                  <div className="flex flex-wrap gap-2">
                    {company.industry && <Badge variant="secondary">{company.industry}</Badge>}
                    {(company as any).businessType && <Badge variant="secondary">{(company as any).businessType}</Badge>}
                    <Badge variant="outline">Status: {company.status}</Badge>
                  </div>
                </div>
              )}

              <Button onClick={handleSaveCompany} disabled={isSaving} className="gap-2">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === ACCOUNT TAB === */}
        <TabsContent value="account" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Your Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input value={user?.name || ''} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input value={user?.email || ''} disabled className="bg-muted" />
              </div>
              <p className="text-xs text-muted-foreground">
                Account created: {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === INTEGRATIONS TAB === */}
        <TabsContent value="integrations" className="mt-4 space-y-4">
          <div className="mb-2">
            <p className="text-sm text-muted-foreground">
              Connect your accounts to publish content and run ads directly from your dashboard.
            </p>
          </div>

          {loadingPlatforms ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Google Search Console */}
              <IntegrationCard
                icon={PLATFORM_ICONS.google_search_console}
                name="Google Search Console"
                description="See how your pages rank in Google Search"
                connected={connectionStatuses.google_search_console?.connected}
                connectedAt={connectionStatuses.google_search_console?.connectedAt}
                accountName={connectionStatuses.google_search_console?.accountName}
                isConnecting={connectingPlatform === 'google_search_console'}
                onConnect={() => handleConnect('google_search_console')}
                onDisconnect={() => handleDisconnect('google_search_console', 'Google Search Console')}
              />

              {/* All platforms from API — only shows what's ready */}
              <IntegrationCard
                icon={PLATFORM_ICONS.google_drive}
                name="Google Drive"
                description="Choose private Drive files as source context for Campaign Launcher"
                connected={connectionStatuses.google_drive?.connected}
                connectedAt={connectionStatuses.google_drive?.connectedAt}
                accountName={connectionStatuses.google_drive?.accountName}
                isConnecting={connectingPlatform === 'google_drive'}
                onConnect={() => handleConnect('google_drive')}
                onDisconnect={() => handleDisconnect('google_drive', 'Google Drive')}
                capabilities={['Read source files']}
              />

              <IntegrationCard
                icon={PLATFORM_ICONS.onedrive}
                name="OneDrive"
                description="Choose private OneDrive files as source context for Campaign Launcher"
                connected={connectionStatuses.onedrive?.connected}
                connectedAt={connectionStatuses.onedrive?.connectedAt}
                accountName={connectionStatuses.onedrive?.accountName}
                isConnecting={connectingPlatform === 'onedrive'}
                onConnect={() => handleConnect('onedrive')}
                onDisconnect={() => handleDisconnect('onedrive', 'OneDrive')}
                capabilities={['Read source files']}
              />

              {platforms.map((platform) => {
                const status = connectionStatuses[platform.platformId];
                const isError = status?.status === 'expired' || status?.status === 'error';

                return (
                  <IntegrationCard
                    key={platform.platformId}
                    icon={PLATFORM_ICONS[platform.platformId] || '🔌'}
                    name={platform.displayName}
                    description={platform.description}
                    connected={status?.connected}
                    connectedAt={status?.connectedAt}
                    accountName={status?.accountName}
                    isError={isError}
                    errorMessage={isError ? 'Connection expired. Please reconnect.' : undefined}
                    isConnecting={connectingPlatform === platform.platformId}
                    onConnect={() => handleConnect(platform.platformId)}
                    onDisconnect={() => handleDisconnect(platform.platformId, platform.displayName)}
                    capabilities={[
                      ...(platform.hasSocial ? ['Post content'] : []),
                      ...(platform.hasAds ? ['Run ads'] : []),
                    ]}
                  />
                );
              })}

              {platforms.length === 0 && !connectionStatuses.google_search_console && !connectionStatuses.google_drive && !connectionStatuses.onedrive && (
                <Card className="p-8 text-center">
                  <Link2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No integrations available yet.</p>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="publishing" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Website Publishing</CardTitle>
              <CardDescription>Choose where Campaign Launcher creates website blog drafts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {publishingLoading ? (
                <div className="py-8 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <PublishingOption icon={<Globe className="w-4 h-4" />} title="WordPress" description={wordpressInfo?.connected ? `Connected: ${wordpressInfo.siteUrl}` : 'Connect with Site URL, username, and Application Password.'} status={wordpressInfo?.connected ? 'Connected' : 'Setup available'} selected={publishingType === 'wordpress'} onClick={() => handlePublishingTypeSelect('wordpress')} />
                    <PublishingOption icon={<Code2 className="w-4 h-4" />} title="Custom API" description="Send a mapped draft payload to your own website endpoint." status={customApiStatus} selected={publishingType === 'custom_api'} onClick={() => handlePublishingTypeSelect('custom_api')} />
                    <PublishingOption icon={<Github className="w-4 h-4" />} title="GitHub Repo" description="Create a branch, Markdown/MDX file, and pull request." status={githubStatus} selected={publishingType === 'github'} onClick={() => handlePublishingTypeSelect('github')} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Destination name</label>
                    <Input value={publishingName} onChange={(e) => setPublishingName(e.target.value)} placeholder="e.g. Main website blog" />
                  </div>

                  {activePublishingConnection && (
                    <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                      activePublishingConnection.connected
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-rose-200 bg-rose-50 text-rose-800'
                    }`}>
                      {activePublishingConnection.connected ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      )}
                      <div>
                        <p className="font-medium">
                          {activePublishingConnection.connected ? 'Connected' : 'Connection failed'}
                        </p>
                        <p className="mt-0.5">{activePublishingConnection.message}</p>
                      </div>
                    </div>
                  )}

                  {publishingType === 'wordpress' && (
                    <div className="space-y-3 rounded-lg border p-3 text-sm">
                      {wordpressInfo?.connected ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span className="font-medium">Connected</span>
                            </div>
                            <p className="mt-1 text-muted-foreground">
                              {wordpressInfo.siteUrl}
                              {wordpressInfo.username ? ` as ${wordpressInfo.username}` : ''}
                            </p>
                          </div>
                          <Badge variant="secondary">Ready for drafts</Badge>
                        </div>
                      ) : (
                        <>
                          <div>
                            <p className="font-medium">Connect your WordPress site</p>
                            <p className="text-muted-foreground">
                              Campaign Launcher will use this connection to create WordPress drafts with images.
                            </p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5 sm:col-span-2">
                              <label className="text-sm font-medium">Site URL</label>
                              <Input
                                value={wpSiteUrl}
                                onChange={(e) => setWpSiteUrl(e.target.value)}
                                placeholder="https://yoursite.com"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium">Username</label>
                              <Input
                                value={wpUsername}
                                onChange={(e) => setWpUsername(e.target.value)}
                                placeholder="admin"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium">Application Password</label>
                              <Input
                                type="password"
                                value={wpAppPassword}
                                onChange={(e) => setWpAppPassword(e.target.value)}
                                placeholder="xxxx xxxx xxxx xxxx"
                              />
                            </div>
                          </div>
                          <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>
                              Create an Application Password in WordPress: <span className="font-medium text-foreground">Users - Profile - Application Passwords</span>.
                            </p>
                          </div>
                          <Button onClick={handleConnectWordPress} disabled={wpConnecting} className="gap-2">
                            {wpConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                            Connect WordPress
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {publishingType === 'custom_api' && (
                    <div className="space-y-3 rounded-lg border p-3">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Endpoint URL</label>
                          <Input value={customEndpoint} onChange={(e) => setCustomEndpoint(e.target.value)} placeholder="Paste your website API endpoint" />
                          {isPlaceholderEndpointUrl(customEndpoint) && (
                            <p className="text-[11px] text-rose-600">
                              This looks like a sample URL. Enter the real API endpoint from your website backend.
                            </p>
                          )}
                        </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Auth header</label>
                          <Input value={customHeaderName} onChange={(e) => setCustomHeaderName(e.target.value)} placeholder="Authorization" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Secret value</label>
                          <Input value={customHeaderValue} onChange={(e) => setCustomHeaderValue(e.target.value)} placeholder="Bearer xxxxx" type="password" />
                          <p className="text-[11px] text-muted-foreground">Leave blank to keep the saved secret.</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm font-medium">Payload JSON template</label>
                          <PayloadTemplateExampleDialog />
                        </div>
                        <Textarea
                          value={customPayloadTemplate}
                          onChange={(e) => setCustomPayloadTemplate(e.target.value)}
                          className="min-h-[220px] font-mono text-xs"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Available placeholders: title, slug, contentHtml, contentMarkdown, excerpt, metaDescription, status, heroImageUrl, tagsJson, imagesJson.
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Response ID path</label>
                          <Input value={customResponseIdPath} onChange={(e) => setCustomResponseIdPath(e.target.value)} placeholder="data.id" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Response URL path</label>
                          <Input value={customResponseUrlPath} onChange={(e) => setCustomResponseUrlPath(e.target.value)} placeholder="data.url" />
                        </div>
                      </div>
                    </div>
                  )}

                  {publishingType === 'github' && (
                    <div className="space-y-3 rounded-lg border p-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Repository</label>
                        <Input value={githubRepository} onChange={(e) => setGithubRepository(e.target.value)} placeholder="owner/repository" />
                      </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium">Branch</label>
                            <Input value={githubBranch} onChange={(e) => setGithubBranch(e.target.value)} placeholder="main" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Content folder</label>
                          <Input value={githubContentFolder} onChange={(e) => setGithubContentFolder(e.target.value)} placeholder="content/blog" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Format</label>
                          <Select value={githubFileFormat} onValueChange={(v) => setGithubFileFormat(v as 'markdown' | 'mdx')}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="markdown">Markdown</SelectItem>
                              <SelectItem value="mdx">MDX</SelectItem>
                            </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">GitHub access token</label>
                          <Input value={githubToken} onChange={(e) => setGithubToken(e.target.value)} placeholder="github_pat_xxxxx" type="password" />
                          <p className="text-[11px] text-muted-foreground">
                            Use a fine-grained token with Contents read/write and Pull requests read/write for this repository. Leave blank to keep the saved token.
                          </p>
                        </div>
                      </div>
                    )}

                  <div className="flex gap-2">
                    <Button onClick={handleSavePublishing} disabled={publishingSaving || wpConnecting} className="gap-2">
                      {publishingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save destination
                    </Button>
                    <Button variant="outline" onClick={handleTestPublishing} disabled={publishingTesting} className="gap-2">
                      {publishingTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Test
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Integration Card — Clean, business-friendly UI
// ============================================================================

function PublishingOption({
  icon,
  title,
  description,
  status,
  selected,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  status: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const isConnected = status === 'Connected';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition-colors ${
        selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
      <Badge
        variant={isConnected ? 'secondary' : 'outline'}
        className={`mt-2 gap-1 text-[10px] ${isConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}`}
      >
        {isConnected && <CheckCircle2 className="h-3 w-3" />}
        {status}
      </Badge>
    </button>
  );
}

function PayloadTemplateExampleDialog() {
  const templateExample = `{
  "leadText": "{{title}}",
  "urlSlug": "{{slug}}",
  "articleBody": "{{contentHtml}}",
  "shortSummary": "{{excerpt}}",
  "seo": {
    "description": "{{metaDescription}}"
  },
  "state": "{{status}}",
  "tags": {{tagsJson}},
  "images": {{imagesJson}}
}`;

  const renderedExample = `{
  "leadText": "Weekend trip to Da Nang",
  "urlSlug": "weekend-trip-to-da-nang",
  "articleBody": "<p>Discover a simple 2-day itinerary for Da Nang with beaches, local food.</p>",
  "shortSummary": "A friendly travel guide for a short Da Nang getaway.",
  "seo": {
    "description": "Plan a relaxing weekend trip to Da Nang with must-see places and local tips."
  },
  "state": "draft",
  "tags": ["travel", "da-nang", "weekend-trip"],
  "images": [
    {
      "url": "https://assets.your-website.com/da-nang-beach.jpg",
      "alt": "Da Nang beach at sunset",
      "role": "hero"
    }
  ]
}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          View example
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Custom API payload example</DialogTitle>
          <DialogDescription>
            Match your website API field names with Campaign Launcher placeholders.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border p-3">
            <p className="font-medium">Rule</p>
            <p className="mt-1 text-muted-foreground">
              The field name on the left is owned by your website API. The placeholder on the right is replaced by the AI-generated post data.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-md bg-muted p-2">
                <p className="text-xs font-medium text-muted-foreground">Your API field</p>
                <p className="font-mono text-sm">leadText</p>
              </div>
              <div className="rounded-md bg-muted p-2">
                <p className="text-xs font-medium text-muted-foreground">1Person value</p>
                <p className="font-mono text-sm">{'{{title}}'}</p>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 font-medium">Template to paste</p>
            <pre className="max-h-[280px] overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
              <code>{templateExample}</code>
            </pre>
          </div>

          <div>
            <p className="mb-2 font-medium">What your API receives</p>
            <pre className="max-h-[280px] overflow-auto rounded-lg bg-muted p-3 text-xs">
              <code>{renderedExample}</code>
            </pre>
          </div>

          <div className="rounded-lg border p-3">
            <p className="font-medium">Available placeholders</p>
            <p className="mt-1 text-muted-foreground">
              Use these exact names: {'{{title}}'}, {'{{slug}}'}, {'{{contentHtml}}'}, {'{{contentMarkdown}}'}, {'{{excerpt}}'}, {'{{metaDescription}}'}, {'{{status}}'}, {'{{heroImageUrl}}'}, {'{{tagsJson}}'}, {'{{imagesJson}}'}.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Put JSON arrays like {'{{tagsJson}}'} and {'{{imagesJson}}'} without quotes.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationCard({
  icon,
  name,
  description,
  connected,
  connectedAt,
  accountName,
  isError,
  errorMessage,
  isConnecting,
  onConnect,
  onDisconnect,
  capabilities,
}: {
  icon: string;
  name: string;
  description: string;
  connected?: boolean;
  connectedAt?: string;
  accountName?: string;
  isError?: boolean;
  errorMessage?: string;
  isConnecting?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  capabilities?: string[];
}) {
  return (
    <Card className={isError ? 'border-amber-200' : ''}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-muted rounded-xl shrink-0 text-2xl">{icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold">{name}</h3>
              {connected && !isError && (
                <Badge className="gap-1 bg-green-100 text-green-700 border-green-200">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </Badge>
              )}
              {isError && (
                <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-200">
                  <AlertCircle className="w-3 h-3" /> Reconnect needed
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>

            {/* Connected state — show account info */}
            {connected && !isError && (
              <div className="mt-2 space-y-1">
                {accountName && (
                  <p className="text-xs text-foreground/70">
                    Account: <span className="font-medium">{accountName}</span>
                  </p>
                )}
                {connectedAt && (
                  <p className="text-xs text-muted-foreground">
                    Connected {new Date(connectedAt).toLocaleDateString()}
                  </p>
                )}
                {capabilities && capabilities.length > 0 && (
                  <div className="flex gap-1.5 mt-1">
                    {capabilities.map((cap) => (
                      <Badge key={cap} variant="outline" className="text-[10px] font-normal">{cap}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Error state */}
            {isError && errorMessage && (
              <p className="text-xs text-amber-600 mt-1">{errorMessage}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-3">
              {connected && !isError ? (
                <Button size="sm" variant="outline" className="gap-1.5 text-muted-foreground hover:text-red-600" onClick={onDisconnect}>
                  <Unplug className="w-3.5 h-3.5" /> Disconnect
                </Button>
              ) : (
                <Button size="sm" onClick={onConnect} disabled={isConnecting} className="gap-2">
                  {isConnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Link2 className="w-4 h-4" />
                  )}
                  {isError ? 'Reconnect' : `Connect ${name}`}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
