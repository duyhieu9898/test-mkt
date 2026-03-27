'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  MoreHorizontal,
  Calendar,
  Filter,
  Loader2,
  Play,
  Zap,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTasks, useRetryTask, type Task } from '@/lib/api/hooks';

type TaskStatus = 'pending' | 'scheduled' | 'in_progress' | 'waiting' | 'completed' | 'failed' | 'cancelled';
type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

const statusConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  pending: { icon: Clock, color: 'text-yellow-600', bgColor: 'bg-yellow-50', label: 'Pending' },
  scheduled: { icon: Calendar, color: 'text-blue-600', bgColor: 'bg-blue-50', label: 'Scheduled' },
  in_progress: { icon: RefreshCw, color: 'text-blue-600', bgColor: 'bg-blue-50', label: 'Running' },
  waiting: { icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50', label: 'Waiting' },
  completed: { icon: CheckCircle2, color: 'text-green-600', bgColor: 'bg-green-50', label: 'Done' },
  failed: { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-50', label: 'Failed' },
  cancelled: { icon: XCircle, color: 'text-gray-500', bgColor: 'bg-gray-50', label: 'Cancelled' },
};

const priorityConfig: Record<string, { color: string }> = {
  low: { color: 'text-slate-600' },
  medium: { color: 'text-blue-600' },
  high: { color: 'text-orange-600' },
  critical: { color: 'text-red-600' },
};

function formatDate(dateString?: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function TasksPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // REAL DATA from API - no more mock
  const { data: tasksData, isLoading, refetch } = useTasks(companyId, {
    status: statusFilter !== 'all' ? statusFilter : undefined,
    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
  });
  const retryTask = useRetryTask();

  const allTasks = tasksData?.data || [];

  const filteredTasks = allTasks.filter((task) => {
    if (!searchQuery) return true;
    return (
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const taskStats = {
    total: allTasks.length,
    pending: allTasks.filter((t) => t.status === 'pending' || t.status === 'scheduled').length,
    inProgress: allTasks.filter((t) => t.status === 'in_progress' || t.status === 'waiting').length,
    completed: allTasks.filter((t) => t.status === 'completed').length,
    failed: allTasks.filter((t) => t.status === 'failed').length,
  };

  const handleRetry = async (taskId: string) => {
    try {
      await retryTask.mutateAsync(taskId);
      refetch();
    } catch {}
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
          <p className="text-muted-foreground">What AI is doing for your business</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: taskStats.total, icon: Zap, color: 'text-primary' },
          { label: 'Pending', value: taskStats.pending, icon: Clock, color: 'text-yellow-600' },
          { label: 'Running', value: taskStats.inProgress, icon: RefreshCw, color: 'text-blue-600' },
          { label: 'Completed', value: taskStats.completed, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Failed', value: taskStats.failed, icon: XCircle, color: 'text-red-600' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
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
            placeholder="Search tasks..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="w-4 h-4" />
                Status: {statusFilter === 'all' ? 'All' : statusFilter.replace('_', ' ')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setStatusFilter('all')}>All</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setStatusFilter('pending')}>Pending</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('in_progress')}>In Progress</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('completed')}>Completed</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('failed')}>Failed</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <AlertCircle className="w-4 h-4" />
                Priority: {priorityFilter === 'all' ? 'All' : priorityFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setPriorityFilter('all')}>All</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPriorityFilter('critical')}>Critical</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPriorityFilter('high')}>High</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPriorityFilter('medium')}>Medium</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPriorityFilter('low')}>Low</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Tasks List */}
      {!isLoading && filteredTasks.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredTasks.map((task, i) => {
                const config = statusConfig[task.status] || statusConfig.pending;
                const StatusIcon = config.icon;
                const pConfig = priorityConfig[task.priority] || priorityConfig.medium;

                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className="p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${config.bgColor}`}>
                        <StatusIcon
                          className={`w-5 h-5 ${config.color} ${task.status === 'in_progress' ? 'animate-spin' : ''}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-foreground">{task.title}</h3>
                          <Badge variant="outline" className={`capitalize ${pConfig.color}`}>
                            {task.priority}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {task.type || 'task'}
                          </Badge>
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{task.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {task.assignedAgent && (
                            <div className="flex items-center gap-1">
                              <span className="font-medium">{task.assignedAgent.name}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatDate(task.createdAt)}</span>
                          </div>
                          {task.completedAt && (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Done {formatDate(task.completedAt)}</span>
                              {task.type?.includes('page') && <a href={`/${companyId}/landing-pages`} className="text-primary ml-1 underline text-xs">→ Review page</a>}
                              {task.type?.includes('seo') && <a href={`/${companyId}/analytics`} className="text-primary ml-1 underline text-xs">→ Check rankings</a>}
                              {task.type?.includes('campaign') && <a href={`/${companyId}/marketing`} className="text-primary ml-1 underline text-xs">→ View campaign</a>}
                            </div>
                          )}
                          {task.errorMessage && (
                            <div className="flex items-center gap-1 text-red-600">
                              <XCircle className="w-3 h-3" />
                              <span>{task.errorMessage.substring(0, 50)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {task.status === 'failed' && (
                            <DropdownMenuItem onClick={() => handleRetry(task.id)}>
                              <Play className="w-4 h-4 mr-2" />
                              Retry
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem>View Details</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && filteredTasks.length === 0 && (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No tasks yet</h3>
          <p className="text-muted-foreground mb-2 max-w-md mx-auto">
            {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Tasks will appear here once AI starts working on your pages and marketing'}
          </p>
          <p className="text-xs text-muted-foreground">
            <a href={`/${companyId}`} className="text-primary underline">Go to Dashboard</a> to get started
          </p>
        </Card>
      )}
    </div>
  );
}
