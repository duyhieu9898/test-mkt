'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ActivityLogEntry } from '@/lib/api/hooks';
import {
  Activity,
  Rocket,
  RefreshCw,
  TrendingUp,
  Factory,
  Brain,
  Bot,
  AlertCircle,
  Filter,
} from 'lucide-react';

interface ActivityLogCardProps {
  activities: ActivityLogEntry[];
}

const typeConfig = {
  deploy: { icon: Rocket, color: 'text-green-500', bg: 'bg-green-500/10' },
  optimize: { icon: RefreshCw, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  rank_change: { icon: TrendingUp, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  generate: { icon: Factory, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  intel: { icon: Brain, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  agent: { icon: Bot, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
};

const levelColors = {
  info: 'border-l-slate-500',
  success: 'border-l-green-500',
  warning: 'border-l-yellow-500',
  error: 'border-l-red-500',
};

function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function ActivityLogCard({ activities }: ActivityLogCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Activity Log
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
            <Filter className="w-3 h-3" />
            Filter
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
          {activities.map((activity, index) => {
            const config = typeConfig[activity.type] || typeConfig.agent;
            const Icon = config.icon;

            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors border-l-2 ${levelColors[activity.level]}`}
              >
                <div className={`w-7 h-7 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{activity.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatRelativeTime(activity.timestamp)}
                  </p>
                </div>
              </motion.div>
            );
          })}

          {activities.length === 0 && (
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                <Activity className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium mb-1">Live Feed</p>
              <p className="text-xs text-muted-foreground mb-2">
                Activities will appear here in real-time
              </p>
              <div className="space-y-1 text-[10px] text-muted-foreground">
                <p>+ Generated page: /crm-for-startups</p>
                <p>+ Added 5 internal links</p>
                <p>+ Improved ranking: #22 → #15</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
