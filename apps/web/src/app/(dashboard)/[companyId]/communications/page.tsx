'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useCompanyMessages,
  useMessageTimeline,
  useCommunicationStats,
  useCollaborationSessions,
  useCommunicationNetwork,
  useAgents,
  type AgentMessage,
  type CommunicationFilters,
} from '@/lib/api/hooks';
import {
  MessageSquare,
  Users,
  Network,
  Clock,
  ArrowRight,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Send,
  Inbox,
  Activity,
  X,
  Eye,
  GitBranch,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

export default function CommunicationsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [activeTab, setActiveTab] = useState<'timeline' | 'threads' | 'collaborations'>('timeline');
  const [filters, setFilters] = useState<CommunicationFilters>({});
  const [selectedMessage, setSelectedMessage] = useState<AgentMessage | null>(null);
  const [page, setPage] = useState(0);
  const limit = 20;

  // Data hooks
  const { data: agentsData } = useAgents(companyId);
  const { data: messagesResponse, isLoading: loadingMessages } = useCompanyMessages(
    companyId,
    filters,
    limit,
    page * limit
  );
  const messages = messagesResponse?.data || [];
  const totalMessages = messagesResponse?.total || 0;
  const { data: timeline, isLoading: loadingTimeline } = useMessageTimeline(companyId, 7);
  const { data: stats } = useCommunicationStats(companyId);
  const { data: collaborations, isLoading: loadingCollabs } = useCollaborationSessions(companyId);
  const { data: network } = useCommunicationNetwork(companyId);

  const messageTypes = [
    'task_delegation',
    'task_update',
    'task_completion',
    'request_help',
    'provide_help',
    'information_share',
    'collaboration_invite',
    'feedback',
    'escalation',
    'decision_request',
    'decision_response',
    'status_report',
    'handoff',
  ];

  const priorities = ['critical', 'high', 'normal', 'low'];

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge variant="default">High</Badge>;
      case 'normal':
        return <Badge variant="secondary">Normal</Badge>;
      case 'low':
        return <Badge variant="outline">Low</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case 'task_delegation':
      case 'handoff':
        return <ArrowRight className="w-4 h-4" />;
      case 'request_help':
        return <AlertCircle className="w-4 h-4" />;
      case 'task_completion':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'collaboration_invite':
        return <Users className="w-4 h-4" />;
      case 'decision_request':
      case 'decision_response':
        return <GitBranch className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const totalPages = Math.ceil(totalMessages / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agent Communications</h1>
          <p className="text-muted-foreground">View messages and collaborations between agents</p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-2xl font-bold">{stats?.total || 0}</h3>
            <p className="text-sm text-muted-foreground">Messages (7d)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Inbox className="w-5 h-5 text-orange-500" />
            </div>
            <h3 className="text-2xl font-bold">{stats?.pendingResponses || 0}</h3>
            <p className="text-sm text-muted-foreground">Pending Responses</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="w-5 h-5 text-purple-500" />
            </div>
            <h3 className="text-2xl font-bold">{stats?.activeThreads || 0}</h3>
            <p className="text-sm text-muted-foreground">Active Threads</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <h3 className="text-2xl font-bold">{collaborations?.length || 0}</h3>
            <p className="text-sm text-muted-foreground">Collaborations</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Message List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-4">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="timeline" className="gap-2">
                    <Clock className="w-4 h-4" />
                    Timeline
                  </TabsTrigger>
                  <TabsTrigger value="threads" className="gap-2">
                    <GitBranch className="w-4 h-4" />
                    Messages
                  </TabsTrigger>
                  <TabsTrigger value="collaborations" className="gap-2">
                    <Users className="w-4 h-4" />
                    Sessions
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>

            <CardContent>
              {/* Filters */}
              {activeTab !== 'collaborations' && (
                <div className="flex flex-wrap gap-2 mb-4">
                  <Select
                    value={filters.agentId || 'all'}
                    onValueChange={(v: string) => {
                      setFilters({ ...filters, agentId: v === 'all' ? undefined : v });
                      setPage(0);
                    }}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Agents</SelectItem>
                      {agentsData?.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={filters.messageType || 'all'}
                    onValueChange={(v: string) => {
                      setFilters({ ...filters, messageType: v === 'all' ? undefined : v });
                      setPage(0);
                    }}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Message Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {messageTypes.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={filters.priority || 'all'}
                    onValueChange={(v: string) => {
                      setFilters({ ...filters, priority: v === 'all' ? undefined : v });
                      setPage(0);
                    }}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {priorities.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setFilters({});
                      setPage(0);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Timeline View */}
              {activeTab === 'timeline' && (
                <div className="space-y-6">
                  {loadingTimeline ? (
                    <div className="flex items-center justify-center h-48">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    timeline?.timeline.map((day) => (
                      <div key={day.date}>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-sm font-medium text-muted-foreground">
                            {format(new Date(day.date), 'EEEE, MMM d')}
                          </span>
                          <Badge variant="secondary">{day.count}</Badge>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                        <div className="space-y-2">
                          {day.messages.slice(0, 10).map((msg) => (
                            <motion.div
                              key={msg.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className={`p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors ${
                                selectedMessage?.id === msg.id ? 'border-primary bg-muted/50' : ''
                              }`}
                              onClick={() => setSelectedMessage(msg)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  {/* Sender */}
                                  <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                    style={{ backgroundColor: msg.sender?.color || '#6366f1' }}
                                  >
                                    {msg.sender?.name?.charAt(0) || '?'}
                                  </div>
                                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                  {/* Receiver */}
                                  <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                    style={{ backgroundColor: msg.receiver?.color || '#6b7280' }}
                                  >
                                    {msg.receiver?.name?.charAt(0) || '?'}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      {getMessageTypeIcon(msg.messageType)}
                                      <span className="font-medium text-sm truncate">
                                        {msg.content.summary}
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {msg.sender?.name || 'Unknown'} to {msg.receiver?.name || 'Unknown'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {getPriorityBadge(msg.priority)}
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {format(new Date(msg.createdAt), 'HH:mm')}
                                  </span>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}

                  {timeline?.timeline.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No messages in the last 7 days</p>
                    </div>
                  )}
                </div>
              )}

              {/* Messages List View */}
              {activeTab === 'threads' && (
                <div className="space-y-2">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-48">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    messages.map((msg: AgentMessage) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors ${
                          selectedMessage?.id === msg.id ? 'border-primary bg-muted/50' : ''
                        }`}
                        onClick={() => setSelectedMessage(msg)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                              style={{ backgroundColor: msg.sender?.color || '#6366f1' }}
                            >
                              {msg.sender?.name?.charAt(0) || '?'}
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                              style={{ backgroundColor: msg.receiver?.color || '#6b7280' }}
                            >
                              {msg.receiver?.name?.charAt(0) || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {getMessageTypeIcon(msg.messageType)}
                                <span className="font-medium text-sm truncate">{msg.content.summary}</span>
                              </div>
                              <p className="text-xs text-muted-foreground capitalize">
                                {msg.messageType.replace(/_/g, ' ')}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {getPriorityBadge(msg.priority)}
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}

                  {messages.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No messages found</p>
                    </div>
                  )}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        Showing {page * limit + 1} - {Math.min((page + 1) * limit, totalMessages)} of{' '}
                        {totalMessages}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm">
                          Page {page + 1} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page >= totalPages - 1}
                          onClick={() => setPage(page + 1)}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Collaborations View */}
              {activeTab === 'collaborations' && (
                <div className="space-y-3">
                  {loadingCollabs ? (
                    <div className="flex items-center justify-center h-48">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    (collaborations || []).map((session) => (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Users className="w-4 h-4 text-primary" />
                              <span className="font-medium">{session.title}</span>
                              <Badge
                                variant={
                                  session.status === 'active'
                                    ? 'default'
                                    : session.status === 'completed'
                                      ? 'secondary'
                                      : 'outline'
                                }
                              >
                                {session.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">{session.purpose}</p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}
                          </div>
                        </div>

                        {/* Participants */}
                        <div className="flex items-center gap-2 mt-3">
                          <span className="text-xs text-muted-foreground">Participants:</span>
                          <div className="flex -space-x-2">
                            {(session.participants || []).slice(0, 5).map((p, i) => (
                              <div
                                key={p.id}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-background"
                                style={{ backgroundColor: p.color || '#6366f1', zIndex: 5 - i }}
                                title={p.name}
                              >
                                {p.name.charAt(0)}
                              </div>
                            ))}
                            {(session.participants?.length || 0) > 5 && (
                              <div className="w-6 h-6 rounded-full flex items-center justify-center bg-muted text-[10px] font-medium border-2 border-background">
                                +{(session.participants?.length || 0) - 5}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Outcomes */}
                        {session.outcomes && (
                          <div className="mt-3 pt-3 border-t flex items-center gap-4 text-xs">
                            {session.outcomes.decisions?.length > 0 && (
                              <span>
                                <strong>{session.outcomes.decisions.length}</strong> decisions
                              </span>
                            )}
                            {session.outcomes.actionItems?.length > 0 && (
                              <span>
                                <strong>{session.outcomes.actionItems.length}</strong> action items
                              </span>
                            )}
                            {session.outcomes.insights?.length > 0 && (
                              <span>
                                <strong>{session.outcomes.insights.length}</strong> insights
                              </span>
                            )}
                          </div>
                        )}
                      </motion.div>
                    ))
                  )}

                  {(!collaborations || collaborations.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No collaboration sessions found</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail Panel */}
        <div>
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                Message Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedMessage ? (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: selectedMessage.sender?.color || '#6366f1' }}
                    >
                      {selectedMessage.sender?.name?.charAt(0) || '?'}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: selectedMessage.receiver?.color || '#6b7280' }}
                    >
                      {selectedMessage.receiver?.name?.charAt(0) || '?'}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">From</span>
                      <span className="font-medium">{selectedMessage.sender?.name || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">To</span>
                      <span className="font-medium">{selectedMessage.receiver?.name || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Type</span>
                      <Badge variant="outline">{selectedMessage.messageType.replace(/_/g, ' ')}</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Priority</span>
                      {getPriorityBadge(selectedMessage.priority)}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Time</span>
                      <span>{format(new Date(selectedMessage.createdAt), 'MMM d, HH:mm')}</span>
                    </div>
                  </div>

                  {/* Goal */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-sm mb-2">Goal</h4>
                    <p className="text-sm">{selectedMessage.goal}</p>
                  </div>

                  {/* Content */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-sm mb-2">Summary</h4>
                    <p className="text-sm">{selectedMessage.content.summary}</p>
                    {selectedMessage.content.details && (
                      <div className="mt-2">
                        <h4 className="font-medium text-sm mb-1">Details</h4>
                        <p className="text-sm text-muted-foreground">{selectedMessage.content.details}</p>
                      </div>
                    )}
                  </div>

                  {/* Questions */}
                  {selectedMessage.content.questions && selectedMessage.content.questions.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium text-sm mb-2">Questions</h4>
                      <ul className="space-y-1">
                        {selectedMessage.content.questions.map((q, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <span className="text-primary">?</span>
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actions */}
                  {selectedMessage.content.actions && selectedMessage.content.actions.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium text-sm mb-2">Actions</h4>
                      <ul className="space-y-2">
                        {selectedMessage.content.actions.map((action, i) => (
                          <li key={i} className="text-sm p-2 rounded bg-muted/50">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  action.status === 'completed'
                                    ? 'secondary'
                                    : action.status === 'blocked'
                                      ? 'destructive'
                                      : 'outline'
                                }
                                className="text-xs"
                              >
                                {action.status || 'pending'}
                              </Badge>
                              <span className="font-medium">{action.action}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{action.reason}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Context */}
                  {selectedMessage.context && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium text-sm mb-2">Context</h4>
                      <div className="space-y-1 text-sm">
                        {selectedMessage.context.taskTitle && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Task</span>
                            <span>{selectedMessage.context.taskTitle}</span>
                          </div>
                        )}
                        {selectedMessage.context.situation && (
                          <div>
                            <span className="text-muted-foreground">Situation:</span>
                            <p className="mt-1">{selectedMessage.context.situation}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Thread info */}
                  {selectedMessage.threadId && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <GitBranch className="w-4 h-4" />
                        Part of a thread
                      </h4>
                      <p className="text-xs text-muted-foreground font-mono">{selectedMessage.threadId}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Eye className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Select a message to view details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Communication Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Communication Activity (7 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between h-32 gap-2">
            {(stats?.byDay || []).map((day, i) => {
              const maxCount = Math.max(...(stats?.byDay || []).map((d) => d.count), 1);
              const height = (day.count / maxCount) * 100;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ delay: i * 0.05 }}
                    className="w-full bg-primary rounded-t min-h-[2px] hover:bg-primary/80 cursor-pointer relative"
                    title={`${day.date}: ${day.count} messages`}
                  >
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover border rounded px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <p className="font-medium">{day.count} messages</p>
                    </div>
                  </motion.div>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(day.date), 'EEE')}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* By Agent */}
      <Card>
        <CardHeader>
          <CardTitle>Activity by Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(stats?.byAgent || []).slice(0, 6).map((agent, i) => (
              <motion.div
                key={agent.agentId}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="p-4 rounded-lg border"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/10 text-primary font-bold">
                    {agent.name.charAt(0)}
                  </div>
                  <span className="font-medium">{agent.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-green-500" />
                    <span>{agent.sent} sent</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Inbox className="w-4 h-4 text-blue-500" />
                    <span>{agent.received} received</span>
                  </div>
                </div>
              </motion.div>
            ))}

            {(!stats?.byAgent || stats.byAgent.length === 0) && (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No communication data available</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
