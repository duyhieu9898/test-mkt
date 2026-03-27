'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { ContentPipelinePage } from '@/lib/api/hooks';
import {
  FileText,
  Globe,
  Loader2,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

interface ContentPipelineCardProps {
  pages: ContentPipelinePage[];
  companyId: string;
}

const statusConfig: Record<string, { color: string; icon: typeof Globe; label: string; animate?: boolean }> = {
  live: { color: 'bg-green-500', icon: Globe, label: 'Live' },
  building: { color: 'bg-blue-500', icon: Loader2, label: 'Building', animate: true },
  queued: { color: 'bg-yellow-500', icon: Clock, label: 'Queued' },
  draft: { color: 'bg-slate-500', icon: FileText, label: 'Draft' },
  failed: { color: 'bg-red-500', icon: AlertCircle, label: 'Failed' },
};

export function ContentPipelineCard({ pages, companyId }: ContentPipelineCardProps) {
  const liveCount = pages.filter((p) => p.status === 'live').length;
  const buildingCount = pages.filter((p) => p.status === 'building').length;
  const queuedCount = pages.filter((p) => p.status === 'queued' || p.status === 'draft').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Content Pipeline
          </CardTitle>
          <Link href={`/${companyId}/landing-pages`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
              View All
              <ExternalLink className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-2 rounded-lg bg-green-500/10">
            <div className="text-lg font-bold text-green-500">{liveCount}</div>
            <div className="text-[10px] text-muted-foreground">Live</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-blue-500/10">
            <div className="text-lg font-bold text-blue-500">{buildingCount}</div>
            <div className="text-[10px] text-muted-foreground">Building</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-yellow-500/10">
            <div className="text-lg font-bold text-yellow-500">{queuedCount}</div>
            <div className="text-[10px] text-muted-foreground">Queued</div>
          </div>
        </div>

        {/* Pages List */}
        <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
          {pages.slice(0, 8).map((page, index) => {
            const config = statusConfig[page.status] || statusConfig.draft;
            const StatusIcon = config.icon;

            return (
              <motion.div
                key={page.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div
                  className={`w-6 h-6 rounded flex items-center justify-center ${config.color}/20`}
                >
                  <StatusIcon
                    className={`w-3.5 h-3.5 ${config.color.replace('bg-', 'text-')} ${
                      config.animate ? 'animate-spin' : ''
                    }`}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <code className="text-xs font-medium block truncate">{page.slug}</code>
                  {page.keyword && (
                    <span className="text-[10px] text-muted-foreground truncate block">
                      {page.keyword}
                    </span>
                  )}
                </div>

                {page.rank && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      page.rank <= 10
                        ? 'border-green-500/50 text-green-600'
                        : page.rank <= 30
                        ? 'border-yellow-500/50 text-yellow-600'
                        : 'border-red-500/50 text-red-600'
                    }`}
                  >
                    #{page.rank}
                  </Badge>
                )}

                <Badge
                  variant="secondary"
                  className={`text-[10px] ${config.color} text-white px-1.5`}
                >
                  {config.label}
                </Badge>
              </motion.div>
            );
          })}

          {pages.length === 0 && (
            <div className="text-center py-6">
              <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm font-medium mb-1">No pages yet</p>
              <p className="text-xs text-muted-foreground mb-4">
                Start generating SEO pages to get traffic
              </p>
              <Link href={`/${companyId}/landing-pages?action=generate`}>
                <Button size="sm" className="gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Pages
                </Button>
              </Link>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
