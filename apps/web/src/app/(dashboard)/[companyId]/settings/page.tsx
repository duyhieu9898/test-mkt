'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

export default function SettingsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
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
  const loadIntegrations = useCallback(async () => {
    if (!token) return;
    try {
      const [platformsRes, statusRes] = await Promise.all([
        api.get<{ platforms: PlatformInfo[] }>('/integrations/platforms', { token }),
        api.get<{ connections: Record<string, ConnectionStatus> }>('/integrations/all-status', { token }),
      ]);
      setPlatforms(platformsRes.platforms || []);
      setConnectionStatuses(statusRes.connections || {});
    } catch {
      // Fallback — at minimum show GSC
      setConnectionStatuses({});
    } finally {
      setLoadingPlatforms(false);
    }
  }, [token]);

  useEffect(() => { loadIntegrations(); }, [loadIntegrations]);

  // Listen for OAuth popup messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'oauth_success') {
        toast.success(`${event.data.platform} connected!`);
        setConnectingPlatform(null);
        loadIntegrations();
      } else if (event.data?.type === 'oauth_error') {
        toast.error(`Failed to connect ${event.data.platform}: ${event.data.error}`);
        setConnectingPlatform(null);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadIntegrations]);

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
      const { url } = await api.post<{ url: string }>(`/integrations/${platformId}/connect`, {}, { token });
      window.open(url, '_blank', 'width=600,height=700');
    } catch {
      toast.error('This integration is not available right now. Please try again later.');
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async (platformId: string, displayName: string) => {
    if (!token) return;
    try {
      await api.post(`/integrations/${platformId}/disconnect`, {}, { token });
      toast.success(`${displayName} disconnected`);
      loadIntegrations();
    } catch {
      toast.error('Failed to disconnect. Please try again.');
    }
  };

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

      <Tabs defaultValue="company">
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

              {platforms.length === 0 && !connectionStatuses.google_search_console && (
                <Card className="p-8 text-center">
                  <Link2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No integrations available yet.</p>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Integration Card — Clean, business-friendly UI
// ============================================================================

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
