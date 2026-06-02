'use client';

/**
 * LLM Configuration admin panel.
 *
 * Non-technical admin UI for managing all LLM providers + per-feature
 * assignment. Replaces .env for LLM configuration. Matches the
 * KidLeaderHub reference screenshot pattern.
 *
 * Layout:
 *   - Header with "Test Connections" button
 *   - 4 provider status cards (Ollama / Anthropic / OpenAI / Gemini)
 *     showing connection state + masked API key
 *   - Feature → LLM mapping table with inline edit
 */

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Brain, RefreshCw, Pencil, CheckCircle2, XCircle, AlertCircle,
  Loader2, Save, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { friendlyError } from '@/lib/friendly-errors';

interface ProviderRow {
  id: string;
  category: 'provider';
  key: string;
  label: string;
  description: string | null;
  value: {
    baseUrl?: string;
    models?: string[];
  };
  secrets: Record<string, string>;
  secretFields: string[];
  status: 'unknown' | 'connected' | 'error' | 'unconfigured';
  statusMessage: string | null;
  enabled: boolean;
}

interface FeatureTier {
  name: 'fast' | 'balanced' | 'premium';
  label: string;
  description?: string;
  provider: string;
  model: string;
  creditCost: number;
}

interface FeatureRow {
  id: string;
  category: 'feature';
  key: string;
  label: string;
  description: string | null;
  value: {
    // New: tier array (Genspark-style quality picker)
    tiers?: FeatureTier[];
    defaultTier?: 'fast' | 'balanced' | 'premium';
    // Legacy: flat fields (kept for backward-compat reads)
    provider?: string;
    model?: string;
    fallbackProvider?: string;
    fallbackModel?: string;
    temperature?: number;
    maxTokens?: number;
  };
  enabled: boolean;
}

const TIER_META: Record<string, { icon: string; color: string }> = {
  fast: { icon: '⚡', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  balanced: { icon: '⭐', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  premium: { icon: '💎', color: 'bg-purple-50 text-purple-700 border-purple-200' },
};

interface ImageProviderRow {
  id: string;
  category: 'image';
  key: string;
  label: string;
  description: string | null;
  value: {
    tier?: 'fast' | 'balanced' | 'premium';
    creditCost?: number;
    model?: string;
    endpoint?: string;
    modelKey?: string;
    pro?: boolean;
    inferenceSteps?: number;
    guidanceScale?: number;
  };
  secrets: Record<string, string>;
  secretFields: string[];
  status: 'unknown' | 'connected' | 'error' | 'unconfigured';
  statusMessage: string | null;
  enabled: boolean;
}

interface ConfigSnapshot {
  providers: ProviderRow[];
  features: FeatureRow[];
  integrations: any[];
  imageProviders: ImageProviderRow[];
}

const IMAGE_TIER_META: Record<string, { icon: string; color: string; label: string }> = {
  fast: { icon: '⚡', color: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Standard' },
  balanced: { icon: '⭐', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', label: 'Pro' },
  premium: { icon: '💎', color: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Ultra' },
};

const IMAGE_PROVIDER_META: Record<string, { icon: string; delegatesTo?: string }> = {
  'gemini-imagen': { icon: '✨', delegatesTo: 'gemini' },
  dalle: { icon: '🎨', delegatesTo: 'openai' },
  banana: { icon: '🍌' },
  'banana-pro': { icon: '🍌✨' },
};

const PROVIDER_STYLES: Record<string, { color: string; accent: string; icon: string }> = {
  ollama: { color: 'border-orange-200', accent: 'bg-orange-50 text-orange-700', icon: '🦙' },
  anthropic: { color: 'border-amber-200', accent: 'bg-amber-50 text-amber-700', icon: '🧠' },
  openai: { color: 'border-green-200', accent: 'bg-green-50 text-green-700', icon: '⚡' },
  gemini: { color: 'border-blue-200', accent: 'bg-blue-50 text-blue-700', icon: '✨' },
};

export default function LlmConfigPage() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  const [editingProvider, setEditingProvider] = useState<ProviderRow | null>(null);
  const [editingFeature, setEditingFeature] = useState<FeatureRow | null>(null);
  const [editingImage, setEditingImage] = useState<ImageProviderRow | null>(null);
  const [testingAll, setTestingAll] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => api.get<ConfigSnapshot>('/admin/config', { token: token! }),
    enabled: !!token,
  });

  // Seed defaults on first mount if providers is empty, OR upgrade image
  // rows that don't yet have the tier/creditCost schema.
  useEffect(() => {
    if (!token || !data) return;
    const empty = data.providers.length === 0 && data.features.length === 0;
    const imagesMissingTier =
      data.imageProviders.length > 0 &&
      data.imageProviders.some((img) => !img.value?.tier);
    const missingBananaPro =
      data.imageProviders.length > 0 &&
      !data.imageProviders.some((img) => img.key === 'banana-pro');
    if (empty || imagesMissingTier || missingBananaPro) {
      api
        .post(
          '/admin/config/seed',
          { overwriteImages: imagesMissingTier || missingBananaPro },
          { token },
        )
        .then(() => refetch())
        .catch(() => {});
    }
  }, [token, data, refetch]);

  const onTestAll = async () => {
    if (!token || !data) return;
    setTestingAll(true);
    try {
      await Promise.all(
        data.providers.map((p) =>
          api.post(`/admin/config/provider/${p.key}/test`, {}, { token })
            .catch(() => null),
        ),
      );
      toast.success('Connection tests complete');
      qc.invalidateQueries({ queryKey: ['admin-config'] });
    } finally {
      setTestingAll(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading config…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Brain className="w-6 h-6 text-indigo-500" /> LLM Configuration
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Configure which AI model powers each feature. Changes take effect immediately.
          </p>
        </div>
        <Button onClick={onTestAll} disabled={testingAll} variant="outline" className="gap-2">
          {testingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Test Connections
        </Button>
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.providers.map((p) => {
          const style = PROVIDER_STYLES[p.key] ?? { color: 'border-slate-200', accent: 'bg-slate-50 text-slate-700', icon: '🔧' };
          const isConnected = p.status === 'connected';
          const isError = p.status === 'error';
          const hasKey = p.secrets.apiKey && p.secrets.apiKey !== '(not set)';

          return (
            <Card
              key={p.id}
              className={`cursor-pointer hover:shadow-md transition-all ${style.color} ${isConnected ? 'bg-green-50/40' : isError ? 'bg-red-50/20' : ''}`}
              onClick={() => setEditingProvider(p)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className={`flex items-center gap-1.5 text-sm font-semibold ${isConnected ? 'text-green-700' : isError ? 'text-red-700' : 'text-slate-700'}`}>
                    <span className="text-base">{style.icon}</span>
                    {p.label}
                  </div>
                  <Pencil className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-xs">
                  {isConnected && (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-3 h-3" /> Connected
                    </div>
                  )}
                  {isError && (
                    <div className="text-red-600">
                      <div className="flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Error
                      </div>
                      {p.statusMessage && (
                        <div className="mt-0.5 text-[10px] truncate">{p.statusMessage}</div>
                      )}
                    </div>
                  )}
                  {!isConnected && !isError && !hasKey && (
                    <div className="flex items-center gap-1 text-slate-500">
                      <AlertCircle className="w-3 h-3" /> No API key — click to add
                    </div>
                  )}
                  {!isConnected && !isError && hasKey && (
                    <div className="flex items-center gap-1 text-slate-500">
                      <AlertCircle className="w-3 h-3" /> Not tested
                    </div>
                  )}
                </div>
                {hasKey && (
                  <div className="mt-2 text-[10px] text-slate-500 font-mono truncate">
                    Key: {p.secrets.apiKey}
                  </div>
                )}
                {p.value.baseUrl && (
                  <div className="mt-1 text-[10px] text-slate-400 truncate">
                    {p.value.baseUrl}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Feature table — tier-aware layout matching the pricing model */}
      <div>
        <div className="flex items-center justify-between mb-3 mt-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Features → Quality tiers</h2>
            <p className="text-xs text-slate-600">
              Each feature has 3 quality tiers. Users pick at runtime — credits scale with quality.
              Click any tier to remap it to a different provider/model or change credit cost.
            </p>
          </div>
        </div>

        <Card>
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_70px_70px] gap-3 px-5 py-3 border-b bg-slate-50/50 text-xs font-semibold text-slate-600">
            <div>Feature</div>
            <div className="flex items-center gap-1">⚡ Fast</div>
            <div className="flex items-center gap-1">⭐ Balanced</div>
            <div className="flex items-center gap-1">💎 Premium</div>
            <div className="text-center">Status</div>
            <div className="text-center">Edit</div>
          </div>
          {data.features.map((f) => {
            const tiers = f.value.tiers ?? [];
            const fast = tiers.find((t) => t.name === 'fast');
            const balanced = tiers.find((t) => t.name === 'balanced');
            const premium = tiers.find((t) => t.name === 'premium');

            const TierCell = ({ tier }: { tier: FeatureTier | undefined }) => {
              if (!tier) {
                return <div className="text-xs text-slate-400">—</div>;
              }
              return (
                <div className="text-xs">
                  <div className="font-medium text-slate-700 truncate" title={`${tier.provider}:${tier.model}`}>
                    {tier.provider}
                  </div>
                  <div className="font-mono text-[10px] text-slate-500 truncate">
                    {tier.model}
                  </div>
                  <div className="text-[10px] text-indigo-600 font-semibold mt-0.5">
                    {tier.creditCost} {tier.creditCost === 1 ? 'credit' : 'credits'}
                  </div>
                </div>
              );
            };

            return (
              <div
                key={f.id}
                className="grid grid-cols-[1.6fr_1fr_1fr_1fr_70px_70px] gap-3 px-5 py-3 border-b last:border-b-0 items-center hover:bg-slate-50/50"
              >
                <div>
                  <div className="font-medium text-slate-900 text-sm">{f.label}</div>
                  {f.description && (
                    <div className="text-xs text-slate-500 truncate" title={f.description}>{f.description}</div>
                  )}
                </div>
                <TierCell tier={fast} />
                <TierCell tier={balanced} />
                <TierCell tier={premium} />
                <div className="text-center">
                  <Switch
                    checked={f.enabled}
                    onCheckedChange={async (checked) => {
                      try {
                        await api.put(
                          `/admin/config/feature/${f.key}`,
                          { enabled: checked },
                          { token: token! },
                        );
                        qc.invalidateQueries({ queryKey: ['admin-config'] });
                      } catch (err) {
                        toast.error(friendlyError(err));
                      }
                    }}
                  />
                </div>
                <div className="text-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingFeature(f)}
                    className="h-8 w-8 p-0"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          {data.features.length === 0 && (
            <div className="p-12 text-center text-sm text-slate-500">
              No feature mappings yet. Click "Test Connections" to seed defaults.
            </div>
          )}
        </Card>
      </div>

      {/* Image generation providers */}
      <div>
        <div className="flex items-center justify-between mb-3 mt-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Image generation providers</h2>
            <p className="text-xs text-slate-600">
              Configure which image engines power banner generation. Users pick
              Standard / Pro / Ultra when generating a banner — set credit cost per
              quality tier here.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.imageProviders.map((img) => {
            const tier = img.value.tier ?? 'balanced';
            const meta = IMAGE_TIER_META[tier] ?? IMAGE_TIER_META.balanced;
            const providerMeta = IMAGE_PROVIDER_META[img.key] ?? { icon: '🖼️' };
            const hasKey = !!providerMeta.delegatesTo
              ? true
              : img.secrets.apiKey && img.secrets.apiKey !== '(not set)';
            const isConnected = img.status === 'connected';
            const isError = img.status === 'error';
            return (
              <Card
                key={img.id}
                className={`cursor-pointer hover:shadow-md transition-all ${meta.color} ${!img.enabled ? 'opacity-60' : ''}`}
                onClick={() => setEditingImage(img)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="text-base">{providerMeta.icon}</span>
                      <span className="truncate">{img.label}</span>
                    </div>
                    <Pencil className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <span>{meta.icon}</span> {meta.label}
                    </Badge>
                    <div className="text-indigo-600 font-semibold">
                      {img.value.creditCost ?? 0} credits
                    </div>
                  </div>
                  {isConnected && (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-green-600">
                      <CheckCircle2 className="w-3 h-3" /> Ready
                    </div>
                  )}
                  {isError && (
                    <div className="mt-2 text-[11px] text-red-600">
                      <div className="flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Error
                      </div>
                      {img.statusMessage && (
                        <div className="mt-0.5 text-[10px] truncate">{img.statusMessage}</div>
                      )}
                    </div>
                  )}
                  {!isConnected && !isError && !hasKey && (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
                      <AlertCircle className="w-3 h-3" />
                      {providerMeta.delegatesTo
                        ? `Needs ${providerMeta.delegatesTo} key`
                        : 'No API key'}
                    </div>
                  )}
                  {!isConnected && !isError && hasKey && (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
                      <AlertCircle className="w-3 h-3" /> Not tested
                    </div>
                  )}
                  {img.description && (
                    <div className="mt-2 text-[10px] text-slate-500 line-clamp-2">
                      {img.description}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {data.imageProviders.length === 0 && (
            <div className="col-span-full p-8 text-center text-sm text-slate-500 border border-dashed rounded-lg">
              No image providers yet. Click "Test Connections" to seed defaults.
            </div>
          )}
        </div>
      </div>

      {/* Provider edit dialog */}
      <ProviderDialog
        provider={editingProvider}
        onClose={() => setEditingProvider(null)}
        token={token}
        onSaved={() => {
          setEditingProvider(null);
          qc.invalidateQueries({ queryKey: ['admin-config'] });
        }}
      />

      {/* Feature edit dialog */}
      <FeatureDialog
        feature={editingFeature}
        providers={data.providers}
        onClose={() => setEditingFeature(null)}
        token={token}
        onSaved={() => {
          setEditingFeature(null);
          qc.invalidateQueries({ queryKey: ['admin-config'] });
        }}
      />

      {/* Image provider edit dialog */}
      <ImageProviderDialog
        image={editingImage}
        onClose={() => setEditingImage(null)}
        token={token}
        onSaved={() => {
          setEditingImage(null);
          qc.invalidateQueries({ queryKey: ['admin-config'] });
        }}
      />
    </div>
  );
}

// ─── Provider dialog ────────────────────────────────────────────────

function ProviderDialog({
  provider,
  onClose,
  token,
  onSaved,
}: {
  provider: ProviderRow | null;
  onClose: () => void;
  token: string | null;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (provider) {
      setApiKey(''); // Start empty so user can type without erasing. Empty = keep existing.
      setBaseUrl((provider.value.baseUrl as string) ?? '');
    }
  }, [provider]);

  if (!provider) return null;

  const onSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await api.put(
        `/admin/config/provider/${provider.key}`,
        {
          value: { ...provider.value, baseUrl: baseUrl || undefined },
          secrets: apiKey ? { apiKey } : undefined,
        },
        { token },
      );
      toast.success(`${provider.label} saved`);
      onSaved();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    if (!token) return;
    setTesting(true);
    try {
      const res = await api.post<{ ok: boolean; message: string }>(
        `/admin/config/provider/${provider.key}/test`,
        {},
        { token },
      );
      if (res.ok) {
        toast.success(`${provider.label}: ${res.message}`);
      } else {
        toast.error(`${provider.label}: ${res.message}`);
      }
      onSaved();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={!!provider} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {PROVIDER_STYLES[provider.key]?.icon} {provider.label}
          </DialogTitle>
          <DialogDescription>{provider.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="apikey" className="mb-1.5 block">
              API Key
            </Label>
            <Input
              id="apikey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                provider.secrets.apiKey && provider.secrets.apiKey !== '(not set)'
                  ? `Current: ${provider.secrets.apiKey} (leave empty to keep)`
                  : 'Paste your API key'
              }
            />
            <p className="text-xs text-slate-500 mt-1">
              Stored encrypted with AES-256-GCM. Never visible in plaintext.
            </p>
          </div>

          <div>
            <Label htmlFor="baseurl" className="mb-1.5 block">
              Base URL
            </Label>
            <Input
              id="baseurl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          {provider.value.models && provider.value.models.length > 0 && (
            <div>
              <Label className="mb-1.5 block">Available models</Label>
              <div className="flex flex-wrap gap-1.5">
                {provider.value.models.map((m) => (
                  <Badge key={m} variant="secondary" className="font-mono text-[10px]">
                    {m}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {provider.status === 'error' && provider.statusMessage && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <strong>Last error:</strong> {provider.statusMessage}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onTest} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
            Test connection
          </Button>
          <Button onClick={onSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Feature dialog ─────────────────────────────────────────────────

function FeatureDialog({
  feature,
  providers,
  onClose,
  token,
  onSaved,
}: {
  feature: FeatureRow | null;
  providers: ProviderRow[];
  onClose: () => void;
  token: string | null;
  onSaved: () => void;
}) {
  // 3-tier state
  const blankTier = (name: 'fast' | 'balanced' | 'premium', label: string): FeatureTier => ({
    name,
    label,
    description: '',
    provider: 'openai',
    model: 'gpt-4o-mini',
    creditCost: name === 'fast' ? 1 : name === 'balanced' ? 3 : 10,
  });
  const [tiers, setTiers] = useState<FeatureTier[]>([
    blankTier('fast', 'Fast'),
    blankTier('balanced', 'Balanced'),
    blankTier('premium', 'Premium'),
  ]);
  const [defaultTier, setDefaultTier] = useState<'fast' | 'balanced' | 'premium'>('balanced');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!feature) return;
    const v = feature.value;
    if (v.tiers && v.tiers.length > 0) {
      // Hydrate from existing tier array — make sure all 3 slots exist
      const byName = new Map(v.tiers.map((t) => [t.name, t]));
      setTiers([
        byName.get('fast') ?? blankTier('fast', 'Fast'),
        byName.get('balanced') ?? blankTier('balanced', 'Balanced'),
        byName.get('premium') ?? blankTier('premium', 'Premium'),
      ]);
    } else if (v.provider && v.model) {
      // Migrate legacy flat config to balanced tier only
      setTiers([
        blankTier('fast', 'Fast'),
        { ...blankTier('balanced', 'Balanced'), provider: v.provider, model: v.model },
        blankTier('premium', 'Premium'),
      ]);
    }
    setDefaultTier(v.defaultTier ?? 'balanced');
    setTemperature(Number(v.temperature ?? 0.7));
    setMaxTokens(Number(v.maxTokens ?? 2048));
  }, [feature]);

  if (!feature) return null;

  const updateTier = (idx: number, patch: Partial<FeatureTier>) => {
    setTiers((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const onSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await api.put(
        `/admin/config/feature/${feature.key}`,
        {
          value: {
            tiers,
            defaultTier,
            temperature,
            maxTokens,
          },
        },
        { token },
      );
      toast.success('Feature config saved');
      onSaved();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!feature} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{feature.label}</DialogTitle>
          <DialogDescription>{feature.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-xs text-slate-600">
            Each tier maps to a different provider/model so users can trade quality vs cost
            (like Genspark). Credit costs scale with quality. Edit any tier to change which
            model powers it and how much it costs.
          </p>

          {tiers.map((tier, idx) => {
            const meta = TIER_META[tier.name];
            const selectedProvider = providers.find((p) => p.key === tier.provider);
            return (
              <Card key={tier.name} className={meta?.color}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{meta?.icon}</span>
                      <span className="font-semibold">{tier.label}</span>
                      {defaultTier === tier.name && (
                        <Badge className="bg-indigo-600 text-white text-[10px]">DEFAULT</Badge>
                      )}
                    </div>
                    {defaultTier !== tier.name && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7"
                        onClick={() => setDefaultTier(tier.name)}
                      >
                        Make default
                      </Button>
                    )}
                  </div>

                  <Input
                    value={tier.description ?? ''}
                    onChange={(e) => updateTier(idx, { description: e.target.value })}
                    placeholder="One-line description shown to users"
                    className="text-xs"
                  />

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-slate-600">Provider</Label>
                      <Select value={tier.provider} onValueChange={(v) => updateTier(idx, { provider: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {providers.map((p) => (
                            <SelectItem key={p.key} value={p.key}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-slate-600">Model</Label>
                      <Select value={tier.model} onValueChange={(v) => updateTier(idx, { model: v })}>
                        <SelectTrigger className="h-8 text-xs font-mono">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(selectedProvider?.value.models ?? []).map((m) => (
                            <SelectItem key={m} value={m} className="font-mono text-xs">
                              {m}
                            </SelectItem>
                          ))}
                          {/* Always allow free-text via the current value too */}
                          {!(selectedProvider?.value.models ?? []).includes(tier.model) && tier.model && (
                            <SelectItem value={tier.model} className="font-mono text-xs">
                              {tier.model}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-slate-600">Credit cost</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={tier.creditCost}
                        onChange={(e) => updateTier(idx, { creditCost: Number(e.target.value) })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div>
              <Label className="mb-1.5 block">Temperature ({temperature})</Label>
              <Input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Max tokens</Label>
              <Input
                type="number"
                min="100"
                max="32000"
                step="256"
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save all tiers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Image provider dialog ────────────────────────────────────────────

function ImageProviderDialog({
  image,
  onClose,
  token,
  onSaved,
}: {
  image: ImageProviderRow | null;
  onClose: () => void;
  token: string | null;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [modelKey, setModelKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [creditCost, setCreditCost] = useState(10);
  const [tier, setTier] = useState<'fast' | 'balanced' | 'premium'>('balanced');
  const [inferenceSteps, setInferenceSteps] = useState<number | ''>('');
  const [guidanceScale, setGuidanceScale] = useState<number | ''>('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!image) return;
    setApiKey('');
    setModelKey((image.value.modelKey as string) ?? '');
    setEndpoint((image.value.endpoint as string) ?? '');
    setCreditCost(Number(image.value.creditCost ?? 10));
    setTier((image.value.tier as any) ?? 'balanced');
    setInferenceSteps(image.value.inferenceSteps ?? '');
    setGuidanceScale(image.value.guidanceScale ?? '');
    setEnabled(!!image.enabled);
  }, [image]);

  if (!image) return null;

  const meta = IMAGE_PROVIDER_META[image.key] ?? { icon: '🖼️' };
  const tierMeta = IMAGE_TIER_META[tier];
  const needsOwnKey = !meta.delegatesTo; // banana + banana-pro need their own key

  const onSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const value: Record<string, unknown> = {
        ...image.value,
        tier,
        creditCost,
      };
      if (needsOwnKey) {
        value.modelKey = modelKey;
        value.endpoint = endpoint || 'https://api.banana.dev/start/v4/';
        if (inferenceSteps !== '') value.inferenceSteps = Number(inferenceSteps);
        if (guidanceScale !== '') value.guidanceScale = Number(guidanceScale);
      }
      await api.put(
        `/admin/config/image/${image.key}`,
        {
          value,
          secrets: needsOwnKey && apiKey ? { apiKey } : undefined,
          enabled,
        },
        { token },
      );
      toast.success(`${image.label} saved — changes take effect immediately`);
      onSaved();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    if (!token) return;
    setTesting(true);
    try {
      const res = await api.post<{ ok: boolean; message: string }>(
        `/admin/config/image/${image.key}/test`,
        {},
        { token },
      );
      if (res.ok) toast.success(`${image.label}: ${res.message}`);
      else toast.error(`${image.label}: ${res.message}`);
      onSaved();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{meta.icon}</span> {image.label}
          </DialogTitle>
          <DialogDescription>{image.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-md border p-3 bg-slate-50/50">
            <div>
              <div className="text-sm font-medium text-slate-900">Enabled</div>
              <div className="text-[11px] text-slate-500">
                When off, users can't pick this tier when generating banners.
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Quality tier</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as any)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fast">⚡ Standard (Fast)</SelectItem>
                  <SelectItem value="balanced">⭐ Pro (Balanced)</SelectItem>
                  <SelectItem value="premium">💎 Ultra (Premium)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Credit cost per image</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={creditCost}
                onChange={(e) => setCreditCost(Number(e.target.value))}
              />
            </div>
          </div>

          {needsOwnKey ? (
            <>
              <div>
                <Label htmlFor="imgkey" className="mb-1.5 block">API Key</Label>
                <Input
                  id="imgkey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    image.secrets.apiKey && image.secrets.apiKey !== '(not set)'
                      ? `Current: ${image.secrets.apiKey} (leave empty to keep)`
                      : 'Paste your Banana API key'
                  }
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Stored encrypted with AES-256-GCM.
                </p>
              </div>
              <div>
                <Label htmlFor="modelkey" className="mb-1.5 block">Model Key</Label>
                <Input
                  id="modelkey"
                  value={modelKey}
                  onChange={(e) => setModelKey(e.target.value)}
                  placeholder="Banana model deployment key"
                />
              </div>
              <div>
                <Label htmlFor="endpoint" className="mb-1.5 block">Endpoint</Label>
                <Input
                  id="endpoint"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://api.banana.dev/start/v4/"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5 block text-xs">Inference steps</Label>
                  <Input
                    type="number"
                    min="1"
                    max="150"
                    value={inferenceSteps}
                    onChange={(e) => setInferenceSteps(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder={image.key === 'banana-pro' ? '50' : '30'}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs">Guidance scale</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={guidanceScale}
                    onChange={(e) => setGuidanceScale(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder={image.key === 'banana-pro' ? '8.5' : '7.5'}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-800">
              <strong>Delegates to:</strong> {meta.delegatesTo}
              <div className="mt-1 text-[11px] text-indigo-700">
                This provider reuses the API key from the {meta.delegatesTo} LLM provider card
                above. Set your {meta.delegatesTo} key there.
              </div>
            </div>
          )}

          {image.status === 'error' && image.statusMessage && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <strong>Last error:</strong> {image.statusMessage}
            </div>
          )}

          <div className={`rounded-md border p-2 text-[11px] ${tierMeta?.color}`}>
            Preview: end users will see this as
            <strong className="ml-1">
              {tierMeta?.icon} {tierMeta?.label}
            </strong>{' '}
            at <strong>{creditCost} credits</strong> per banner image.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onTest} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
            Test
          </Button>
          <Button onClick={onSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
