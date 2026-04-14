'use client';

/**
 * Business Brain editor (W0.2)
 *
 * Non-technical users edit the structured knowledge that powers every
 * campaign: brand voice, customer personas, product catalog. Every
 * save is audit-logged via the ai-tenant module.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, Save, Plus, Trash2, Loader2, Sparkles, Users, Package, Globe, Briefcase, Megaphone, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { friendlyError } from '@/lib/friendly-errors';

interface BrandVoice {
  tone: string;
  description: string;
  wordsToUse: string[];
  wordsToAvoid: string[];
  examples: string[];
  version: number;
}

interface Persona {
  id: string;
  name: string;
  description: string;
  attributes: {
    demographics?: string;
    painPoints?: string[];
    goals?: string[];
    channels?: string[];
  };
  isPrimary: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  attributes: {
    category?: string;
    features?: string[];
    benefits?: string[];
  };
}

export default function BrainPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Brain className="w-6 h-6 text-indigo-500" /> Business Brain
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          This is what your AI knows about your business. Everything you edit
          here shapes every campaign, ad, and post the AI writes. Changes are
          tracked — you can always see what the AI used.
        </p>
      </div>

      <Tabs defaultValue="voice" className="w-full">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-6 sm:w-full sm:max-w-4xl">
            <TabsTrigger value="voice" className="gap-1.5">
              <Sparkles className="w-4 h-4" /> Brand voice
            </TabsTrigger>
            <TabsTrigger value="personas" className="gap-1.5">
              <Users className="w-4 h-4" /> Customers
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-1.5">
              <Package className="w-4 h-4" /> Products
            </TabsTrigger>
            <TabsTrigger value="market" className="gap-1.5">
              <Globe className="w-4 h-4" /> Market position
            </TabsTrigger>
            <TabsTrigger value="sales" className="gap-1.5">
              <Briefcase className="w-4 h-4" /> Sales playbook
            </TabsTrigger>
            <TabsTrigger value="marketing" className="gap-1.5">
              <Megaphone className="w-4 h-4" /> Marketing strategy
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="voice" className="mt-4">
          <BrandVoiceEditor companyId={companyId} token={token} qc={qc} />
        </TabsContent>
        <TabsContent value="personas" className="mt-4">
          <PersonaEditor companyId={companyId} token={token} qc={qc} />
        </TabsContent>
        <TabsContent value="products" className="mt-4">
          <ProductEditor companyId={companyId} token={token} qc={qc} />
        </TabsContent>
        <TabsContent value="market" className="mt-4">
          <MarketPositionEditor companyId={companyId} token={token} qc={qc} />
        </TabsContent>
        <TabsContent value="sales" className="mt-4">
          <SalesPlaybookEditor companyId={companyId} token={token} qc={qc} />
        </TabsContent>
        <TabsContent value="marketing" className="mt-4">
          <MarketingStrategyEditor companyId={companyId} token={token} qc={qc} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Brand voice ────────────────────────────────────────────────────

function BrandVoiceEditor({ companyId, token, qc }: { companyId: string; token: string | null; qc: any }) {
  const { data, isLoading } = useQuery({
    queryKey: ['brain-voice', companyId],
    queryFn: () => api.get<BrandVoice | null>(`/brain/${companyId}/brand-voice`, { token: token! }),
    enabled: !!token,
  });

  const [tone, setTone] = useState('');
  const [description, setDescription] = useState('');
  const [wordsToUseText, setWordsToUseText] = useState('');
  const [wordsToAvoidText, setWordsToAvoidText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setTone(data.tone || 'professional');
      setDescription(data.description || '');
      setWordsToUseText((data.wordsToUse || []).join(', '));
      setWordsToAvoidText((data.wordsToAvoid || []).join(', '));
    } else if (!isLoading) {
      setTone('professional');
    }
  }, [data, isLoading]);

  const onSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await api.put(
        `/brain/${companyId}/brand-voice`,
        {
          tone,
          description,
          wordsToUse: wordsToUseText.split(',').map((w) => w.trim()).filter(Boolean),
          wordsToAvoid: wordsToAvoidText.split(',').map((w) => w.trim()).filter(Boolean),
        },
        { token },
      );
      toast.success('Brand voice saved');
      qc.invalidateQueries({ queryKey: ['brain-voice', companyId] });
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't save your changes. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-24 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-16 bg-slate-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <Label htmlFor="tone" className="mb-1.5 block">Tone of voice</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="professional">Professional — trustworthy, expert</SelectItem>
              <SelectItem value="friendly">Friendly — warm, conversational</SelectItem>
              <SelectItem value="playful">Playful — fun, casual, emoji-friendly</SelectItem>
              <SelectItem value="bold">Bold — confident, punchy, direct</SelectItem>
              <SelectItem value="luxury">Luxury — refined, aspirational</SelectItem>
              <SelectItem value="educational">Educational — clear, informative</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="description" className="mb-1.5 block">
            How should AI write for you?
          </Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. We speak like a helpful friend. Short sentences. No jargon. Always lead with the customer's pain."
            rows={3}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="use" className="mb-1.5 block">Words to prefer</Label>
            <Input
              id="use"
              value={wordsToUseText}
              onChange={(e) => setWordsToUseText(e.target.value)}
              placeholder="effortless, simple, proven"
            />
            <p className="text-xs text-slate-500 mt-1">Comma-separated</p>
          </div>
          <div>
            <Label htmlFor="avoid" className="mb-1.5 block">Words to avoid</Label>
            <Input
              id="avoid"
              value={wordsToAvoidText}
              onChange={(e) => setWordsToAvoidText(e.target.value)}
              placeholder="cheap, basic, revolutionary"
            />
            <p className="text-xs text-slate-500 mt-1">Comma-separated</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-500">
            {data && <>Version {data.version} — saved</>}
          </div>
          <Button onClick={onSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save brand voice
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Personas ───────────────────────────────────────────────────────

function PersonaEditor({ companyId, token, qc }: { companyId: string; token: string | null; qc: any }) {
  const { data, isLoading } = useQuery({
    queryKey: ['brain-personas', companyId],
    queryFn: () => api.get<{ data: Persona[] }>(`/brain/${companyId}/personas`, { token: token! }),
    enabled: !!token,
  });

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPainPoints, setNewPainPoints] = useState('');
  const [newGoals, setNewGoals] = useState('');
  const [creating, setCreating] = useState(false);

  const personas = data?.data ?? [];

  const onCreate = async () => {
    if (!token || !newName.trim()) return;
    setCreating(true);
    try {
      await api.post(
        `/brain/${companyId}/personas`,
        {
          name: newName.trim(),
          description: newDesc.trim() || null,
          attributes: {
            painPoints: newPainPoints.split(',').map((s) => s.trim()).filter(Boolean),
            goals: newGoals.split(',').map((s) => s.trim()).filter(Boolean),
          },
          isPrimary: personas.length === 0,
        },
        { token },
      );
      toast.success(`Persona "${newName}" added`);
      setNewName('');
      setNewDesc('');
      setNewPainPoints('');
      setNewGoals('');
      qc.invalidateQueries({ queryKey: ['brain-personas', companyId] });
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't add that. Please try again."));
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!token) return;
    try {
      await api.delete(`/brain/${companyId}/personas/${id}`, { token });
      toast.success('Persona removed');
      qc.invalidateQueries({ queryKey: ['brain-personas', companyId] });
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't remove that."));
    }
  };

  const onSetPrimary = async (id: string) => {
    if (!token) return;
    try {
      // Naive: fetch all, set all non-primary, then set this one primary.
      // Good enough for MVP — backend allows multi-primary currently.
      for (const p of personas) {
        if (p.id === id) continue;
        if (p.isPrimary) {
          await api.patch(`/brain/${companyId}/personas/${p.id}`, { isPrimary: false }, { token });
        }
      }
      await api.patch(`/brain/${companyId}/personas/${id}`, { isPrimary: true }, { token });
      toast.success('Primary customer updated');
      qc.invalidateQueries({ queryKey: ['brain-personas', companyId] });
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't update that."));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="text-sm font-semibold text-slate-900">Add a customer persona</div>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Persona name (e.g. Busy Mom in HCMC)"
          />
          <Textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="One line description"
            rows={2}
          />
          <div className="grid md:grid-cols-2 gap-3">
            <Input
              value={newPainPoints}
              onChange={(e) => setNewPainPoints(e.target.value)}
              placeholder="Pain points (comma-separated)"
            />
            <Input
              value={newGoals}
              onChange={(e) => setNewGoals(e.target.value)}
              placeholder="Goals (comma-separated)"
            />
          </div>
          <Button onClick={onCreate} disabled={creating || !newName.trim()} className="gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add persona
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
      ) : personas.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-indigo-500" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">No customer personas yet</h3>
            <p className="text-sm text-slate-600 max-w-xs mx-auto">
              Tell your AI who you sell to. Add a persona above and every ad, post, and email will speak to them directly.
            </p>
          </CardContent>
        </Card>
      ) : (
        personas.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-slate-900">{p.name}</h3>
                  {p.isPrimary && <Badge className="bg-indigo-100 text-indigo-700">Primary</Badge>}
                </div>
                {p.description && <p className="text-sm text-slate-600 mt-1">{p.description}</p>}
                {p.attributes?.painPoints && p.attributes.painPoints.length > 0 && (
                  <div className="mt-2 text-xs text-slate-500">
                    <strong>Pain:</strong> {p.attributes.painPoints.join(', ')}
                  </div>
                )}
                {p.attributes?.goals && p.attributes.goals.length > 0 && (
                  <div className="text-xs text-slate-500">
                    <strong>Goals:</strong> {p.attributes.goals.join(', ')}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {!p.isPrimary && (
                  <Button size="sm" variant="outline" onClick={() => onSetPrimary(p.id)}>
                    Make primary
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onDelete(p.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── Products ───────────────────────────────────────────────────────

function ProductEditor({ companyId, token, qc }: { companyId: string; token: string | null; qc: any }) {
  const { data, isLoading } = useQuery({
    queryKey: ['brain-products', companyId],
    queryFn: () => api.get<{ data: Product[] }>(`/brain/${companyId}/products`, { token: token! }),
    enabled: !!token,
  });

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newFeatures, setNewFeatures] = useState('');
  const [creating, setCreating] = useState(false);

  const products = data?.data ?? [];

  const onCreate = async () => {
    if (!token || !newName.trim()) return;
    setCreating(true);
    try {
      await api.post(
        `/brain/${companyId}/products`,
        {
          name: newName.trim(),
          description: newDesc.trim() || null,
          price: newPrice.trim() || null,
          attributes: {
            features: newFeatures.split(',').map((f) => f.trim()).filter(Boolean),
          },
        },
        { token },
      );
      toast.success(`Product "${newName}" added`);
      setNewName('');
      setNewDesc('');
      setNewPrice('');
      setNewFeatures('');
      qc.invalidateQueries({ queryKey: ['brain-products', companyId] });
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't add that. Please try again."));
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!token) return;
    try {
      await api.delete(`/brain/${companyId}/products/${id}`, { token });
      toast.success('Product removed');
      qc.invalidateQueries({ queryKey: ['brain-products', companyId] });
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't remove that product."));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="text-sm font-semibold text-slate-900">Add a product or service</div>
          <div className="grid md:grid-cols-3 gap-3">
            <Input className="md:col-span-2" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" />
            <Input value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="Price (optional)" />
          </div>
          <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Short description" rows={2} />
          <Input value={newFeatures} onChange={(e) => setNewFeatures(e.target.value)} placeholder="Features (comma-separated)" />
          <Button onClick={onCreate} disabled={creating || !newName.trim()} className="gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add product
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-indigo-500" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">No products yet</h3>
            <p className="text-sm text-slate-600 max-w-xs mx-auto">
              Add your products or services so AI can write accurate ads and landing pages that actually sell.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {products.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{p.name}</h3>
                      {p.price && <Badge variant="secondary">{p.price}</Badge>}
                    </div>
                    {p.description && <p className="text-sm text-slate-600 mt-1">{p.description}</p>}
                    {p.attributes?.features && p.attributes.features.length > 0 && (
                      <div className="text-xs text-slate-500 mt-2">
                        {p.attributes.features.join(' · ')}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onDelete(p.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Market Position ────────────────────────────────────────────────

interface MarketPosition {
  swot: {
    strengths?: string[];
    weaknesses?: string[];
    opportunities?: string[];
    threats?: string[];
  };
  differentiation: string;
  positioningStatement: string;
  targetMarket: string;
  version?: number;
}

function MarketPositionEditor({
  companyId,
  token,
  qc,
}: {
  companyId: string;
  token: string | null;
  qc: any;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['brain-market-position', companyId],
    queryFn: () =>
      api.get<MarketPosition | null>(`/brain/${companyId}/market-position`, {
        token: token!,
      }),
    enabled: !!token,
  });

  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [opportunities, setOpportunities] = useState('');
  const [threats, setThreats] = useState('');
  const [differentiation, setDifferentiation] = useState('');
  const [positioningStatement, setPositioningStatement] = useState('');
  const [targetMarket, setTargetMarket] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setStrengths((data.swot?.strengths ?? []).join('\n'));
      setWeaknesses((data.swot?.weaknesses ?? []).join('\n'));
      setOpportunities((data.swot?.opportunities ?? []).join('\n'));
      setThreats((data.swot?.threats ?? []).join('\n'));
      setDifferentiation(data.differentiation ?? '');
      setPositioningStatement(data.positioningStatement ?? '');
      setTargetMarket(data.targetMarket ?? '');
    }
  }, [data]);

  const parseLines = (text: string) =>
    text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

  const onSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await api.put(
        `/brain/${companyId}/market-position`,
        {
          swot: {
            strengths: parseLines(strengths),
            weaknesses: parseLines(weaknesses),
            opportunities: parseLines(opportunities),
            threats: parseLines(threats),
          },
          differentiation,
          positioningStatement,
          targetMarket,
        },
        { token },
      );
      toast.success('Market position saved');
      qc.invalidateQueries({ queryKey: ['brain-market-position', companyId] });
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't save your changes. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="h-40 bg-slate-100 rounded-lg animate-pulse" />;
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <Label htmlFor="target-market" className="mb-1.5 block">
            Target market
          </Label>
          <Textarea
            id="target-market"
            value={targetMarket}
            onChange={(e) => setTargetMarket(e.target.value)}
            placeholder="e.g. Early-stage SaaS founders in SEA, $5k-$50k MRR, selling B2B"
            rows={2}
          />
        </div>
        <div>
          <Label htmlFor="positioning" className="mb-1.5 block">
            Positioning statement
          </Label>
          <Textarea
            id="positioning"
            value={positioningStatement}
            onChange={(e) => setPositioningStatement(e.target.value)}
            placeholder="e.g. For B2B SaaS founders who need marketing traction fast, we're the only AI CEO platform that learns your business from day one."
            rows={3}
          />
        </div>
        <div>
          <Label htmlFor="differentiation" className="mb-1.5 block">
            What makes you different
          </Label>
          <Textarea
            id="differentiation"
            value={differentiation}
            onChange={(e) => setDifferentiation(e.target.value)}
            placeholder="3-5 sentences on what competitors don't have"
            rows={3}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4 pt-2 border-t">
          <div>
            <Label htmlFor="strengths" className="mb-1.5 block text-green-700">
              Strengths (one per line)
            </Label>
            <Textarea
              id="strengths"
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              placeholder="What we do really well"
              rows={5}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label htmlFor="weaknesses" className="mb-1.5 block text-amber-700">
              Weaknesses (one per line)
            </Label>
            <Textarea
              id="weaknesses"
              value={weaknesses}
              onChange={(e) => setWeaknesses(e.target.value)}
              placeholder="Honest gaps we need to work on"
              rows={5}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label htmlFor="opportunities" className="mb-1.5 block text-indigo-700">
              Opportunities (one per line)
            </Label>
            <Textarea
              id="opportunities"
              value={opportunities}
              onChange={(e) => setOpportunities(e.target.value)}
              placeholder="Market shifts we can ride"
              rows={5}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label htmlFor="threats" className="mb-1.5 block text-red-700">
              Threats (one per line)
            </Label>
            <Textarea
              id="threats"
              value={threats}
              onChange={(e) => setThreats(e.target.value)}
              placeholder="Competitive + market risks"
              rows={5}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button onClick={onSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save market position
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sales Playbook ─────────────────────────────────────────────────

interface SalesPlaybook {
  idealCustomerProfile: string;
  qualificationRules: string[];
  stages: Array<{ name: string; description?: string; exitCriteria?: string }>;
  objections: Array<{ objection: string; response: string }>;
  closingLines: string[];
  emailTemplates: Array<{ name: string; stage?: string; body: string }>;
  version?: number;
}

function SalesPlaybookEditor({
  companyId,
  token,
  qc,
}: {
  companyId: string;
  token: string | null;
  qc: any;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['brain-sales-playbook', companyId],
    queryFn: () =>
      api.get<SalesPlaybook | null>(`/brain/${companyId}/sales-playbook`, {
        token: token!,
      }),
    enabled: !!token,
  });

  const [icp, setIcp] = useState('');
  const [qualificationRules, setQualificationRules] = useState('');
  const [closingLines, setClosingLines] = useState('');
  const [objections, setObjections] = useState<Array<{ objection: string; response: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const onAutoDraft = async () => {
    if (!token) return;
    setDrafting(true);
    try {
      const res = await api.post<{
        draft: {
          idealCustomerProfile?: string;
          qualificationRules?: string[];
          objections?: Array<{ objection: string; response: string }>;
          closingLines?: string[];
        };
      }>(`/brain/${companyId}/sales-playbook/autodraft`, {}, { token });
      const d = res.draft ?? {};
      setIcp(d.idealCustomerProfile ?? '');
      setQualificationRules((d.qualificationRules ?? []).join('\n'));
      setClosingLines((d.closingLines ?? []).join('\n'));
      setObjections(d.objections ?? []);
      toast.success('Draft ready — review and click Save to keep it');
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't draft your playbook."));
    } finally {
      setDrafting(false);
    }
  };

  useEffect(() => {
    if (data) {
      setIcp(data.idealCustomerProfile ?? '');
      setQualificationRules((data.qualificationRules ?? []).join('\n'));
      setClosingLines((data.closingLines ?? []).join('\n'));
      setObjections(data.objections ?? []);
    }
  }, [data]);

  const parseLines = (text: string) =>
    text.split('\n').map((l) => l.trim()).filter(Boolean);

  const addObjection = () => setObjections([...objections, { objection: '', response: '' }]);
  const updateObjection = (i: number, field: 'objection' | 'response', value: string) => {
    const copy = [...objections];
    copy[i] = { ...copy[i], [field]: value } as any;
    setObjections(copy);
  };
  const removeObjection = (i: number) =>
    setObjections(objections.filter((_, idx) => idx !== i));

  const onSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await api.put(
        `/brain/${companyId}/sales-playbook`,
        {
          idealCustomerProfile: icp,
          qualificationRules: parseLines(qualificationRules),
          closingLines: parseLines(closingLines),
          objections: objections.filter((o) => o.objection.trim() && o.response.trim()),
        },
        { token },
      );
      toast.success('Sales playbook saved');
      qc.invalidateQueries({ queryKey: ['brain-sales-playbook', companyId] });
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't save your playbook."));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="h-40 bg-slate-100 rounded-lg animate-pulse" />;
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 rounded-md border border-indigo-100 bg-indigo-50/60 p-3">
          <div className="text-xs text-slate-700">
            <span className="font-medium text-indigo-900">Don't know where to start?</span>{' '}
            Let AI draft it from your Brain.
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onAutoDraft}
            disabled={drafting}
            className="gap-1.5 border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100"
          >
            {drafting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Auto-draft from Brain (3 credits)
          </Button>
        </div>

        <div>
          <Label htmlFor="icp" className="mb-1.5 block">
            Ideal Customer Profile (ICP)
          </Label>
          <Textarea
            id="icp"
            value={icp}
            onChange={(e) => setIcp(e.target.value)}
            placeholder="Describe the perfect customer: company size, industry, role, pain, budget."
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="qualification" className="mb-1.5 block">
            Qualification rules (one per line)
          </Label>
          <Textarea
            id="qualification"
            value={qualificationRules}
            onChange={(e) => setQualificationRules(e.target.value)}
            placeholder={'e.g. Must have a live product\nAt least 10 paying customers\nDecision-maker on the call'}
            rows={4}
            className="font-mono text-xs"
          />
        </div>

        <div>
          <Label htmlFor="closing" className="mb-1.5 block">
            Closing lines (one per line)
          </Label>
          <Textarea
            id="closing"
            value={closingLines}
            onChange={(e) => setClosingLines(e.target.value)}
            placeholder={"e.g. \"Ready to move forward today?\"\n\"Should we get you started on the Pro plan this week?\""}
            rows={3}
            className="font-mono text-xs"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Objections & responses</Label>
            <Button size="sm" variant="outline" onClick={addObjection} className="gap-1 h-7">
              <Plus className="w-3 h-3" /> Add
            </Button>
          </div>
          <div className="space-y-2">
            {objections.map((o, i) => (
              <div
                key={i}
                className="rounded-md border p-3 grid md:grid-cols-[1fr_2fr_auto] gap-2 items-start"
              >
                <Input
                  value={o.objection}
                  onChange={(e) => updateObjection(i, 'objection', e.target.value)}
                  placeholder="Objection"
                  className="text-xs"
                />
                <Textarea
                  value={o.response}
                  onChange={(e) => updateObjection(i, 'response', e.target.value)}
                  placeholder="How to respond"
                  rows={2}
                  className="text-xs"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeObjection(i)}
                  className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {objections.length === 0 && (
              <div className="text-xs text-slate-500 italic">
                No objections yet — add the top 3-5 you hear most often.
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button onClick={onSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save playbook
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Marketing Strategy ─────────────────────────────────────────────

interface MarketingStrategy {
  channels: Array<{
    name: string;
    kind: 'online' | 'offline';
    enabled: boolean;
    budgetShare?: number;
    voiceOverride?: string;
    notes?: string;
  }>;
  monthlyBudget: string;
  themes: Array<{ title: string; description?: string; quarter?: string }>;
  funnelStages: string[];
  kpis: Array<{ name: string; target?: string }>;
  version?: number;
}

const DEFAULT_CHANNELS = [
  { name: 'Facebook', kind: 'online' as const, enabled: true },
  { name: 'Instagram', kind: 'online' as const, enabled: true },
  { name: 'LinkedIn', kind: 'online' as const, enabled: false },
  { name: 'TikTok', kind: 'online' as const, enabled: false },
  { name: 'Google Ads', kind: 'online' as const, enabled: false },
  { name: 'SEO / Blog', kind: 'online' as const, enabled: true },
  { name: 'Email', kind: 'online' as const, enabled: true },
  { name: 'Events & Meetups', kind: 'offline' as const, enabled: false },
  { name: 'Printed flyers', kind: 'offline' as const, enabled: false },
  { name: 'Word of mouth', kind: 'offline' as const, enabled: true },
];

function MarketingStrategyEditor({
  companyId,
  token,
  qc,
}: {
  companyId: string;
  token: string | null;
  qc: any;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['brain-marketing-strategy', companyId],
    queryFn: () =>
      api.get<MarketingStrategy | null>(
        `/brain/${companyId}/marketing-strategy`,
        { token: token! },
      ),
    enabled: !!token,
  });

  const [channels, setChannels] = useState<MarketingStrategy['channels']>([]);
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [themes, setThemes] = useState('');
  const [funnelStages, setFunnelStages] = useState('');
  const [kpisText, setKpisText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && data.channels?.length) {
      setChannels(data.channels);
    } else if (!isLoading) {
      setChannels(DEFAULT_CHANNELS);
    }
    if (data) {
      setMonthlyBudget(data.monthlyBudget ?? '');
      setThemes(
        (data.themes ?? [])
          .map((t) => (t.description ? `${t.title}: ${t.description}` : t.title))
          .join('\n'),
      );
      setFunnelStages((data.funnelStages ?? []).join(' → '));
      setKpisText(
        (data.kpis ?? []).map((k) => (k.target ? `${k.name}=${k.target}` : k.name)).join('\n'),
      );
    }
  }, [data, isLoading]);

  const toggleChannel = (i: number) => {
    const copy = [...channels];
    copy[i] = { ...copy[i], enabled: !copy[i]!.enabled } as any;
    setChannels(copy);
  };

  const onSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const parsedThemes = themes
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const [title, ...rest] = line.split(':');
          return {
            title: (title ?? '').trim(),
            description: rest.join(':').trim() || undefined,
          };
        })
        .filter((t) => t.title);

      const parsedFunnel = funnelStages
        .split('→')
        .map((s) => s.trim())
        .filter(Boolean);

      const parsedKpis = kpisText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, target] = line.split('=');
          return { name: (name ?? '').trim(), target: target?.trim() || undefined };
        })
        .filter((k) => k.name);

      await api.put(
        `/brain/${companyId}/marketing-strategy`,
        {
          channels,
          monthlyBudget,
          themes: parsedThemes,
          funnelStages: parsedFunnel,
          kpis: parsedKpis,
        },
        { token },
      );
      toast.success('Marketing strategy saved');
      qc.invalidateQueries({ queryKey: ['brain-marketing-strategy', companyId] });
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't save the strategy."));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="h-40 bg-slate-100 rounded-lg animate-pulse" />;
  }

  const onlineChannels = channels.filter((c) => c.kind === 'online');
  const offlineChannels = channels.filter((c) => c.kind === 'offline');

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <Label htmlFor="budget" className="mb-1.5 block">
            Monthly marketing budget (optional)
          </Label>
          <Input
            id="budget"
            value={monthlyBudget}
            onChange={(e) => setMonthlyBudget(e.target.value)}
            placeholder="e.g. $2,000"
            className="max-w-xs"
          />
        </div>

        <div>
          <Label className="mb-1.5 block">Active channels</Label>
          <p className="text-xs text-slate-500 mb-2">
            Check the channels you actually use. Campaigns generator only creates assets
            for enabled channels.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">
                Online
              </div>
              <div className="space-y-1">
                {onlineChannels.map((c, i) => {
                  const globalIdx = channels.indexOf(c);
                  return (
                    <label
                      key={c.name}
                      className="flex items-center gap-2 text-sm cursor-pointer py-1"
                    >
                      <input
                        type="checkbox"
                        checked={c.enabled}
                        onChange={() => toggleChannel(globalIdx)}
                        className="rounded"
                      />
                      {c.name}
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">
                Offline
              </div>
              <div className="space-y-1">
                {offlineChannels.map((c) => {
                  const globalIdx = channels.indexOf(c);
                  return (
                    <label
                      key={c.name}
                      className="flex items-center gap-2 text-sm cursor-pointer py-1"
                    >
                      <input
                        type="checkbox"
                        checked={c.enabled}
                        onChange={() => toggleChannel(globalIdx)}
                        className="rounded"
                      />
                      {c.name}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t">
          <Label htmlFor="themes" className="mb-1.5 block">
            Campaign themes (one per line, format: "title: description")
          </Label>
          <Textarea
            id="themes"
            value={themes}
            onChange={(e) => setThemes(e.target.value)}
            placeholder={'Launch week: Focus on product hunt + viral\nBack to school: Seasonal discount push'}
            rows={3}
            className="font-mono text-xs"
          />
        </div>

        <div>
          <Label htmlFor="funnel" className="mb-1.5 block">
            Funnel stages (separate with →)
          </Label>
          <Input
            id="funnel"
            value={funnelStages}
            onChange={(e) => setFunnelStages(e.target.value)}
            placeholder="Awareness → Interest → Trial → Paid"
            className="font-mono text-xs"
          />
        </div>

        <div>
          <Label htmlFor="kpis" className="mb-1.5 block">
            KPIs (one per line, format: "name=target")
          </Label>
          <Textarea
            id="kpis"
            value={kpisText}
            onChange={(e) => setKpisText(e.target.value)}
            placeholder={'CAC=under $50\nPaid trial signups=100/month\nROAS=3x'}
            rows={3}
            className="font-mono text-xs"
          />
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button onClick={onSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save strategy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
