'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  useConflicts,
  useConflictStats,
  useConflictDetails,
  useConflictResolutionRules,
  useUpdateConflictStatus,
  useResolveConflict,
  useEscalateConflict,
  useAddConflictComment,
  useCreateDefaultRules,
  useUpdateConflictRule,
  type AgentConflict,
  type ConflictFilters,
} from '@/lib/api/hooks';
import {
  AlertTriangle,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Users,
  Settings,
  Plus,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Zap,
  GitMerge,
  Target,
  DollarSign,
  Calendar,
  Link2,
  Lock,
  X,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function ConflictsPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [activeTab, setActiveTab] = useState<'active' | 'resolved' | 'rules'>('active');
  const [filters, setFilters] = useState<ConflictFilters>({});
  const [selectedConflict, setSelectedConflict] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const limit = 20;

  // Data hooks
  const { data: conflictsData, isLoading: loadingConflicts, refetch } = useConflicts(
    companyId,
    activeTab === 'resolved' ? { status: 'resolved' } : { ...filters, status: filters.status || undefined },
    limit,
    page * limit
  );
  const { data: stats } = useConflictStats(companyId);
  const { data: conflictDetails, isLoading: loadingDetails } = useConflictDetails(selectedConflict || '');
  const { data: rules } = useConflictResolutionRules(companyId);

  // Mutations
  const updateStatus = useUpdateConflictStatus();
  const resolveConflict = useResolveConflict();
  const escalateConflict = useEscalateConflict();
  const addComment = useAddConflictComment();
  const createRules = useCreateDefaultRules();
  const updateRule = useUpdateConflictRule();

  const conflicts = conflictsData?.data || [];
  const totalConflicts = conflictsData?.total || 0;
  const totalPages = Math.ceil(totalConflicts / limit);

  const conflictTypes = ['resource', 'task', 'budget', 'priority', 'data', 'schedule', 'dependency', 'authority'];
  const severities = ['critical', 'high', 'medium', 'low'];
  const statuses = ['detected', 'acknowledged', 'investigating', 'escalated', 'awaiting_input'];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'resource':
        return <Link2 className="w-4 h-4" />;
      case 'task':
        return <Target className="w-4 h-4" />;
      case 'budget':
        return <DollarSign className="w-4 h-4" />;
      case 'priority':
        return <ArrowUpRight className="w-4 h-4" />;
      case 'data':
        return <GitMerge className="w-4 h-4" />;
      case 'schedule':
        return <Calendar className="w-4 h-4" />;
      case 'dependency':
        return <Link2 className="w-4 h-4" />;
      case 'authority':
        return <Lock className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-500">High</Badge>;
      case 'medium':
        return <Badge variant="secondary">Medium</Badge>;
      case 'low':
        return <Badge variant="outline">Low</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'detected':
        return <Badge variant="destructive">Detected</Badge>;
      case 'acknowledged':
        return <Badge variant="secondary">Acknowledged</Badge>;
      case 'investigating':
        return <Badge className="bg-blue-500">Investigating</Badge>;
      case 'escalated':
        return <Badge className="bg-orange-500">Escalated</Badge>;
      case 'awaiting_input':
        return <Badge className="bg-purple-500">Awaiting Input</Badge>;
      case 'resolved':
        return <Badge className="bg-green-500">Resolved</Badge>;
      case 'dismissed':
        return <Badge variant="outline">Dismissed</Badge>;
      case 'auto_resolved':
        return <Badge className="bg-green-500">Auto-Resolved</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleResolve = async (strategy: string, details: string, winner?: string) => {
    if (!selectedConflict) return;

    await resolveConflict.mutateAsync({
      conflictId: selectedConflict,
      strategy,
      resolution: { action: strategy, winner, details },
    });
    setShowResolveModal(false);
    refetch();
  };

  const handleEscalate = async (reason: string, escalateTo: 'ceo' | 'human') => {
    if (!selectedConflict) return;

    await escalateConflict.mutateAsync({
      conflictId: selectedConflict,
      reason,
      escalateTo,
    });
    setShowEscalateModal(false);
    refetch();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Conflict Resolution</h1>
          <p className="text-muted-foreground">Manage and resolve conflicts between agents</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-2xl font-bold">{stats?.activeCount || 0}</h3>
            <p className="text-sm text-muted-foreground">Active Conflicts</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-orange-500" />
            </div>
            <h3 className="text-2xl font-bold">{stats?.bySeverity?.critical || 0}</h3>
            <p className="text-sm text-muted-foreground">Critical</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <h3 className="text-2xl font-bold">{stats?.recentCount24h || 0}</h3>
            <p className="text-sm text-muted-foreground">Last 24h</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold">
              {stats?.avgResolutionMinutes ? `${Math.round(stats.avgResolutionMinutes)}m` : '-'}
            </h3>
            <p className="text-sm text-muted-foreground">Avg Resolution Time</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conflict List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-4">
              <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as typeof activeTab)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="active" className="gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Active
                    {stats?.activeCount ? (
                      <Badge variant="destructive" className="ml-1">{stats.activeCount}</Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="resolved" className="gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Resolved
                  </TabsTrigger>
                  <TabsTrigger value="rules" className="gap-2">
                    <Settings className="w-4 h-4" />
                    Rules
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>

            <CardContent>
              {activeTab !== 'rules' && (
                <>
                  {/* Filters */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Select
                      value={filters.severity || 'all'}
                      onValueChange={(v: string) => {
                        setFilters({ ...filters, severity: v === 'all' ? undefined : v });
                        setPage(0);
                      }}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Severity" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Severity</SelectItem>
                        {severities.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={filters.type || 'all'}
                      onValueChange={(v: string) => {
                        setFilters({ ...filters, type: v === 'all' ? undefined : v });
                        setPage(0);
                      }}
                    >
                      <SelectTrigger className="w-[130px]">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {conflictTypes.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {activeTab === 'active' && (
                      <Select
                        value={filters.status || 'all'}
                        onValueChange={(v: string) => {
                          setFilters({ ...filters, status: v === 'all' ? undefined : v });
                          setPage(0);
                        }}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          {statuses.map((s) => (
                            <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <Button variant="outline" size="icon" onClick={() => { setFilters({}); setPage(0); }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Conflict List */}
                  {loadingConflicts ? (
                    <div className="flex items-center justify-center h-48">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {conflicts.map((conflict) => (
                        <div
                          key={conflict.id}
                          className={cn(
                            'p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors',
                            selectedConflict === conflict.id && 'border-primary bg-muted/50'
                          )}
                          onClick={() => setSelectedConflict(conflict.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className={cn(
                                'p-2 rounded-lg',
                                conflict.severity === 'critical' ? 'bg-red-100 text-red-600' :
                                conflict.severity === 'high' ? 'bg-orange-100 text-orange-600' :
                                conflict.severity === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                                'bg-blue-100 text-blue-600'
                              )}>
                                {getTypeIcon(conflict.conflictType)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm truncate">{conflict.title}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-muted-foreground capitalize">
                                    {conflict.conflictType.replace(/_/g, ' ')}
                                  </span>
                                  <span className="text-xs text-muted-foreground">•</span>
                                  <div className="flex -space-x-1">
                                    {conflict.involvedAgents?.slice(0, 3).map((agent) => (
                                      <div
                                        key={agent.id}
                                        className="w-5 h-5 rounded-full border-2 border-background flex items-center justify-center text-[10px] text-white font-bold"
                                        style={{ backgroundColor: agent.color || '#6366f1' }}
                                        title={agent.name}
                                      >
                                        {agent.name?.charAt(0)}
                                      </div>
                                    ))}
                                    {(conflict.involvedAgents?.length || 0) > 3 && (
                                      <div className="w-5 h-5 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold">
                                        +{(conflict.involvedAgents?.length || 0) - 3}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <div className="flex items-center gap-1">
                                {getSeverityBadge(conflict.severity)}
                                {getStatusBadge(conflict.status)}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(conflict.detectedAt), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}

                      {conflicts.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          <Shield className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p>No conflicts found</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        Showing {page * limit + 1} - {Math.min((page + 1) * limit, totalConflicts)} of {totalConflicts}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm">Page {page + 1} of {totalPages}</span>
                        <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Rules Tab */}
              {activeTab === 'rules' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Configure automatic conflict resolution rules
                    </p>
                    {(!rules || rules.length === 0) && (
                      <Button onClick={() => createRules.mutate(companyId)} disabled={createRules.isPending}>
                        {createRules.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                        Create Default Rules
                      </Button>
                    )}
                  </div>

                  {rules && rules.length > 0 ? (
                    <div className="space-y-3">
                      {rules.map((rule) => (
                        <div key={rule.id} className="p-4 border rounded-lg">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium">{rule.name}</h4>
                              <p className="text-sm text-muted-foreground">{rule.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                                {rule.enabled ? 'Enabled' : 'Disabled'}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateRule.mutate({ ruleId: rule.id, data: { enabled: !rule.enabled } })}
                              >
                                <Settings className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm">
                            <span className="text-muted-foreground">Strategy:</span>
                            <Badge variant="outline">{rule.strategy.replace(/_/g, ' ')}</Badge>
                            <span className="text-muted-foreground">Priority:</span>
                            <span>{rule.priority}</span>
                            {rule.autoResolve && <Badge className="bg-green-500">Auto-Resolve</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Settings className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No resolution rules configured</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Conflict Detail Panel */}
        <div>
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-base">Conflict Details</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedConflict && conflictDetails ? (
                <div className="space-y-4">
                  {/* Header */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      {getTypeIcon(conflictDetails.conflictType)}
                      <span className="font-medium capitalize">{conflictDetails.conflictType}</span>
                    </div>
                    <h3 className="font-semibold">{conflictDetails.title}</h3>
                    {conflictDetails.description && (
                      <p className="text-sm text-muted-foreground mt-1">{conflictDetails.description}</p>
                    )}
                  </div>

                  {/* Status & Severity */}
                  <div className="flex flex-wrap gap-2">
                    {getSeverityBadge(conflictDetails.severity)}
                    {getStatusBadge(conflictDetails.status)}
                    {conflictDetails.escalationLevel > 0 && (
                      <Badge variant="outline">Level {conflictDetails.escalationLevel}</Badge>
                    )}
                  </div>

                  {/* Involved Agents */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Involved Agents</h4>
                    <div className="space-y-2">
                      {conflictDetails.involvedAgents?.map((agent) => (
                        <div key={agent.id} className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                            style={{ backgroundColor: agent.color || '#6366f1' }}
                          >
                            {agent.name?.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{agent.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{agent.role?.replace(/_/g, ' ')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  {conflictDetails.status !== 'resolved' && conflictDetails.status !== 'dismissed' && (
                    <div className="space-y-2 pt-4 border-t">
                      <Button
                        className="w-full"
                        onClick={() => setShowResolveModal(true)}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Resolve
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => setShowEscalateModal(true)}
                        >
                          <ArrowUpRight className="w-4 h-4 mr-2" />
                          Escalate
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => updateStatus.mutate({
                            conflictId: selectedConflict,
                            status: 'dismissed',
                            comment: 'Dismissed as non-issue',
                          })}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  {conflictDetails.events && conflictDetails.events.length > 0 && (
                    <div className="pt-4 border-t">
                      <h4 className="text-sm font-medium mb-2">Timeline</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {conflictDetails.events.slice(0, 10).map((event) => (
                          <div key={event.id} className="text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-primary" />
                              <span className="font-medium capitalize">
                                {event.eventType.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="text-muted-foreground text-xs ml-4">
                              {event.description}
                            </p>
                            <p className="text-muted-foreground text-xs ml-4">
                              {format(new Date(event.createdAt), 'MMM d, HH:mm')}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : loadingDetails ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Select a conflict to view details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Resolve Modal */}
      {showResolveModal && conflictDetails && (
        <ResolveModal
          conflict={conflictDetails}
          onClose={() => setShowResolveModal(false)}
          onResolve={handleResolve}
          isLoading={resolveConflict.isPending}
        />
      )}

      {/* Escalate Modal */}
      {showEscalateModal && conflictDetails && (
        <EscalateModal
          conflict={conflictDetails}
          onClose={() => setShowEscalateModal(false)}
          onEscalate={handleEscalate}
          isLoading={escalateConflict.isPending}
        />
      )}
    </div>
  );
}

// Resolve Modal Component
function ResolveModal({
  conflict,
  onClose,
  onResolve,
  isLoading,
}: {
  conflict: AgentConflict;
  onClose: () => void;
  onResolve: (strategy: string, details: string, winner?: string) => void;
  isLoading: boolean;
}) {
  const [strategy, setStrategy] = useState('human_decision');
  const [details, setDetails] = useState('');
  const [winner, setWinner] = useState<string | undefined>();

  const strategies = [
    { value: 'priority_based', label: 'Priority Based', desc: 'Higher priority agent wins' },
    { value: 'first_come', label: 'First Come', desc: 'First requester wins' },
    { value: 'quota_based', label: 'Quota Based', desc: 'Based on resource quotas' },
    { value: 'human_decision', label: 'Human Decision', desc: 'Manual resolution' },
    { value: 'merge', label: 'Merge', desc: 'Combine requests where possible' },
    { value: 'defer', label: 'Defer', desc: 'Postpone one request' },
    { value: 'cancel', label: 'Cancel', desc: 'Cancel conflicting requests' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Resolve Conflict</CardTitle>
          <CardDescription>{conflict.title}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Resolution Strategy</label>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {strategies.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <div>
                      <div className="font-medium">{s.label}</div>
                      <div className="text-xs text-muted-foreground">{s.desc}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(strategy === 'priority_based' || strategy === 'first_come' || strategy === 'human_decision') && (
            <div>
              <label className="text-sm font-medium">Winner (optional)</label>
              <Select value={winner || ''} onValueChange={setWinner}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select winner" />
                </SelectTrigger>
                <SelectContent>
                  {conflict.involvedAgents?.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Resolution Details</label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe how this conflict was resolved..."
              className="mt-1"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => onResolve(strategy, details, winner)}
              disabled={isLoading || !details.trim()}
            >
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Resolve
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Escalate Modal Component
function EscalateModal({
  conflict,
  onClose,
  onEscalate,
  isLoading,
}: {
  conflict: AgentConflict;
  onClose: () => void;
  onEscalate: (reason: string, escalateTo: 'ceo' | 'human') => void;
  isLoading: boolean;
}) {
  const [reason, setReason] = useState('');
  const [escalateTo, setEscalateTo] = useState<'ceo' | 'human'>('ceo');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Escalate Conflict</CardTitle>
          <CardDescription>
            Current level: {conflict.escalationLevel}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Escalate To</label>
            <Select value={escalateTo} onValueChange={(v: string) => setEscalateTo(v as 'ceo' | 'human')}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ceo">CEO Agent</SelectItem>
                <SelectItem value="human">Human Decision</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Reason for Escalation</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why does this conflict need to be escalated?"
              className="mt-1"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => onEscalate(reason, escalateTo)}
              disabled={isLoading || !reason.trim()}
            >
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowUpRight className="w-4 h-4 mr-2" />}
              Escalate
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
