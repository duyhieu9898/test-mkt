'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { MetaAdsStatusBadge } from '@/components/campaigns/meta-ads-status-badge';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

type Entity = { id: string; name: string; status: string; effectiveStatus?: string | null };
type Ad = Entity & { type: string; headline: string | null; primaryText: string | null; description: string | null; destinationUrl: string | null; thumbnailUrl: string | null; impressions: number; reach: number; frequency: string | null; clicks: number; conversions: number; ctr: string | null; cpc: string | null; cpm: string | null; spentAmount: string | null };
type Detail = { campaign: Entity; adSet: Entity; ad: Ad; currency: string };

export default function FacebookAdDetailPage() {
  const params = useParams(); const companyId = params.companyId as string; const campaignId = params.campaignId as string; const adId = params.adId as string; const token = useAuthStore((state) => state.token);
  const [detail, setDetail] = useState<Detail | null>(null);
  const load = useCallback(async () => { if (!token) return; try { const result = await api.get<{ data: Detail }>(`/ads/company/${companyId}/facebook/campaigns/${campaignId}/ads/${adId}`, { token }); setDetail(result.data); } catch (error) { toast.error((error as Error).message || 'Could not load this ad.'); } }, [adId, campaignId, companyId, token]);
  useEffect(() => { void load(); }, [load]);
  if (!detail) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  const { ad } = detail;
  const costPerConv = ad.conversions > 0 ? Number(ad.spentAmount || 0) / ad.conversions : null;
  return <div className="mx-auto max-w-5xl space-y-6"><Link href={`/${companyId}/campaigns/facebook-ads/${campaignId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to Campaign</Link><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{ad.name}</h1><p className="mt-1 text-muted-foreground">{detail.campaign.name} · {detail.adSet.name} · Read-only data</p></div><Status status={ad.status} effectiveStatus={ad.effectiveStatus} label="Ad" /></div><div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Metric label="Spend" value={money(ad.spentAmount, detail.currency)} /><Metric label="Cost / Conv." value={costPerConv !== null ? money(costPerConv.toString(), detail.currency) : '—'} /><Metric label="Impressions" value={ad.impressions.toLocaleString()} /><Metric label="Reach" value={ad.reach.toLocaleString()} /><Metric label="Frequency" value={Number(ad.frequency || 0).toFixed(2)} /><Metric label="Clicks" value={ad.clicks.toLocaleString()} /><Metric label="CTR" value={`${Number(ad.ctr || 0).toFixed(2)}%`} /><Metric label="CPC" value={money(ad.cpc, detail.currency)} /><Metric label="CPM" value={money(ad.cpm, detail.currency)} /></div><Card><CardContent className="flex gap-4 p-5"><div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">{ad.thumbnailUrl ? <img src={ad.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}</div><div className="min-w-0"><h2 className="font-semibold">Creative</h2>{ad.headline && <p className="mt-2 font-medium">{ad.headline}</p>}{ad.primaryText && <p className="mt-1 text-sm text-muted-foreground">{ad.primaryText}</p>}{ad.description && <p className="mt-1 text-sm text-muted-foreground">{ad.description}</p>}{ad.destinationUrl && <a href={ad.destinationUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm underline">Landing page <ExternalLink className="h-3 w-3" /></a>}</div></CardContent></Card></div>;
}

function Status({ status, effectiveStatus, label }: { status: string; effectiveStatus?: string | null; label: string }) { return <div className="flex flex-wrap gap-1"><MetaAdsStatusBadge status={status} label={label} />{effectiveStatus && effectiveStatus !== status.toUpperCase() && <MetaAdsStatusBadge status={effectiveStatus.toLowerCase()} label="Delivery" />}</div>; }
function Metric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></CardContent></Card>; }
function money(value: string | null, currency: string) { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0)); }
