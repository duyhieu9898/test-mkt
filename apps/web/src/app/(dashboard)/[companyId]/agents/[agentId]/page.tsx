'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { useAgent, useAgentMessages, useSendAgentCommand, useAgentTasks, useControlAgent } from '@/lib/api/hooks';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Send,
  Play,
  Pause,
  Settings,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Activity,
  Target,
  DollarSign,
  Brain,
  Zap,
  BarChart3,
  RefreshCw,
  Loader2,
  Sparkles,
  GitBranch,
  Award,
} from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

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
  hr_manager: '👥',
  custom: '🤖',
};

function formatRelativeTime(date: string | null | undefined): string {
  if (!date) return 'Never';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function AgentDetailPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const agentId = params.agentId as string;

  const { data: agent, isLoading: agentLoading } = useAgent(agentId);
  const { data: messages, isLoading: messagesLoading } = useAgentMessages(agentId);
  const { data: tasks } = useAgentTasks(agentId);
  const sendCommand = useSendAgentCommand();
  const controlAgent = useControlAgent();

  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || sendCommand.isPending) return;

    const command = inputValue;
    setInputValue('');
    setIsTyping(true);

    try {
      await sendCommand.mutateAsync({ agentId, command });
      toast.success('Message sent');
    } catch {
      toast.error('Failed to send message');
    } finally {
      setIsTyping(false);
    }
  };

  const handleToggleAgent = async () => {
    if (!agent) return;
    const action = agent.status === 'running' ? 'pause' : 'start';
    try {
      await controlAgent.mutateAsync({ agentId, action });
      toast.success(`Agent ${action === 'start' ? 'started' : 'paused'}`);
    } catch {
      toast.error('Failed to update agent');
    }
  };

  if (agentLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!agent) {
    return (
      <Card className="p-12 text-center">
        <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Agent not found</h3>
        <Link href={`/${companyId}/agents`}>
          <Button>Back to Agents</Button>
        </Link>
      </Card>
    );
  }

  const performanceScore = parseFloat(agent.performanceScore || '0');
  const budgetUsed = parseFloat(agent.budgetSpent || '0');
  const budgetLimit = parseFloat(agent.budgetLimit || '100');

  // Evolution data (derived from agent performance)
  const evolutionHistory = [
    {
      version: '1.0.0',
      date: agent.createdAt,
      changes: 'Initial deployment',
      score: 75,
    },
    ...(performanceScore > 80 ? [{
      version: '1.1.0',
      date: new Date().toISOString(),
      changes: `Performance improved to ${performanceScore.toFixed(0)}%`,
      score: performanceScore,
    }] : []),
  ];

  const capabilities = Array.isArray(agent.capabilities)
    ? agent.capabilities.map((c: { name?: string; level?: string } | string) =>
        typeof c === 'string' ? { name: c, level: 'intermediate' } : c
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/${companyId}/agents`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-4 flex-1">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl"
            style={{ backgroundColor: `${agent.color || '#6366f1'}20` }}
          >
            {roleEmojis[agent.role] || '🤖'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{agent.name}</h1>
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
            <p className="text-muted-foreground">{agent.description || agent.title || agent.role.replace('_', ' ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleAgent}
            disabled={controlAgent.isPending}
          >
            {controlAgent.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : agent.status === 'running' ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Start
              </>
            )}
          </Button>
          <Button variant="outline" size="icon">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Performance', value: `${performanceScore.toFixed(0)}%`, icon: TrendingUp, color: 'text-green-500' },
          { label: 'Tasks Completed', value: agent.tasksCompleted || 0, icon: CheckCircle2, color: 'text-blue-500' },
          { label: 'Tasks Failed', value: agent.tasksFailed || 0, icon: XCircle, color: 'text-red-500' },
          { label: 'Budget Used', value: `$${budgetUsed.toFixed(2)}`, icon: DollarSign, color: 'text-purple-500' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                  <stat.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <Tabs defaultValue="chat" className="space-y-4">
        <TabsList>
          <TabsTrigger value="chat" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2">
            <Activity className="w-4 h-4" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="evolution" className="gap-2">
            <Brain className="w-4 h-4" />
            Evolution
          </TabsTrigger>
        </TabsList>

        {/* Chat Tab */}
        <TabsContent value="chat">
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="border-b py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${agent.status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  <span className="text-sm text-muted-foreground">
                    {agent.status === 'running' ? 'Agent is online' : 'Agent is offline'}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : (
                <AnimatePresence>
                  {(messages || []).map((message) => {
                    const isUser = message.role === 'user';
                    return (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                            isUser
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          <p
                            className={`text-xs mt-1 ${
                              isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
                            }`}
                          >
                            {formatRelativeTime(message.createdAt)}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-muted rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <motion.span
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                        className="w-2 h-2 rounded-full bg-foreground/50"
                      />
                      <motion.span
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                        className="w-2 h-2 rounded-full bg-foreground/50"
                      />
                      <motion.span
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                        className="w-2 h-2 rounded-full bg-foreground/50"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
              {(!messages || messages.length === 0) && !messagesLoading && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="w-12 h-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No messages yet</p>
                  <p className="text-sm text-muted-foreground">Start a conversation with {agent.name}</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </CardContent>
            <div className="border-t p-4">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={`Send a message to ${agent.name}...`}
                  className="flex-1"
                  disabled={sendCommand.isPending}
                />
                <Button type="submit" disabled={!inputValue.trim() || sendCommand.isPending}>
                  {sendCommand.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>
            </div>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  KPI Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {[
                  { name: 'Task Success Rate', value: agent.tasksCompleted > 0 ? (agent.tasksCompleted / (agent.tasksCompleted + agent.tasksFailed)) * 100 : 0, target: 90 },
                  { name: 'Response Quality', value: performanceScore, target: 85 },
                  { name: 'Budget Efficiency', value: budgetLimit > 0 ? 100 - (budgetUsed / budgetLimit) * 100 : 100, target: 80 },
                ].map((kpi) => (
                  <div key={kpi.name} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{kpi.name}</span>
                      <span className={kpi.value >= kpi.target ? 'text-green-500' : 'text-orange-500'}>
                        {kpi.value.toFixed(0)}% / {kpi.target}%
                      </span>
                    </div>
                    <Progress
                      value={kpi.value}
                      indicatorClassName={kpi.value >= kpi.target ? 'bg-green-500' : 'bg-orange-500'}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Capabilities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {capabilities.filter((cap): cap is { name: string; level?: string } => !!cap.name).map((cap) => (
                    <Badge key={cap.name} variant="secondary" className="capitalize">
                      {cap.name.replace(/_/g, ' ')}
                      {cap.level && <span className="ml-1 opacity-70">({cap.level})</span>}
                    </Badge>
                  ))}
                  {capabilities.length === 0 && (
                    <p className="text-muted-foreground">No capabilities defined</p>
                  )}
                </div>
                <div className="mt-6 space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Budget Usage</span>
                      <span>${budgetUsed.toFixed(2)} / ${budgetLimit.toFixed(2)}</span>
                    </div>
                    <Progress
                      value={(budgetUsed / budgetLimit) * 100}
                      indicatorClassName={
                        budgetUsed / budgetLimit > 0.8
                          ? 'bg-orange-500'
                          : 'bg-primary'
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-muted-foreground">Created</p>
                      <p className="font-medium">{new Date(agent.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Last Active</p>
                      <p className="font-medium">{formatRelativeTime(agent.lastActiveAt)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Tasks</CardTitle>
                <Link href={`/${companyId}/tasks?agentId=${agentId}`}>
                  <Button variant="outline" size="sm">
                    View All Tasks
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(tasks || []).slice(0, 10).map((task, i) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        task.status === 'completed'
                          ? 'bg-green-500/10 text-green-500'
                          : task.status === 'in_progress'
                          ? 'bg-blue-500/10 text-blue-500'
                          : task.status === 'failed'
                          ? 'bg-red-500/10 text-red-500'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {task.status === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : task.status === 'in_progress' ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : task.status === 'failed' ? (
                        <XCircle className="w-5 h-5" />
                      ) : (
                        <Clock className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {task.status === 'completed'
                          ? `Completed ${formatRelativeTime(task.completedAt)}`
                          : task.status === 'in_progress'
                          ? `Started ${formatRelativeTime(task.startedAt)}`
                          : `Created ${formatRelativeTime(task.createdAt)}`}
                      </p>
                    </div>
                    <Badge
                      variant={
                        task.status === 'completed'
                          ? 'success'
                          : task.status === 'in_progress'
                          ? 'default'
                          : task.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                      }
                      className="capitalize"
                    >
                      {task.status.replace('_', ' ')}
                    </Badge>
                  </motion.div>
                ))}

                {(!tasks || tasks.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No tasks assigned yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Evolution Tab */}
        <TabsContent value="evolution">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Evolution Timeline */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5" />
                    Evolution History
                  </CardTitle>
                  <Badge variant="outline">Current: v{evolutionHistory[evolutionHistory.length - 1]?.version || '1.0.0'}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                  <div className="space-y-6">
                    {evolutionHistory.map((entry, i) => (
                      <motion.div
                        key={entry.version}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="relative pl-10"
                      >
                        <div
                          className={`absolute left-2.5 w-3 h-3 rounded-full border-2 ${
                            i === evolutionHistory.length - 1
                              ? 'bg-primary border-primary'
                              : 'bg-background border-muted-foreground'
                          }`}
                        />
                        <div className="p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={i === evolutionHistory.length - 1 ? 'default' : 'outline'}>v{entry.version}</Badge>
                              <span className="text-sm text-muted-foreground">
                                {new Date(entry.date).toLocaleDateString()}
                              </span>
                            </div>
                            {entry.score && (
                              <Badge variant="secondary" className="gap-1">
                                <Award className="w-3 h-3" />
                                {entry.score}%
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm">{entry.changes}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Learning Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Learning Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center p-4 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10">
                  <p className="text-4xl font-bold">{performanceScore.toFixed(0)}%</p>
                  <p className="text-sm text-muted-foreground">Overall Performance</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Task Mastery</span>
                      <span>{Math.min(100, agent.tasksCompleted * 5)}%</span>
                    </div>
                    <Progress value={Math.min(100, agent.tasksCompleted * 5)} />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Communication</span>
                      <span>{Math.min(100, (messages?.length || 0) * 2)}%</span>
                    </div>
                    <Progress value={Math.min(100, (messages?.length || 0) * 2)} />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Efficiency</span>
                      <span>{budgetLimit > 0 ? Math.max(0, 100 - (budgetUsed / budgetLimit) * 100).toFixed(0) : 100}%</span>
                    </div>
                    <Progress value={budgetLimit > 0 ? Math.max(0, 100 - (budgetUsed / budgetLimit) * 100) : 100} />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-2">Next Evolution</p>
                  <div className="flex items-center gap-2">
                    <Progress value={Math.min(100, agent.tasksCompleted * 10)} className="flex-1" />
                    <span className="text-xs text-muted-foreground">
                      {Math.min(100, agent.tasksCompleted * 10)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Complete {Math.max(0, 10 - agent.tasksCompleted)} more tasks to unlock improvements
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
