'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { useAgents, useControlAgent } from '@/lib/api/hooks';
import { toast } from 'sonner';
import {
  Bot,
  Plus,
  Search,
  Play,
  Pause,
  Settings,
  MoreHorizontal,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Role to emoji mapping
const roleEmojis: Record<string, string> = {
  ceo: '👔',
  marketing_manager: '📈',
  sales_manager: '💼',
  content_creator: '✍️',
  ads_specialist: '🎯',
  analyst: '📊',
  support: '🎧',
  developer: '💻',
  custom: '🤖',
};

// Format relative time
function formatRelativeTime(date: string | null | undefined): string {
  if (!date) return 'Never';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} days ago`;
}

export default function AgentsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'running' | 'paused'>('all');

  const { data: agents, isLoading, error } = useAgents(companyId);
  const controlAgent = useControlAgent();

  const handleToggleAgent = async (agentId: string, currentStatus: string) => {
    const action = currentStatus === 'running' ? 'pause' : 'start';
    try {
      await controlAgent.mutateAsync({ agentId, action });
      toast.success(`Agent ${action === 'start' ? 'started' : 'paused'}`);
    } catch (err) {
      toast.error('Failed to update agent');
    }
  };

  const handleStopAgent = async (agentId: string) => {
    try {
      await controlAgent.mutateAsync({ agentId, action: 'stop' });
      toast.success('Agent stopped');
    } catch (err) {
      toast.error('Failed to stop agent');
    }
  };

  const filteredAgents = (agents || []).filter((agent) => {
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filter === 'all' ||
      (filter === 'running' && agent.status === 'running') ||
      (filter === 'paused' && ['paused', 'waiting', 'created', 'ready'].includes(agent.status));
    return matchesSearch && matchesFilter;
  });

  const activeCount = (agents || []).filter((a) => a.status === 'running').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-12 text-center">
        <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to load agents</h3>
        <p className="text-muted-foreground">Please try again later</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">AI Agents</h1>
          <p className="text-muted-foreground">Manage your AI workforce</p>
        </div>
        <Link href={`/${companyId}/agents/new`}>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Agent
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Agents', value: agents?.length || 0, icon: Bot },
          { label: 'Active', value: activeCount, icon: Play },
          {
            label: 'Tasks Completed',
            value: (agents || []).reduce((sum, a) => sum + (a.tasksCompleted || 0), 0),
            icon: CheckCircle2,
          },
          {
            label: 'Avg. Performance',
            value:
              agents && agents.length > 0
                ? `${Math.round(
                    agents.reduce((sum, a) => sum + parseFloat(a.performanceScore || '0'), 0) /
                      agents.length
                  )}%`
                : '0%',
            icon: TrendingUp,
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'running', 'paused'] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredAgents.map((agent, i) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="overflow-hidden hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                {/* Header */}
                <div className="h-2" style={{ backgroundColor: agent.color || '#6366f1' }} />
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="text-4xl">{roleEmojis[agent.role] || '🤖'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/${companyId}/agents/${agent.id}`}
                          className="font-semibold hover:text-primary transition-colors"
                        >
                          {agent.name}
                        </Link>
                        <Badge
                          variant={agent.status === 'running' ? 'success' : 'secondary'}
                          className="capitalize"
                        >
                          {agent.status === 'running' && (
                            <div className="w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />
                          )}
                          {agent.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {agent.description || agent.title || agent.role.replace('_', ' ')}
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/${companyId}/agents/${agent.id}`}>
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Chat with Agent
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Settings className="w-4 h-4 mr-2" />
                          Settings
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleStopAgent(agent.id)}
                        >
                          Stop Agent
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 mt-6">
                    <div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        Completed
                      </div>
                      <p className="text-lg font-semibold">{agent.tasksCompleted || 0}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                        Failed
                      </div>
                      <p className="text-lg font-semibold">{agent.tasksFailed || 0}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <TrendingUp className="w-3.5 h-3.5 text-primary" />
                        Score
                      </div>
                      <p className="text-lg font-semibold">
                        {agent.performanceScore ? `${Math.round(parseFloat(agent.performanceScore))}%` : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Budget */}
                  {agent.budgetLimit && (
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Budget</span>
                        <span>
                          ${parseFloat(agent.budgetSpent || '0').toFixed(2)} / ${parseFloat(agent.budgetLimit).toFixed(2)}
                        </span>
                      </div>
                      <Progress
                        value={(parseFloat(agent.budgetSpent || '0') / parseFloat(agent.budgetLimit)) * 100}
                        indicatorClassName={
                          parseFloat(agent.budgetSpent || '0') / parseFloat(agent.budgetLimit) > 0.8
                            ? 'bg-orange-500'
                            : 'bg-primary'
                        }
                      />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between mt-6 pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span>Active {formatRelativeTime(agent.lastActiveAt)}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleAgent(agent.id, agent.status)}
                        disabled={controlAgent.isPending}
                      >
                        {controlAgent.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : agent.status === 'running' ? (
                          <>
                            <Pause className="w-4 h-4 mr-1" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-1" />
                            Start
                          </>
                        )}
                      </Button>
                      <Link href={`/${companyId}/agents/${agent.id}`}>
                        <Button size="sm">View Details</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Empty state */}
      {filteredAgents.length === 0 && !isLoading && (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Bot className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No agents found</h3>
          <p className="text-muted-foreground mb-6">
            {searchQuery ? 'Try adjusting your search' : 'Add your first AI agent to get started'}
          </p>
          <Link href={`/${companyId}/agents/new`}>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Agent
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
