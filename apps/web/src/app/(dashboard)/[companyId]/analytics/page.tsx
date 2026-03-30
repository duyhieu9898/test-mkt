'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3,
  TrendingUp,
  Eye,
  MousePointer,
  Globe,
  Search,
  Target,
  Loader2,
  ArrowUp,
  ArrowDown,
  DollarSign,
  Percent,
  ShoppingCart,
  Image,
} from 'lucide-react';
import { useLandingPages } from '@/lib/api/hooks';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

// Format currency
function formatMoney(n: number): string {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

// ROAS badge color
function roasColor(roas: number): string {
  if (roas >= 3) return 'bg-green-100 text-green-800';
  if (roas >= 1) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

// Channel display name
function channelLabel(ch: string): string {
  const map: Record<string, string> = {
    facebook: 'Facebook',
    google: 'Google Ads',
    google_organic: 'Google (Organic)',
    tiktok: 'TikTok',
    linkedin: 'LinkedIn',
    twitter: 'Twitter / X',
    email: 'Email',
    organic: 'Organic',
    referral: 'Referral',
    direct: 'Direct',
  };
  return map[ch] || ch.charAt(0).toUpperCase() + ch.slice(1);
}

// Channel color
function channelColor(ch: string): string {
  const map: Record<string, string> = {
    facebook: 'bg-blue-500',
    google: 'bg-red-500',
    google_organic: 'bg-green-500',
    tiktok: 'bg-pink-500',
    linkedin: 'bg-sky-600',
    email: 'bg-purple-500',
    organic: 'bg-emerald-500',
    referral: 'bg-amber-500',
    direct: 'bg-gray-500',
  };
  return map[ch] || 'bg-gray-400';
}

export default function AnalyticsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const router = useRouter();
  const { data: pages, isLoading } = useLandingPages(companyId);
  const [sortField, setSortField] = useState<'revenue' | 'roas' | 'conversions' | 'spend'>('revenue');

  // Revenue attribution data
  const { data: attrData, isLoading: attrLoading } = useQuery({
    queryKey: ['revenue-attribution', companyId],
    queryFn: () => api.get<{ success: boolean; data: any }>(`/dashboard/company/${companyId}/revenue-attribution`, { token: token! }),
    enabled: !!token,
  });

  const attribution = attrData?.data;

  const allPages = pages || [];
  const publishedPages = allPages.filter((p) => p.status === 'published');
  const totalVisitors = allPages.reduce((s, p) => s + (p.totalVisitors || 0), 0);
  const totalLeads = allPages.reduce((s, p) => s + (p.totalLeads || 0), 0);

  // Extract keywords from pages
  const keywords = allPages
    .map((p) => {
      const ctx = p.businessContext as any;
      return ctx?.keyword ? {
        keyword: ctx.keyword,
        page: p.name,
        intent: ctx.searchIntent || 'unknown',
        status: p.status,
        pageId: p.id,
      } : null;
    })
    .filter(Boolean);

  // Sort campaigns
  const sortedCampaigns = [...(attribution?.byCampaign || [])].sort((a: any, b: any) => {
    return (b[sortField] || 0) - (a[sortField] || 0);
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Traffic, revenue, and performance</p>
      </div>

      {/* Smart suggestion based on data */}
      {publishedPages.length === 0 && allPages.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-sm text-amber-900">Publish your pages to start tracking</p>
              <p className="text-xs text-amber-700">You have {allPages.length} pages -- publish them to see real traffic data</p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 border-amber-300 text-amber-700" onClick={() => router.push(`/${companyId}/landing-pages`)}>
              Go to My Pages
            </Button>
          </CardContent>
        </Card>
      )}
      {publishedPages.length > 0 && totalVisitors === 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Eye className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-sm text-blue-900">Your pages are live -- get traffic!</p>
              <p className="text-xs text-blue-700">Create a campaign to bring visitors to your pages</p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 border-blue-300 text-blue-700" onClick={() => router.push(`/${companyId}/marketing`)}>
              Create Campaign
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue" className="gap-1">
            <DollarSign className="w-3.5 h-3.5" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="overview" className="gap-1">
            <BarChart3 className="w-3.5 h-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="seo" className="gap-1">
            <Search className="w-3.5 h-3.5" />
            SEO & Keywords
          </TabsTrigger>
        </TabsList>

        {/* === REVENUE ATTRIBUTION TAB === */}
        <TabsContent value="revenue" className="space-y-6 mt-4">
          {attrLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : !attribution ? (
            <Card>
              <CardContent className="p-12 text-center">
                <DollarSign className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="font-semibold mb-1">No revenue data yet</h3>
                <p className="text-sm text-muted-foreground">Run campaigns and track conversions to see revenue attribution</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1.5 bg-green-50 rounded-lg"><DollarSign className="w-3.5 h-3.5 text-green-600" /></div>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                    </div>
                    <p className="text-2xl font-bold text-green-700">{formatMoney(attribution.summary.totalRevenue)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1.5 bg-red-50 rounded-lg"><DollarSign className="w-3.5 h-3.5 text-red-600" /></div>
                      <p className="text-xs text-muted-foreground">Ad Spend</p>
                    </div>
                    <p className="text-2xl font-bold">{formatMoney(attribution.summary.totalSpend)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1.5 bg-blue-50 rounded-lg"><TrendingUp className="w-3.5 h-3.5 text-blue-600" /></div>
                      <p className="text-xs text-muted-foreground">ROAS</p>
                    </div>
                    <p className={`text-2xl font-bold ${attribution.summary.overallROAS >= 1 ? 'text-green-700' : 'text-red-600'}`}>
                      {attribution.summary.overallROAS}x
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1.5 bg-purple-50 rounded-lg"><Percent className="w-3.5 h-3.5 text-purple-600" /></div>
                      <p className="text-xs text-muted-foreground">Avg CPA</p>
                    </div>
                    <p className="text-2xl font-bold">{formatMoney(attribution.summary.averageCPA)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1.5 bg-amber-50 rounded-lg"><ShoppingCart className="w-3.5 h-3.5 text-amber-600" /></div>
                      <p className="text-xs text-muted-foreground">Conversions</p>
                    </div>
                    <p className="text-2xl font-bold">{attribution.summary.totalConversions}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Revenue by Channel */}
              {attribution.byChannel.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <div className="p-4 border-b">
                      <h3 className="font-semibold">Revenue by Channel</h3>
                      <p className="text-sm text-muted-foreground">Where your money comes from</p>
                    </div>
                    <div className="p-4 space-y-3">
                      {attribution.byChannel.map((ch: any) => {
                        const maxRevenue = Math.max(...attribution.byChannel.map((c: any) => c.revenue));
                        const pct = maxRevenue > 0 ? (ch.revenue / maxRevenue) * 100 : 0;
                        return (
                          <div key={ch.channel} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div className={`w-2.5 h-2.5 rounded-full ${channelColor(ch.channel)}`} />
                                <span className="font-medium">{channelLabel(ch.channel)}</span>
                              </div>
                              <div className="flex items-center gap-4 text-xs">
                                <span className="text-muted-foreground">{ch.conversions} conversions</span>
                                <span className={`font-semibold px-1.5 py-0.5 rounded ${roasColor(ch.roas)}`}>{ch.roas}x ROAS</span>
                                <span className="font-bold w-20 text-right">{formatMoney(ch.revenue)}</span>
                              </div>
                            </div>
                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${channelColor(ch.channel)}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Revenue by Campaign */}
              {sortedCampaigns.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <div className="p-4 border-b flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">Revenue by Campaign</h3>
                        <p className="text-sm text-muted-foreground">How each campaign performs</p>
                      </div>
                      <div className="flex gap-1">
                        {(['revenue', 'roas', 'conversions', 'spend'] as const).map((f) => (
                          <Button key={f} size="sm" variant={sortField === f ? 'default' : 'ghost'} className="text-xs h-7 px-2" onClick={() => setSortField(f)}>
                            {f === 'revenue' ? 'Revenue' : f === 'roas' ? 'ROAS' : f === 'conversions' ? 'Conv.' : 'Spend'}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-xs text-muted-foreground border-b">
                            <th className="text-left p-3 font-medium">Campaign</th>
                            <th className="text-right p-3 font-medium">Spend</th>
                            <th className="text-right p-3 font-medium">Revenue</th>
                            <th className="text-right p-3 font-medium">ROAS</th>
                            <th className="text-right p-3 font-medium">CPA</th>
                            <th className="text-right p-3 font-medium">Conv.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {sortedCampaigns.map((c: any) => (
                            <tr key={c.campaignId} className="hover:bg-muted/50 text-sm">
                              <td className="p-3">
                                <p className="font-medium truncate max-w-[200px]">{c.name}</p>
                                <p className="text-xs text-muted-foreground capitalize">{c.platform}</p>
                              </td>
                              <td className="p-3 text-right">{formatMoney(c.spend)}</td>
                              <td className="p-3 text-right font-medium">{formatMoney(c.revenue)}</td>
                              <td className="p-3 text-right">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${roasColor(c.roas)}`}>
                                  {c.roas}x
                                </span>
                              </td>
                              <td className="p-3 text-right">{formatMoney(c.cpa)}</td>
                              <td className="p-3 text-right font-medium">{c.conversions}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Top Performing Creatives */}
              {attribution.topCreatives.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <div className="p-4 border-b">
                      <h3 className="font-semibold">Top Performing Creatives</h3>
                      <p className="text-sm text-muted-foreground">Best converting ad creatives</p>
                    </div>
                    <div className="divide-y">
                      {attribution.topCreatives.map((cr: any, i: number) => (
                        <div key={cr.creativeId} className="flex items-center gap-4 p-4 hover:bg-muted/50">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/10 to-primary/20 flex items-center justify-center shrink-0">
                            <Image className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{cr.headline}</p>
                            <p className="text-xs text-muted-foreground">
                              {cr.conversions} conversions {cr.ctr > 0 && `/ ${cr.ctr}% click rate`}
                            </p>
                          </div>
                          <p className="font-bold text-sm text-green-700 shrink-0">{formatMoney(cr.revenue)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* No data states */}
              {sortedCampaigns.length === 0 && attribution.byChannel.length === 0 && (
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardContent className="pt-5 pb-5 flex items-start gap-4">
                    <div className="p-2 bg-blue-100 rounded-lg shrink-0"><DollarSign className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <h3 className="font-semibold text-blue-900">Start tracking revenue</h3>
                      <p className="text-sm text-blue-700 mb-2">Launch campaigns with UTM tracking links to see which ads generate revenue.</p>
                      <Button size="sm" variant="outline" className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-100" onClick={() => router.push(`/${companyId}/marketing`)}>
                        <TrendingUp className="w-4 h-4" />Go to Marketing
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* === OVERVIEW TAB === */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg"><Globe className="w-4 h-4 text-blue-600" /></div>
              <div><p className="text-2xl font-bold">{publishedPages.length}</p><p className="text-xs text-muted-foreground">Live Pages</p></div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg"><Eye className="w-4 h-4 text-green-600" /></div>
              <div><p className="text-2xl font-bold">{totalVisitors}</p><p className="text-xs text-muted-foreground">Visitors</p></div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg"><MousePointer className="w-4 h-4 text-purple-600" /></div>
              <div><p className="text-2xl font-bold">{totalLeads}</p><p className="text-xs text-muted-foreground">Leads</p></div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg"><Target className="w-4 h-4 text-amber-600" /></div>
              <div><p className="text-2xl font-bold">{keywords.length}</p><p className="text-xs text-muted-foreground">Keywords</p></div>
            </CardContent></Card>
          </div>

          {/* Page Performance */}
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b"><h3 className="font-semibold">Page Performance</h3></div>
              {allPages.length > 0 ? (
                <div className="divide-y">
                  {allPages.map((page) => {
                    const ctx = page.businessContext as any;
                    return (
                      <div key={page.id} className="flex items-center gap-4 p-4 hover:bg-muted/50">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          page.status === 'published' ? 'bg-green-500' : page.status === 'ready' ? 'bg-blue-500' : 'bg-amber-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{page.name}</p>
                          {ctx?.keyword && <p className="text-xs text-muted-foreground">Keyword: {ctx.keyword}</p>}
                        </div>
                        <Badge variant={page.status === 'published' ? 'success' : 'secondary'} className="capitalize text-xs shrink-0">{page.status}</Badge>
                        <div className="text-right shrink-0 w-16">
                          <p className="text-sm font-medium">{page.totalVisitors || 0}</p>
                          <p className="text-xs text-muted-foreground">visitors</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <BarChart3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Create pages to see analytics</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Connect Google prompt */}
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="pt-5 pb-5 flex items-start gap-4">
              <div className="p-2 bg-blue-100 rounded-lg shrink-0"><BarChart3 className="w-5 h-5 text-blue-600" /></div>
              <div>
                <h3 className="font-semibold text-blue-900">Get real Google data</h3>
                <p className="text-sm text-blue-700 mb-2">Connect Google to see actual rankings, impressions, and clicks.</p>
                <Button size="sm" variant="outline" className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-100">
                  <Globe className="w-4 h-4" />Connect Google
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === SEO & KEYWORDS TAB === */}
        <TabsContent value="seo" className="space-y-6 mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <h3 className="font-semibold">Target Keywords</h3>
                <p className="text-sm text-muted-foreground">Keywords your pages are targeting</p>
              </div>
              {keywords.length > 0 ? (
                <div className="divide-y">
                  {keywords.map((kw: any, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 hover:bg-muted/50">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{kw.keyword}</p>
                        <p className="text-xs text-muted-foreground">{kw.page}</p>
                      </div>
                      <Badge variant="outline" className="capitalize text-xs">{kw.intent}</Badge>
                      <Badge variant={kw.status === 'published' ? 'success' : 'secondary'} className="capitalize text-xs">{kw.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">No keywords tracked yet</h3>
                  <p className="text-sm text-muted-foreground">Pages with keywords will appear here for SEO tracking</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SEO Score overview */}
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <h3 className="font-semibold">SEO Health</h3>
              </div>
              <div className="p-4 space-y-3">
                {allPages.slice(0, 5).map((page) => {
                  const ctx = page.businessContext as any;
                  const checks = [
                    { label: 'Has keyword', ok: !!ctx?.keyword },
                    { label: 'Has content', ok: page.status !== 'draft' || page.description },
                    { label: 'Published', ok: page.status === 'published' },
                  ];
                  const score = checks.filter((c) => c.ok).length;

                  return (
                    <div key={page.id} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        score === 3 ? 'bg-green-100 text-green-700' :
                        score === 2 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>{score}/3</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{page.name}</p>
                      </div>
                      <div className="flex gap-1">
                        {checks.map((c, i) => (
                          <span key={i} className={`w-2 h-2 rounded-full ${c.ok ? 'bg-green-500' : 'bg-gray-200'}`} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
