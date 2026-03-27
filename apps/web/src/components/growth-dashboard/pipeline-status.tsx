'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PipelineStatus } from '@/lib/api/hooks';
import {
  Brain,
  Factory,
  Rocket,
  Globe,
  BarChart3,
  RefreshCw,
  CheckCircle2,
  Loader2,
  Clock,
} from 'lucide-react';

interface PipelineStatusProps {
  pipeline: PipelineStatus;
}

// Business-friendly labels (not technical terms)
const stages = [
  { key: 'intelligence', label: 'Keywords Found', shortLabel: 'KEYWORDS', icon: Brain, color: 'text-purple-500' },
  { key: 'generation', label: 'Content Created', shortLabel: 'CONTENT', icon: Factory, color: 'text-blue-500' },
  { key: 'deployment', label: 'Pages Live', shortLabel: 'LIVE', icon: Rocket, color: 'text-green-500' },
  { key: 'liveMetrics', label: 'Ranking', shortLabel: 'RANKING', icon: Globe, color: 'text-orange-500' },
  { key: 'dataCollection', label: 'Performance', shortLabel: 'TRAFFIC', icon: BarChart3, color: 'text-cyan-500' },
];

function getStageStatus(pipeline: PipelineStatus, key: string): { status: string; value: string } {
  switch (key) {
    case 'intelligence':
      return {
        status: pipeline.intelligence.status,
        value: `${pipeline.intelligence.keywords} keys`,
      };
    case 'generation':
      return {
        status: pipeline.generation.status === 'active' ? 'running' : pipeline.generation.status,
        value: `${pipeline.generation.completed}/${pipeline.generation.total}`,
      };
    case 'deployment':
      return {
        status: pipeline.deployment.live > 0 ? 'done' : 'pending',
        value: `${pipeline.deployment.live} live`,
      };
    case 'liveMetrics':
      return {
        status: 'running',
        value: `#${pipeline.liveMetrics.avgRank} avg`,
      };
    case 'dataCollection':
      return {
        status: 'running',
        value: `${(pipeline.dataCollection.impressions / 1000).toFixed(1)}K imp`,
      };
    default:
      return { status: 'pending', value: '-' };
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'done') {
    return <CheckCircle2 className="w-3 h-3 text-green-500" />;
  }
  if (status === 'running' || status === 'active') {
    return <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />;
  }
  return <Clock className="w-3 h-3 text-muted-foreground" />;
}

export function PipelineStatusCard({ pipeline }: PipelineStatusProps) {
  return (
    <Card className="bg-gradient-to-r from-slate-900/50 to-slate-800/50 border-slate-700">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Growth Pipeline Status
          </h3>
          {pipeline.optimizationLoop.active && (
            <Badge variant="outline" className="text-xs gap-1 border-green-500/50 text-green-400">
              <RefreshCw className="w-3 h-3 animate-spin" />
              {pipeline.optimizationLoop.pagesOptimizing} optimizing
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {stages.map((stage, index) => {
            const { status, value } = getStageStatus(pipeline, stage.key);
            const Icon = stage.icon;

            return (
              <motion.div
                key={stage.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex-1"
              >
                <div className="flex flex-col items-center">
                  <div
                    className={`w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center mb-1.5 ${stage.color}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground">{stage.shortLabel}</span>
                  <span className="text-xs font-medium">{value}</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <StatusIcon status={status} />
                    <span className="text-[10px] text-muted-foreground capitalize">{status}</span>
                  </div>
                </div>

                {index < stages.length - 1 && (
                  <div className="absolute top-1/2 right-0 transform translate-x-1/2 -translate-y-1/2">
                    <div className="w-4 h-0.5 bg-slate-700" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Optimization Loop Indicator */}
        <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 text-green-500" />
          <span className="text-xs text-muted-foreground">
            Optimization Loop: {pipeline.optimizationLoop.pagesOptimizing} pages improving
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
