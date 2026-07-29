'use client';

/**
 * Brand IQ — Block 2.
 *
 * Empty state: automatically generate from existing company intelligence.
 * Populated state: read-only summary + Edit dialog per facet + optional
 * supplemental context for an AI-assisted refresh.
 *
 * Every other agent (blog, banner, chatbot, social, ads, GEO, content
 * grader) automatically reads the active profile through
 * business-context.ts — the founder doesn't have to apply it anywhere.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sparkles,
  RefreshCw,
  Loader2,
  Globe,
  Users,
  Palette,
  Pencil,
  Target,
  CheckCircle2,
  Plus,
  Trash2,
  AlertCircle,
  ChevronDown,
  UploadCloud,
} from 'lucide-react';
import {
  useBrandIq,
  useAutoGenerateBrandIq,
  useGenerateBrandIq,
  useUpdateBrandIq,
  type BrandIqProfile,
  type BrandIqVoice,
  type AudiencePersona,
  type QuarterlyOkr,
  type VisualIdentity,
} from '@/lib/api/brand-iq-hooks';
import { useAuthStore } from '@/stores/auth-store';
import { uploadImageAsset } from '@/lib/assets-library';
import { useMyCompanyAccess } from '@/lib/api/company-access-hooks';
import { hasCompanyPermission } from '@/lib/company-access';

const BRAND_IQ_EDIT_PERMISSION_MESSAGE =
  'Only the company Owner, Admin, or Marketing Lead can edit Brand IQ.';

/* ─── Setup Wizard (empty state) ─────────────────────────────────── */

function SetupWizard({
  companyId,
  onDone,
  canEdit,
  permissionMessage = BRAND_IQ_EDIT_PERMISSION_MESSAGE,
  initialUrl = '',
  initialSamples = [],
  title = 'Add context to improve Brand IQ',
  submitLabel = 'Update Brand IQ',
}: {
  companyId: string;
  onDone: () => void;
  canEdit: boolean;
  permissionMessage?: string;
  initialUrl?: string;
  initialSamples?: string[];
  title?: string;
  submitLabel?: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [samples, setSamples] = useState<string[]>(initialSamples.length ? initialSamples : ['']);
  const generate = useGenerateBrandIq(companyId);

  const handleSubmit = async () => {
    if (!canEdit) {
      toast.error(permissionMessage);
      return;
    }
    const cleanSamples = samples.map((s) => s.trim()).filter((s) => s.length >= 50);
    const cleanUrl = url.trim();
    try {
      await generate.mutateAsync({ url: cleanUrl || undefined, samples: cleanSamples });
      toast.success('Brand IQ generated. Every agent will now use it.');
      onDone();
    } catch (e) {
      toast.error((e as Error).message || 'Generation failed');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          AI combines these details with your company profile, Brain Hub, campaigns, blogs,
          landing pages, and market signals. Leave everything empty to refresh from the latest
          company data.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Website URL</Label>
          <div className="flex items-center gap-2 mt-1">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-domain.com"
              type="url"
              disabled={!canEdit}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            We&apos;ll scrape your home page for tone, colors, fonts, and OG image.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Additional information or writing examples</Label>
          <p className="text-[11px] text-muted-foreground">
            Add anything AI may not know yet: preferred tone, ideal customers, an About page,
            customer feedback, or past content. Each entry must be at least 50 characters.
          </p>
          {samples.map((s, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <Textarea
                value={s}
                onChange={(e) =>
                  setSamples((arr) => arr.map((v, i) => (i === idx ? e.target.value : v)))
                }
                rows={3}
                placeholder={`Context ${idx + 1} - tell AI what to preserve or improve.`}
                disabled={!canEdit}
              />
              {samples.length > 1 && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSamples((arr) => arr.filter((_, i) => i !== idx))}
                  disabled={!canEdit}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
          {samples.length < 5 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSamples((arr) => [...arr, ''])}
              disabled={!canEdit}
              className="gap-1"
            >
              <Plus className="w-3 h-3" /> Add sample
            </Button>
          )}
        </div>

        <Button onClick={handleSubmit} disabled={generate.isPending || !canEdit} className="gap-2 w-full">
          {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {submitLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ─── Per-facet display + edit ───────────────────────────────────── */

function ChipList({ items, empty }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground italic">{empty ?? '(none)'}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <Badge key={`${it}-${i}`} variant="outline" className="text-xs">
          {it}
        </Badge>
      ))}
    </div>
  );
}

function VoiceCard({
  profile,
  companyId,
  canEdit,
  permissionMessage = BRAND_IQ_EDIT_PERMISSION_MESSAGE,
}: {
  profile: BrandIqProfile;
  companyId: string;
  canEdit: boolean;
  permissionMessage?: string;
}) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateBrandIq(companyId);
  const [draft, setDraft] = useState<BrandIqVoice>(profile.voice);

  const save = async () => {
    if (!canEdit) {
      toast.error(permissionMessage);
      return;
    }
    try {
      await update.mutateAsync({ voice: draft });
      toast.success('Voice updated');
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message || 'Update failed');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Voice
        </CardTitle>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="gap-1">
            <Pencil className="w-3 h-3" /> Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Adjectives</div>
          <ChipList items={profile.voice.adjectives} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Description</div>
          <p className="text-sm">{profile.voice.description}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">First person</div>
            <div className="font-medium capitalize">{profile.voice.firstPerson.replace('_', ' ')}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Sentences</div>
            <div className="font-medium capitalize">{profile.voice.sentenceLength}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Emoji</div>
            <div className="font-medium capitalize">{profile.voice.emojiUsage}</div>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Signature phrases</div>
          <ChipList items={profile.voice.signaturePhrases} empty="(none yet — add ones the brand actually says)" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Phrases to avoid</div>
          <ChipList items={profile.voice.avoidPhrases} />
        </div>
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Voice</DialogTitle>
            <DialogDescription>Changes apply to every agent immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Adjectives (comma-separated)</Label>
              <Input
                value={draft.adjectives.join(', ')}
                onChange={(e) => setDraft((d) => ({ ...d, adjectives: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div>
              <Label>Signature phrases (one per line)</Label>
              <Textarea
                value={draft.signaturePhrases.join('\n')}
                onChange={(e) => setDraft((d) => ({ ...d, signaturePhrases: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) }))}
                rows={3}
              />
            </div>
            <div>
              <Label>Phrases to avoid (one per line)</Label>
              <Textarea
                value={draft.avoidPhrases.join('\n')}
                onChange={(e) => setDraft((d) => ({ ...d, avoidPhrases: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDraft(profile.voice); setEditing(false); }}>Cancel</Button>
            <Button onClick={save} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PersonasCard({ profile }: { profile: BrandIqProfile }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Audience personas ({profile.audiencePersonas.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.audiencePersonas.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No personas yet. Regenerate with samples to derive some.</p>
        )}
        {profile.audiencePersonas.map((p) => (
          <div key={p.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{p.name}</span>
              <Badge variant="secondary" className="text-[10px]">{p.role}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground mb-1">Pain points</div>
                <ul className="space-y-0.5 list-disc list-inside">
                  {p.painPoints.map((pp, i) => <li key={i}>{pp}</li>)}
                </ul>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Goals</div>
                <ul className="space-y-0.5 list-disc list-inside">
                  {p.goals.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Channels</div>
                <ChipList items={p.channels} />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function StyleCard({ profile }: { profile: BrandIqProfile }) {
  const s = profile.styleGuide;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Pencil className="w-4 h-4 text-primary" /> Style guide
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {[
          { label: 'Headlines', items: s.headlineRules },
          { label: 'Body', items: s.bodyRules },
          { label: 'CTAs', items: s.ctaRules },
          { label: 'Formatting', items: s.formattingPreferences },
        ].map((g) => (
          <div key={g.label}>
            <div className="text-muted-foreground mb-1">{g.label}</div>
            <ul className="space-y-0.5 list-disc list-inside">
              {g.items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function normalizeVisualColors(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function VisualCard({
  profile,
  companyId,
  canEdit,
  permissionMessage = BRAND_IQ_EDIT_PERMISSION_MESSAGE,
}: {
  profile: BrandIqProfile;
  companyId: string;
  canEdit: boolean;
  permissionMessage?: string;
}) {
  const v = profile.visualIdentity;
  const token = useAuthStore((s) => s.token);
  const update = useUpdateBrandIq(companyId);
  const [editing, setEditing] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [draft, setDraft] = useState<VisualIdentity>(v);
  const [accentDraft, setAccentDraft] = useState(v.accentColors.join('\n'));

  const openEditor = () => {
    if (!canEdit) {
      toast.error(permissionMessage);
      return;
    }
    setDraft(profile.visualIdentity);
    setAccentDraft(profile.visualIdentity.accentColors.join('\n'));
    setEditing(true);
  };

  const save = async () => {
    if (!canEdit) {
      toast.error(permissionMessage);
      return;
    }
    const accentColors = normalizeVisualColors(accentDraft);
    if (!isHexColor(draft.primaryColor) || !isHexColor(draft.secondaryColor) || accentColors.some((color) => !isHexColor(color))) {
      toast.error('Please use hex colors like #6366F1.');
      return;
    }

    try {
      await update.mutateAsync({
        visualIdentity: {
          primaryColor: draft.primaryColor.trim(),
          secondaryColor: draft.secondaryColor.trim(),
          accentColors: accentColors.slice(0, 5),
          fontHeadline: draft.fontHeadline?.trim() || null,
          fontBody: draft.fontBody?.trim() || null,
          imageMood: draft.imageMood.trim() || 'modern, clean, human-led',
          logoUrl: draft.logoUrl?.trim() || null,
        },
      });
      toast.success('Visual identity updated');
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message || 'Visual identity could not be saved');
    }
  };

  const uploadLogo = async (file?: File | null) => {
    if (!canEdit) {
      toast.error(permissionMessage);
      return;
    }
    if (!file || !token || uploadingLogo) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      toast.error('Please upload a PNG, JPG, WebP, or SVG logo.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Logo is too large. Please use a file under 8MB.');
      return;
    }

    setUploadingLogo(true);
    try {
      const asset = await uploadImageAsset(companyId, file, token);
      setDraft((current) => ({ ...current, logoUrl: asset.url }));
      toast.success('Logo uploaded');
    } catch (e) {
      toast.error((e as Error).message || 'Logo upload failed');
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" /> Visual identity
        </CardTitle>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={openEditor} className="gap-1">
            <Pencil className="w-3 h-3" /> Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground">Palette</div>
          {[v.primaryColor, v.secondaryColor, ...v.accentColors].map((c, i) => (
            <div key={`${c}-${i}`} className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded border" style={{ background: c }} />
              <code className="text-[11px] font-mono">{c}</code>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Headline font</div>
            <div className="font-medium">{v.fontHeadline ?? '(not detected)'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Body font</div>
            <div className="font-medium">{v.fontBody ?? '(not detected)'}</div>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Image mood</div>
          <div className="text-sm">{v.imageMood}</div>
        </div>
        {v.logoUrl && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Logo</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.logoUrl} alt="Brand logo" className="max-h-12 rounded border bg-white p-1" />
          </div>
        )}
        {!v.logoUrl && (
          <p className="text-xs text-muted-foreground">
            No logo yet. Add one so future banners can place it consistently.
          </p>
        )}
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Visual identity</DialogTitle>
            <DialogDescription>
              These settings are used by banner generation, landing pages, social creatives, and other visual outputs.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Primary color</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    value={draft.primaryColor}
                    onChange={(e) => setDraft((current) => ({ ...current, primaryColor: e.target.value }))}
                    placeholder="#6366F1"
                    className="font-mono"
                  />
                  <div className="h-9 w-9 rounded border" style={{ background: draft.primaryColor }} />
                </div>
              </div>
              <div>
                <Label>Secondary color</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    value={draft.secondaryColor}
                    onChange={(e) => setDraft((current) => ({ ...current, secondaryColor: e.target.value }))}
                    placeholder="#8B5CF6"
                    className="font-mono"
                  />
                  <div className="h-9 w-9 rounded border" style={{ background: draft.secondaryColor }} />
                </div>
              </div>
            </div>

            <div>
              <Label>Accent colors</Label>
              <Textarea
                value={accentDraft}
                onChange={(e) => setAccentDraft(e.target.value)}
                rows={3}
                placeholder="#10B981&#10;#F97316"
                className="mt-1 font-mono"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                One color per line, maximum 5. These help banners stay consistent while still having variation.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Headline font</Label>
                <Input
                  value={draft.fontHeadline ?? ''}
                  onChange={(e) => setDraft((current) => ({ ...current, fontHeadline: e.target.value || null }))}
                  placeholder="Inter, Montserrat, ..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Body font</Label>
                <Input
                  value={draft.fontBody ?? ''}
                  onChange={(e) => setDraft((current) => ({ ...current, fontBody: e.target.value || null }))}
                  placeholder="Inter, Roboto, ..."
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>Image mood</Label>
              <Textarea
                value={draft.imageMood}
                onChange={(e) => setDraft((current) => ({ ...current, imageMood: e.target.value }))}
                rows={2}
                maxLength={200}
                placeholder="modern, clean, human-led"
                className="mt-1"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Short description of how brand imagery should feel.
              </p>
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label>Logo</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Upload a logo or paste a public logo URL. New banners will use this as an editable overlay.
                  </p>
                </div>
                {draft.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.logoUrl} alt="Logo preview" className="max-h-12 max-w-28 rounded border bg-white p-1 object-contain" />
                )}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={draft.logoUrl ?? ''}
                  onChange={(e) => setDraft((current) => ({ ...current, logoUrl: e.target.value || null }))}
                  placeholder="https://your-domain.com/logo.png"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="relative gap-1.5 overflow-hidden"
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  Upload
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    disabled={uploadingLogo}
                    onChange={(e) => {
                      void uploadLogo(e.target.files?.[0]);
                      e.currentTarget.value = '';
                    }}
                  />
                </Button>
              </div>
              {draft.logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 text-xs text-muted-foreground"
                  onClick={() => setDraft((current) => ({ ...current, logoUrl: null }))}
                >
                  Remove logo
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDraft(profile.visualIdentity);
                setAccentDraft(profile.visualIdentity.accentColors.join('\n'));
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={update.isPending || uploadingLogo}>
              {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function OkrsCard({
  profile,
  companyId,
  canEdit,
  permissionMessage = BRAND_IQ_EDIT_PERMISSION_MESSAGE,
}: {
  profile: BrandIqProfile;
  companyId: string;
  canEdit: boolean;
  permissionMessage?: string;
}) {
  const update = useUpdateBrandIq(companyId);
  const [draft, setDraft] = useState<QuarterlyOkr[]>(profile.okrs);
  const [editing, setEditing] = useState(false);

  const save = async () => {
    if (!canEdit) {
      toast.error(permissionMessage);
      return;
    }
    try {
      await update.mutateAsync({ okrs: draft });
      toast.success('OKRs updated');
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message || 'Failed to save OKRs');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" /> Quarterly OKRs ({profile.okrs.length})
        </CardTitle>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => { setDraft(profile.okrs); setEditing(true); }} className="gap-1">
            <Pencil className="w-3 h-3" /> Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {profile.okrs.length === 0 && (
          <p className="text-muted-foreground italic text-xs">
            No OKRs set. Adding them lets agents prioritise outputs that move your top goals.
          </p>
        )}
        {profile.okrs.map((o) => (
          <div key={o.id} className="border rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">{o.quarter}</Badge>
              <span className="font-medium">{o.objective}</span>
            </div>
            <ul className="mt-1 text-xs list-disc list-inside text-muted-foreground">
              {o.keyResults.map((kr, i) => <li key={i}>{kr}</li>)}
            </ul>
          </div>
        ))}
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Quarterly OKRs</DialogTitle>
            <DialogDescription>Each agent uses these to prioritise their work.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {draft.map((o, idx) => (
              <div key={o.id} className="border rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    value={o.quarter}
                    onChange={(e) => setDraft((arr) => arr.map((v, i) => (i === idx ? { ...v, quarter: e.target.value } : v)))}
                    placeholder="2026-Q2"
                    className="font-mono"
                  />
                  <Input
                    value={o.objective}
                    onChange={(e) => setDraft((arr) => arr.map((v, i) => (i === idx ? { ...v, objective: e.target.value } : v)))}
                    placeholder="Reach $10k MRR"
                    className="col-span-2"
                  />
                </div>
                <Textarea
                  value={o.keyResults.join('\n')}
                  onChange={(e) =>
                    setDraft((arr) =>
                      arr.map((v, i) => (i === idx ? { ...v, keyResults: e.target.value.split('\n').filter((x) => x.trim()) } : v)),
                    )
                  }
                  placeholder="Key result 1 per line"
                  rows={3}
                />
                <Button size="sm" variant="ghost" onClick={() => setDraft((arr) => arr.filter((_, i) => i !== idx))} className="gap-1">
                  <Trash2 className="w-3 h-3" /> Remove
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDraft((arr) => [...arr, { id: `okr-${Date.now()}`, objective: '', keyResults: [], quarter: '2026-Q2' }])
              }
              className="gap-1"
            >
              <Plus className="w-3 h-3" /> Add OKR
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={save} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PositioningCard({ profile }: { profile: BrandIqProfile }) {
  const j = profile.jtbdForces;
  const cl = profile.customerLanguage;
  const hasJtbd = !!j && (j.push.length || j.pull.length || j.habit.length || j.anxiety.length);
  const hasCl = !!cl && (cl.problemPhrases.length || cl.solutionPhrases.length || cl.wordsToUse.length);
  const hasAnti = profile.antiPersonas.length > 0;
  const hasObj = profile.objections.length > 0;

  if (!hasJtbd && !hasCl && !hasAnti && !hasObj) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> Positioning &amp; messaging
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground italic text-xs">
            Not extracted yet. Regenerate with a richer source (an About page + a sales/FAQ doc) to
            capture why customers switch, their verbatim language, who is not a fit, and objections.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" /> Positioning &amp; messaging
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Every agent reads this — why customers switch, their words, who is not a fit, and how to
          handle objections.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {hasJtbd && j && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1.5">Why customers switch (JTBD forces)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { label: 'Push (away from old)', items: j.push },
                { label: 'Pull (toward us)', items: j.pull },
                { label: 'Habit (inertia)', items: j.habit },
                { label: 'Anxiety (switching fear)', items: j.anxiety },
              ]
                .filter((b) => b.items.length > 0)
                .map((b) => (
                  <div key={b.label} className="border rounded-lg p-2.5">
                    <div className="text-[11px] font-medium text-primary mb-1">{b.label}</div>
                    <ul className="text-xs list-disc list-inside text-muted-foreground space-y-0.5">
                      {b.items.map((it, i) => <li key={i}>{it}</li>)}
                    </ul>
                  </div>
                ))}
            </div>
          </div>
        )}

        {hasCl && cl && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Customer language (mirrored verbatim)</div>
            {cl.problemPhrases.length > 0 && (
              <div><span className="text-xs text-muted-foreground">Problem (their words): </span><ChipList items={cl.problemPhrases} /></div>
            )}
            {cl.solutionPhrases.length > 0 && (
              <div><span className="text-xs text-muted-foreground">Outcome (their words): </span><ChipList items={cl.solutionPhrases} /></div>
            )}
            {cl.wordsToUse.length > 0 && (
              <div><span className="text-xs text-muted-foreground">Words to use: </span><ChipList items={cl.wordsToUse} /></div>
            )}
            {cl.wordsToAvoid.length > 0 && (
              <div><span className="text-xs text-muted-foreground">Words to avoid: </span><ChipList items={cl.wordsToAvoid} /></div>
            )}
            {cl.glossary.length > 0 && (
              <ul className="text-xs text-muted-foreground list-disc list-inside">
                {cl.glossary.map((g, i) => <li key={i}><strong>{g.term}</strong>: {g.definition}</li>)}
              </ul>
            )}
          </div>
        )}

        {hasAnti && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1.5">Not a fit (won&apos;t be targeted)</div>
            <ul className="text-xs space-y-1">
              {profile.antiPersonas.map((a, i) => (
                <li key={i} className="border rounded-lg p-2"><strong>{a.name}</strong> — <span className="text-muted-foreground">{a.whyNotFit}</span></li>
              ))}
            </ul>
          </div>
        )}

        {hasObj && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1.5">Objections → response</div>
            <ul className="text-xs space-y-1">
              {profile.objections.map((o, i) => (
                <li key={i} className="border rounded-lg p-2">
                  <div className="font-medium">“{o.objection}”</div>
                  <div className="text-muted-foreground mt-0.5">→ {o.response}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Page entry ─────────────────────────────────────────────────── */

export default function BrandIqPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { data: profile, isLoading } = useBrandIq(companyId);
  const accessQ = useMyCompanyAccess(companyId);
  const autoGenerate = useAutoGenerateBrandIq(companyId);
  const autoStarted = useRef(false);
  const [improveExpanded, setImproveExpanded] = useState(false);
  const canEditBrandIq = hasCompanyPermission(accessQ.data, 'brand_iq.edit');

  useEffect(() => {
    if (isLoading || accessQ.isLoading || !accessQ.isSuccess || !canEditBrandIq || profile || autoStarted.current) return;
    autoStarted.current = true;
    autoGenerate.mutate();
  }, [accessQ.isLoading, accessQ.isSuccess, autoGenerate, canEditBrandIq, isLoading, profile]);

  if (isLoading || accessQ.isLoading || (!profile && canEditBrandIq && !autoGenerate.isError)) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
        <p className="font-medium text-foreground">Building your Brand IQ</p>
        <p className="mt-1">AI is reviewing the company information already available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-1">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" /> Brand IQ
        </h1>
        <p className="text-muted-foreground text-sm">
          One source of truth for voice, audience, positioning, style, visual identity, and OKRs.
          Now captures why customers switch (JTBD), their verbatim language, who is not a fit, and
          objection handling — every agent reads this before writing anything for you.
        </p>
      </div>

      {!profile && !canEditBrandIq && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Brand IQ has not been set up yet.</p>
              <p className="mt-1">
                {BRAND_IQ_EDIT_PERMISSION_MESSAGE} Ask someone with that role to build the first
                Brand IQ profile for this company.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!profile && canEditBrandIq && autoGenerate.isError && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Automatic generation could not finish. Retry using the latest company data or add more context below.
            </span>
          </div>
          <SetupWizard
            companyId={companyId}
            onDone={() => {}}
            canEdit={canEditBrandIq}
            title="Build your Brand IQ"
            submitLabel="Try again"
          />
        </div>
      )}

      {profile && (
        <>
          <Card className="border-emerald-200 bg-emerald-50/40">
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-medium">Active — version {profile.version}</span>
                <span className="text-muted-foreground">
                  · {profile.generatedBy === 'manual' ? 'manually edited' : 'AI-generated'}
                  · last updated {new Date(profile.updatedAt).toLocaleDateString()}
                </span>
              </div>
              {canEditBrandIq && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImproveExpanded((expanded) => !expanded)}
                  className="gap-1.5"
                  aria-expanded={improveExpanded}
                  aria-controls="brand-iq-improvement-panel"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {improveExpanded ? 'Hide improvement form' : 'Improve with more context'}
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      improveExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </Button>
              )}
            </CardContent>
          </Card>

          {!canEditBrandIq && (
            <Card className="border-slate-200 bg-slate-50/70">
              <CardContent className="flex items-start gap-3 p-4 text-sm text-slate-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium text-slate-900">Read-only Brand IQ</p>
                  <p className="mt-1">{BRAND_IQ_EDIT_PERMISSION_MESSAGE}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {improveExpanded && canEditBrandIq && (
            <div id="brand-iq-improvement-panel">
              <SetupWizard
                companyId={companyId}
                onDone={() => setImproveExpanded(false)}
                canEdit={canEditBrandIq}
                initialUrl={profile.sourceUrl ?? ''}
                title="Improve Brand IQ"
                submitLabel="Update Brand IQ"
              />
            </div>
          )}

          {profile.tagline && (
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Tagline</div>
                <div className="text-xl font-semibold mt-1">{profile.tagline}</div>
              </CardContent>
            </Card>
          )}

          <VoiceCard profile={profile} companyId={companyId} canEdit={canEditBrandIq} />
          <PersonasCard profile={profile} />
          <PositioningCard profile={profile} />
          <StyleCard profile={profile} />
          <VisualCard profile={profile} companyId={companyId} canEdit={canEditBrandIq} />
          <OkrsCard profile={profile} companyId={companyId} canEdit={canEditBrandIq} />
        </>
      )}
    </div>
  );
}
