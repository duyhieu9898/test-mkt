'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { OptimizingPage } from '@/lib/api/hooks';
import { RefreshCw, TrendingUp, AlertTriangle, Zap, FileText } from 'lucide-react';

interface OptimizationLoopCardProps {
  currentlyOptimizing: OptimizingPage[];
  stats: {
    optimizedLast7Days: number;
    avgRankImprovement: number;
  };
}

const actionLabels: Record<string, { label: string; icon: typeof Zap }> = {
  meta_update: { label: 'Meta Update', icon: FileText },
  content_update: { label: 'Content Update', icon: Zap },
  full_rewrite: { label: 'Full Rewrite', icon: RefreshCw },
  structure_change: { label: 'Structure', icon: FileText },
  internal_links: { label: 'Links', icon: FileText },
};

export function OptimizationLoopCard({ currentlyOptimizing, stats }: OptimizationLoopCardProps) {
  return (
    <Card className="border-green-500/20 bg-green-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-green-500" />
            Optimization Loop
            <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-600">
              Auto-Improvement
            </Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-background/50">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Zap className="w-3.5 h-3.5" />
              Last 7 days
            </div>
            <div className="text-xl font-bold">{stats.optimizedLast7Days}</div>
            <div className="text-xs text-muted-foreground">pages optimized</div>
          </div>
          <div className="p-3 rounded-lg bg-background/50">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              Avg Improvement
            </div>
            <div className="text-xl font-bold text-green-500">+{stats.avgRankImprovement}</div>
            <div className="text-xs text-muted-foreground">positions gained</div>
          </div>
        </div>

        {/* Currently Optimizing */}
        {currentlyOptimizing.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Currently Optimizing
            </h4>
            {currentlyOptimizing.map((page, index) => {
              const actionConfig = actionLabels[page.action] || actionLabels.content_update;
              const ActionIcon = actionConfig.icon;

              return (
                <motion.div
                  key={page.pageId}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-3 rounded-lg bg-background border border-border/50"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <code className="text-xs font-medium text-primary">{page.slug}</code>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {page.keyword}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <ActionIcon className="w-2.5 h-2.5" />
                      {actionConfig.label}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-amber-600 mb-2">
                    <AlertTriangle className="w-3 h-3" />
                    <span className="truncate">{page.issue}</span>
                  </div>

                  <div className="space-y-1">
                    <Progress value={page.progress} className="h-1.5" />
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>
                        {page.progress < 30
                          ? 'Analyzing...'
                          : page.progress < 70
                          ? 'Generating...'
                          : 'Deploying...'}
                      </span>
                      <span>ETA: {page.eta}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {currentlyOptimizing.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <RefreshCw className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">All pages performing well</p>
            <p className="text-xs">Loop will activate when issues are detected</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
