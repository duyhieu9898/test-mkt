'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { GrowthDashboardOverview } from '@/lib/api/hooks';
import {
  Target,
  Rocket,
  AlertTriangle,
  FileText,
  Eye,
  Globe,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Zap,
} from 'lucide-react';

interface ActionCenterProps {
  data: GrowthDashboardOverview;
  companyId: string;
  onGeneratePages?: () => void;
  onPreviewContent?: () => void;
  onDeployPages?: () => void;
  onFixIssue?: (pageId: string) => void;
  onViewProgress?: () => void;
}

type SystemState = 'new_user' | 'in_progress' | 'needs_attention' | 'running_smoothly';

function determineState(data: GrowthDashboardOverview): SystemState {
  const { pipeline, optimizationLoop, quickStats } = data;

  // Check if needs attention (underperforming pages)
  if (optimizationLoop.currentlyOptimizing.length > 0) {
    return 'needs_attention';
  }

  // Check if new user (no pages yet)
  if (quickStats.totalPages === 0) {
    return 'new_user';
  }

  // Check if in progress (pages being generated/deployed)
  if (pipeline.generation.inProgress > 0 || pipeline.deployment.building > 0) {
    return 'in_progress';
  }

  // Otherwise running smoothly
  return 'running_smoothly';
}

export function ActionCenter({
  data,
  companyId,
  onGeneratePages,
  onPreviewContent,
  onDeployPages,
  onFixIssue,
  onViewProgress,
}: ActionCenterProps) {
  const state = determineState(data);
  const { pipeline, optimizationLoop, quickStats } = data;

  // STATE 1: New User
  if (state === 'new_user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Card className="bg-gradient-to-br from-primary/5 via-purple-500/5 to-pink-500/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-bold">Your Growth Plan</h2>
            </div>

            {pipeline.intelligence.keywords > 0 ? (
              <p className="text-muted-foreground mb-6">
                We found <span className="font-semibold text-primary">{pipeline.intelligence.keywords} keywords</span> for your business.
              </p>
            ) : (
              <p className="text-muted-foreground mb-6">
                Let's start by discovering keywords and creating content that ranks on Google.
              </p>
            )}

            <div className="space-y-4">
              {/* Step 1 */}
              <div className="flex items-start gap-4 p-4 rounded-lg bg-background/50 border">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">1</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Generate SEO pages</h3>
                  <p className="text-sm text-muted-foreground">
                    Create content targeting high-value keywords
                  </p>
                </div>
                <Button onClick={onGeneratePages} className="gap-2">
                  <Sparkles className="w-4 h-4" />
                  Generate Pages
                </Button>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-4 p-4 rounded-lg bg-background/50 border opacity-60">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-muted-foreground">2</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Review content</h3>
                  <p className="text-sm text-muted-foreground">
                    Preview and approve AI-generated pages
                  </p>
                </div>
                <Button variant="outline" disabled className="gap-2">
                  <Eye className="w-4 h-4" />
                  Preview Content
                </Button>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-4 p-4 rounded-lg bg-background/50 border opacity-60">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-muted-foreground">3</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Go live</h3>
                  <p className="text-sm text-muted-foreground">
                    Publish pages and start ranking on Google
                  </p>
                </div>
                <Button variant="outline" disabled className="gap-2">
                  <Globe className="w-4 h-4" />
                  Deploy Pages
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // STATE 2: In Progress
  if (state === 'in_progress') {
    const totalPages = quickStats.totalPages;
    const livePages = quickStats.pagesLive;
    const optimizing = optimizationLoop.currentlyOptimizing.length;
    const keywords = pipeline.intelligence.keywords;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Card className="bg-gradient-to-br from-green-500/5 via-emerald-500/5 to-teal-500/5 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Rocket className="w-6 h-6 text-green-500" />
                <h2 className="text-xl font-bold">Your AI Growth Engine is running</h2>
              </div>
              <Badge variant="success" className="gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Active
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-background/50 border text-center">
                <div className="text-2xl font-bold text-green-600">{totalPages}</div>
                <div className="text-sm text-muted-foreground">pages generated</div>
              </div>
              <div className="p-4 rounded-lg bg-background/50 border text-center">
                <div className="text-2xl font-bold text-blue-600">{optimizing}</div>
                <div className="text-sm text-muted-foreground">being optimized</div>
              </div>
              <div className="p-4 rounded-lg bg-background/50 border text-center">
                <div className="text-2xl font-bold text-purple-600">{keywords}</div>
                <div className="text-sm text-muted-foreground">keywords tracked</div>
              </div>
            </div>

            <Button onClick={onViewProgress} variant="outline" className="w-full gap-2">
              View Progress
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // STATE 3: Needs Attention
  if (state === 'needs_attention') {
    const issues = optimizationLoop.currentlyOptimizing;
    const primaryIssue = issues[0];

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Card className="bg-gradient-to-br from-yellow-500/5 via-orange-500/5 to-red-500/5 border-yellow-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
                <h2 className="text-xl font-bold">
                  {issues.length} page{issues.length > 1 ? 's' : ''} need{issues.length === 1 ? 's' : ''} improvement
                </h2>
              </div>
              <Badge variant="warning" className="gap-1">
                Action Required
              </Badge>
            </div>

            {primaryIssue && (
              <div className="p-4 rounded-lg bg-background/50 border mb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <code className="text-sm font-medium">{primaryIssue.slug}</code>
                    <p className="text-sm text-muted-foreground mt-1">
                      {primaryIssue.issue}
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                    Recommended action:
                  </p>
                  <p className="text-sm text-muted-foreground">
                    → {primaryIssue.action === 'meta_update' && 'Improve title and meta description'}
                    {primaryIssue.action === 'content_update' && 'Update content for better relevance'}
                    {primaryIssue.action === 'full_rewrite' && 'Rewrite content to improve rankings'}
                  </p>
                </div>

                <Button
                  onClick={() => onFixIssue?.(primaryIssue.pageId)}
                  className="w-full mt-4 gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Fix Now
                </Button>
              </div>
            )}

            {issues.length > 1 && (
              <p className="text-sm text-muted-foreground text-center">
                +{issues.length - 1} more page{issues.length > 2 ? 's' : ''} need attention
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // STATE 4: Running Smoothly
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <Card className="bg-gradient-to-br from-green-500/5 via-emerald-500/5 to-teal-500/5 border-green-500/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
              <h2 className="text-xl font-bold">Everything is running smoothly</h2>
            </div>
            <Badge variant="success" className="gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              All Systems Go
            </Badge>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="p-3 rounded-lg bg-background/50 border text-center">
              <div className="text-xl font-bold text-green-600">{quickStats.pagesLive}</div>
              <div className="text-xs text-muted-foreground">Pages Live</div>
            </div>
            <div className="p-3 rounded-lg bg-background/50 border text-center">
              <div className="text-xl font-bold text-blue-600">
                {quickStats.avgRank > 0 ? `#${quickStats.avgRank}` : '-'}
              </div>
              <div className="text-xs text-muted-foreground">Avg Rank</div>
            </div>
            <div className="p-3 rounded-lg bg-background/50 border text-center">
              <div className="text-xl font-bold text-purple-600">
                {quickStats.totalImpressions >= 1000
                  ? `${(quickStats.totalImpressions / 1000).toFixed(1)}K`
                  : quickStats.totalImpressions}
              </div>
              <div className="text-xs text-muted-foreground">Impressions</div>
            </div>
            <div className="p-3 rounded-lg bg-background/50 border text-center">
              <div className="text-xl font-bold text-orange-600">{quickStats.totalClicks}</div>
              <div className="text-xs text-muted-foreground">Clicks</div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="w-4 h-4 text-green-500" />
            Your AI team is continuously optimizing for better rankings
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
