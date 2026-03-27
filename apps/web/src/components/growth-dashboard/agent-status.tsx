'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { GrowthAgentStatus } from '@/lib/api/hooks';
import { Bot, CheckCircle2, Loader2, Clock, AlertCircle, TrendingUp } from 'lucide-react';

interface AgentStatusCardProps {
  agents: GrowthAgentStatus[];
  keywordsCount?: number;
  pagesCount?: number;
}

const statusConfig: Record<string, { color: string; icon: typeof Clock; label: string; animate?: boolean }> = {
  idle: { color: 'bg-slate-500', icon: Clock, label: 'Ready' },
  working: { color: 'bg-blue-500', icon: Loader2, label: 'Working', animate: true },
  analyzing: { color: 'bg-purple-500', icon: Loader2, label: 'Analyzing', animate: true },
  waiting: { color: 'bg-yellow-500', icon: Clock, label: 'Waiting' },
  error: { color: 'bg-red-500', icon: AlertCircle, label: 'Error' },
};

// Business context for each role
function getAgentContext(role: string, tasksCompleted: number, keywordsCount: number, pagesCount: number): { task: string; impact: string } {
  const roleLower = role.toLowerCase();

  if (roleLower.includes('ceo') || roleLower.includes('chief')) {
    return {
      task: 'Overseeing growth strategy',
      impact: 'Coordinating all AI agents for maximum impact',
    };
  }
  if (roleLower.includes('marketing')) {
    return {
      task: keywordsCount > 0 ? `Managing ${keywordsCount} target keywords` : 'Analyzing market opportunities',
      impact: 'Expected: increase organic traffic by targeting high-value keywords',
    };
  }
  if (roleLower.includes('content') || roleLower.includes('landing')) {
    return {
      task: pagesCount > 0 ? `Created ${pagesCount} SEO pages` : 'Ready to generate SEO content',
      impact: 'Expected: capture search traffic with optimized pages',
    };
  }
  if (roleLower.includes('seo') || roleLower.includes('optim')) {
    return {
      task: 'Monitoring rankings and optimizing',
      impact: 'Expected: improve page positions in search results',
    };
  }
  if (roleLower.includes('ads') || roleLower.includes('paid')) {
    return {
      task: 'Managing paid campaigns',
      impact: 'Expected: maximize ROI on ad spend',
    };
  }
  return {
    task: tasksCompleted > 0 ? `Completed ${tasksCompleted} tasks` : 'Waiting for tasks',
    impact: 'Ready to help grow your business',
  };
}

export function AgentStatusCard({ agents, keywordsCount = 0, pagesCount = 0 }: AgentStatusCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="w-4 h-4" />
            Your AI Team
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {agents.filter((a) => a.status === 'working' || a.status === 'analyzing').length} active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {agents.map((agent, index) => {
          const config = statusConfig[agent.status] || statusConfig.idle;
          const StatusIcon = config.icon;
          const context = getAgentContext(agent.role, agent.tasksCompleted, keywordsCount, pagesCount);

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">{agent.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm truncate">{agent.name}</span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 ${config.color} text-white`}
                    >
                      <StatusIcon
                        className={`w-2.5 h-2.5 mr-1 ${config.animate ? 'animate-spin' : ''}`}
                      />
                      {config.label}
                    </Badge>
                  </div>

                  {/* What agent is doing */}
                  <p className="text-xs text-foreground mb-1">
                    → {agent.currentTask || context.task}
                  </p>

                  {/* Business impact */}
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-green-500" />
                    {context.impact}
                  </p>

                  {(agent.status === 'working' || agent.status === 'analyzing') && (
                    <div className="space-y-1 mt-2">
                      <Progress value={agent.progress} className="h-1.5" />
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{agent.progress}%</span>
                        <span>
                          {agent.tasksCompleted}/{agent.tasksTotal} tasks
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}

        {agents.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Your AI team will appear here</p>
            <p className="text-xs">Agents are created during company setup</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
