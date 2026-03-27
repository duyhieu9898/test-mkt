'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Megaphone,
  Sparkles,
  Loader2,
  Eye,
  MousePointer,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Globe,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { useLandingPages, useCompany } from '@/lib/api/hooks';

export default function AdsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const [isCreating, setIsCreating] = useState<string | null>(null);

  const { data: pages } = useLandingPages(companyId);
  const { data: company } = useCompany(companyId);

  const allPages = pages || [];
  const publishedPages = allPages.filter((p) => p.status === 'published' || p.status === 'ready');
  const companyName = company?.name || 'Your Business';
  const industry = company?.industry || '';

  // Auto-generate campaign suggestions based on business context
  const campaignSuggestions = generateSuggestions(companyName, industry, allPages);

  const handleCreateCampaign = async (suggestion: typeof campaignSuggestions[0]) => {
    if (!token) return;
    setIsCreating(suggestion.id);
    try {
      await api.post('/ftux/execute', {
        companyId,
        goal: `Create ad campaign: ${suggestion.title}. Target: ${suggestion.target}. Platform: ${suggestion.platform}. Budget: $${suggestion.budget}/day`,
      }, { token });
      toast.success(`AI is creating "${suggestion.title}" campaign!`);
    } catch {
      toast.error('Failed to create campaign');
    } finally {
      setIsCreating(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">My Ads</h1>
        <p className="text-muted-foreground">AI-powered campaigns for {companyName}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg"><Eye className="w-4 h-4 text-blue-600" /></div>
          <div><p className="text-2xl font-bold">0</p><p className="text-xs text-muted-foreground">Impressions</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg"><MousePointer className="w-4 h-4 text-green-600" /></div>
          <div><p className="text-2xl font-bold">0</p><p className="text-xs text-muted-foreground">Clicks</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className="p-2 bg-purple-50 rounded-lg"><TrendingUp className="w-4 h-4 text-purple-600" /></div>
          <div><p className="text-2xl font-bold">0%</p><p className="text-xs text-muted-foreground">CTR</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className="p-2 bg-amber-50 rounded-lg"><DollarSign className="w-4 h-4 text-amber-600" /></div>
          <div><p className="text-2xl font-bold">$0</p><p className="text-xs text-muted-foreground">Spent</p></div>
        </CardContent></Card>
      </div>

      {/* AI-Suggested Campaigns — pre-built from business context */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Recommended Campaigns</h2>
          <Badge variant="secondary" className="text-xs">AI Generated</Badge>
        </div>

        <div className="space-y-3">
          {campaignSuggestions.map((suggestion) => (
            <Card key={suggestion.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${suggestion.bgColor}`}>
                    <suggestion.icon className={`w-5 h-5 ${suggestion.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">{suggestion.title}</h3>
                      <Badge variant="outline" className="text-xs capitalize">{suggestion.platform}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{suggestion.description}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Target: {suggestion.target}</span>
                      <span>Budget: ${suggestion.budget}/day</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1 shrink-0"
                    onClick={() => handleCreateCampaign(suggestion)}
                    disabled={isCreating === suggestion.id}
                  >
                    {isCreating === suggestion.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ArrowRight className="w-3 h-3" />
                    )}
                    Launch
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Pages available to promote */}
      {allPages.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">Pages Available to Promote</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allPages.slice(0, 4).map((page) => (
              <Card key={page.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{page.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{page.status}</p>
                  </div>
                  <Badge variant={page.status === 'published' ? 'success' : 'secondary'} className="text-xs capitalize shrink-0">
                    {page.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Generate campaign suggestions based on real business data
function generateSuggestions(companyName: string, industry: string, pages: any[]) {
  const pageNames = pages.map((p) => p.name).slice(0, 3);
  const keywords = pages
    .map((p) => (p.businessContext as any)?.keyword)
    .filter(Boolean)
    .slice(0, 3);

  return [
    {
      id: 'traffic',
      title: `Drive traffic to ${companyName}`,
      description: keywords.length > 0
        ? `Target people searching for "${keywords[0]}" and related terms`
        : `Promote ${companyName} to people interested in ${industry || 'your industry'}`,
      platform: 'google',
      target: keywords[0] || industry || 'interested audience',
      budget: '10',
      icon: TrendingUp,
      bgColor: 'bg-blue-50',
      iconColor: 'text-blue-600',
    },
    {
      id: 'awareness',
      title: `${companyName} brand awareness`,
      description: `Show ${companyName} to potential customers on social media`,
      platform: 'facebook',
      target: industry ? `People interested in ${industry}` : 'broad audience',
      budget: '5',
      icon: Eye,
      bgColor: 'bg-purple-50',
      iconColor: 'text-purple-600',
    },
    {
      id: 'leads',
      title: pageNames[0] ? `Promote: ${pageNames[0]}` : `Get leads for ${companyName}`,
      description: pageNames[0]
        ? `Drive signups from your "${pageNames[0]}" landing page`
        : `Capture leads with targeted ads`,
      platform: 'google',
      target: keywords[1] || 'high-intent buyers',
      budget: '15',
      icon: MousePointer,
      bgColor: 'bg-green-50',
      iconColor: 'text-green-600',
    },
  ];
}
