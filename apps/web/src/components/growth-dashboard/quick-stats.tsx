'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import {
  FileText,
  Globe,
  TrendingUp,
  Eye,
  MousePointer,
  Bot,
  CheckCircle2,
} from 'lucide-react';

interface QuickStatsProps {
  stats: {
    totalPages: number;
    pagesLive: number;
    avgRank: number;
    totalImpressions: number;
    totalClicks: number;
    activeAgents: number;
    tasksCompleted: number;
  };
}

export function QuickStats({ stats }: QuickStatsProps) {
  const metrics = [
    {
      label: 'Pages Live',
      value: stats.pagesLive,
      subValue: `of ${stats.totalPages} total`,
      icon: Globe,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      label: 'Avg Rank',
      value: stats.avgRank > 0 ? `#${stats.avgRank}` : '-',
      subValue: stats.avgRank <= 10 ? 'Page 1!' : stats.avgRank <= 30 ? 'Page 1-3' : 'Improving',
      icon: TrendingUp,
      color: stats.avgRank <= 10 ? 'text-green-500' : stats.avgRank <= 30 ? 'text-yellow-500' : 'text-orange-500',
      bgColor: stats.avgRank <= 10 ? 'bg-green-500/10' : stats.avgRank <= 30 ? 'bg-yellow-500/10' : 'bg-orange-500/10',
    },
    {
      label: 'Impressions',
      value: stats.totalImpressions >= 1000
        ? `${(stats.totalImpressions / 1000).toFixed(1)}K`
        : stats.totalImpressions,
      subValue: 'total views',
      icon: Eye,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Clicks',
      value: stats.totalClicks,
      subValue: stats.totalImpressions > 0
        ? `${((stats.totalClicks / stats.totalImpressions) * 100).toFixed(1)}% CTR`
        : '0% CTR',
      icon: MousePointer,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      label: 'Active Agents',
      value: stats.activeAgents,
      subValue: 'working for you',
      icon: Bot,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
    },
    {
      label: 'Tasks Done',
      value: stats.tasksCompleted,
      subValue: 'completed',
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {metrics.map((metric, index) => (
        <motion.div
          key={metric.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <Card className="hover:border-primary/30 transition-colors">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg ${metric.bgColor} flex items-center justify-center`}>
                  <metric.icon className={`w-4 h-4 ${metric.color}`} />
                </div>
              </div>
              <div className="text-xl font-bold">{metric.value}</div>
              <div className="text-[10px] text-muted-foreground">{metric.label}</div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">{metric.subValue}</div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
