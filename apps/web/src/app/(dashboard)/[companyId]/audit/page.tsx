'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAuditLogs,
  useAuditStats,
  useAuditFilters,
  useActionLogs,
  useActionStats,
  useActionFilters,
  type AuditLog,
  type ActionLog,
  type AuditFilters,
  type ActionFilters,
} from '@/lib/api/hooks';
import {
  Activity,
  Bot,
  Clock,
  FileText,
  Filter,
  Loader2,
  Search,
  User,
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Code,
  DollarSign,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Summarize data objects for non-technical display
function summarizeData(data: unknown): string {
  if (!data) return '';
  if (typeof data === 'string') return data.substring(0, 200);
  if (Array.isArray(data)) return `${data.length} item${data.length !== 1 ? 's' : ''}`;
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);
    const parts: string[] = [];
    for (const key of keys.slice(0, 5)) {
      const val = obj[key];
      if (typeof val === 'string') parts.push(`${key}: ${val.substring(0, 60)}`);
      else if (typeof val === 'number') parts.push(`${key}: ${val}`);
      else if (Array.isArray(val)) parts.push(`${key}: ${val.length} items`);
    }
    return parts.join(', ') || 'Data processed';
  }
  return String(data).substring(0, 200);
}

export default function AuditPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [activeTab, setActiveTab] = useState<'actions' | 'audit'>('actions');
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ActionLog | AuditLog | null>(null);
  const limit = 20;

  // Audit filters
  const [auditFiltersState, setAuditFiltersState] = useState<AuditFilters>({});
  const [actionFiltersState, setActionFiltersState] = useState<ActionFilters>({});

  // Data hooks
  const { data: auditLogs, isLoading: loadingAudit } = useAuditLogs(
    companyId,
    auditFiltersState,
    limit,
    page * limit
  );
  const { data: auditStats } = useAuditStats(companyId);
  const { data: auditFilterOptions } = useAuditFilters(companyId);

  const { data: actionLogs, isLoading: loadingActions } = useActionLogs(
    companyId,
    actionFiltersState,
    limit,
    page * limit
  );
  const { data: actionStats } = useActionStats(companyId);
  const { data: actionFilterOptions } = useActionFilters(companyId);

  const isLoading = activeTab === 'actions' ? loadingActions : loadingAudit;
  const totalItems = activeTab === 'actions' ? (actionLogs?.total || 0) : (auditLogs?.total || 0);
  const totalPages = Math.ceil(totalItems / limit);

  const resetPage = () => setPage(0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <Badge variant="secondary" className="bg-green-500/10 text-green-500">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Success
          </Badge>
        );
      case 'error':
      case 'failed':
        return (
          <Badge variant="secondary" className="bg-red-500/10 text-red-500">
            <XCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <AlertCircle className="w-3 h-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground">Track agent actions and system events</p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-2xl font-bold">{actionStats?.total || 0}</h3>
            <p className="text-sm text-muted-foreground">Actions (7d)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-orange-500" />
            </div>
            <h3 className="text-2xl font-bold">${(actionStats?.totalCost || 0).toFixed(4)}</h3>
            <p className="text-sm text-muted-foreground">Total Cost (7d)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-purple-500" />
            </div>
            <h3 className="text-2xl font-bold">{(actionStats?.totalTokens || 0).toLocaleString()}</h3>
            <p className="text-sm text-muted-foreground">AI Processing (7d)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold">{(actionStats?.successRate || 0).toFixed(1)}%</h3>
            <p className="text-sm text-muted-foreground">Success Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Logs List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-4">
              <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as 'actions' | 'audit'); resetPage(); }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="actions" className="gap-2">
                    <Bot className="w-4 h-4" />
                    Agent Actions
                  </TabsTrigger>
                  <TabsTrigger value="audit" className="gap-2">
                    <FileText className="w-4 h-4" />
                    Audit Trail
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>

            <CardContent>
              {/* Filters */}
              <div className="flex flex-wrap gap-2 mb-4">
                {activeTab === 'actions' ? (
                  <>
                    <Select
                      value={actionFiltersState.agentId || 'all'}
                      onValueChange={(v: string) => {
                        setActionFiltersState({ ...actionFiltersState, agentId: v === 'all' ? undefined : v });
                        resetPage();
                      }}
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Agent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Agents</SelectItem>
                        {actionFilterOptions?.agents.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={actionFiltersState.toolName || 'all'}
                      onValueChange={(v: string) => {
                        setActionFiltersState({ ...actionFiltersState, toolName: v === 'all' ? undefined : v });
                        resetPage();
                      }}
                    >
                      <SelectTrigger className="w-[130px]">
                        <SelectValue placeholder="Tool" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Tools</SelectItem>
                        {actionFilterOptions?.toolNames.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={actionFiltersState.status || 'all'}
                      onValueChange={(v: string) => {
                        setActionFiltersState({ ...actionFiltersState, status: v === 'all' ? undefined : v });
                        resetPage();
                      }}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        {actionFilterOptions?.statuses.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <>
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search..."
                        className="pl-8"
                        value={auditFiltersState.search || ''}
                        onChange={(e) => {
                          setAuditFiltersState({ ...auditFiltersState, search: e.target.value || undefined });
                          resetPage();
                        }}
                      />
                    </div>

                    <Select
                      value={auditFiltersState.actorType || 'all'}
                      onValueChange={(v: string) => {
                        setAuditFiltersState({ ...auditFiltersState, actorType: v === 'all' ? undefined : v });
                        resetPage();
                      }}
                    >
                      <SelectTrigger className="w-[130px]">
                        <SelectValue placeholder="Actor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Actors</SelectItem>
                        {auditFilterOptions?.actorTypes.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={auditFiltersState.resourceType || 'all'}
                      onValueChange={(v: string) => {
                        setAuditFiltersState({ ...auditFiltersState, resourceType: v === 'all' ? undefined : v });
                        resetPage();
                      }}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Resource" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Resources</SelectItem>
                        {auditFilterOptions?.resourceTypes.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (activeTab === 'actions') {
                      setActionFiltersState({});
                    } else {
                      setAuditFiltersState({});
                    }
                    resetPage();
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Log List */}
              {isLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-2">
                  {activeTab === 'actions' ? (
                    // Action Logs
                    (actionLogs?.data || []).map((log) => (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors ${
                          selectedLog?.id === log.id ? 'border-primary bg-muted/50' : ''
                        }`}
                        onClick={() => setSelectedLog(log)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                              style={{ backgroundColor: '#6366f1' }}
                            >
                              {log.agent?.name?.charAt(0) || 'A'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm truncate">
                                  {log.agent?.name || 'Unknown Agent'}
                                </span>
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {log.toolName}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {log.action}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {getStatusBadge(log.status)}
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                        {(log.cost || log.tokensUsed) && (
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            {log.cost && <span>${parseFloat(log.cost).toFixed(6)}</span>}
                            {log.tokensUsed && <span>{log.tokensUsed.toLocaleString()} tokens</span>}
                            {log.latencyMs && <span>{log.latencyMs > 1000 ? `${(log.latencyMs / 1000).toFixed(1)}s` : '<1s'}</span>}
                          </div>
                        )}
                      </motion.div>
                    ))
                  ) : (
                    // Audit Logs
                    (auditLogs?.data || []).map((log) => (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors ${
                          selectedLog?.id === log.id ? 'border-primary bg-muted/50' : ''
                        }`}
                        onClick={() => setSelectedLog(log)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-muted shrink-0">
                              {log.actorType === 'user' ? (
                                <User className="w-4 h-4" />
                              ) : log.actorType === 'agent' ? (
                                <Bot className="w-4 h-4" />
                              ) : (
                                <Activity className="w-4 h-4" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm truncate">
                                  {log.actorName || log.actorType}
                                </span>
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {log.action}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {log.description || `${log.action} on ${log.resourceType}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {getStatusBadge(log.status)}
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}

                  {/* Empty state */}
                  {((activeTab === 'actions' && !actionLogs?.data?.length) ||
                    (activeTab === 'audit' && !auditLogs?.data?.length)) && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No logs found</p>
                    </div>
                  )}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {page * limit + 1} - {Math.min((page + 1) * limit, totalItems)} of {totalItems}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
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
            </CardContent>
          </Card>
        </div>

        {/* Detail Panel */}
        <div>
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                Log Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedLog ? (
                <div className="space-y-4">
                  {/* Basic Info */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">ID</span>
                      <span className="font-mono text-xs truncate max-w-[150px]">{selectedLog.id}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Time</span>
                      <span>{new Date(selectedLog.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      {getStatusBadge('status' in selectedLog ? selectedLog.status : 'unknown')}
                    </div>
                  </div>

                  {/* Action-specific details */}
                  {'toolName' in selectedLog && (
                    <>
                      <div className="border-t pt-4 space-y-2">
                        <h4 className="font-medium text-sm">Action Details</h4>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Tool</span>
                          <Badge variant="outline">{selectedLog.toolName}</Badge>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Action</span>
                          <span>{selectedLog.action}</span>
                        </div>
                        {selectedLog.agent && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Agent</span>
                            <span>{selectedLog.agent.name}</span>
                          </div>
                        )}
                        {selectedLog.task && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Task</span>
                            <span className="truncate max-w-[150px]">{selectedLog.task.title}</span>
                          </div>
                        )}
                      </div>

                      {/* Cost/Performance */}
                      {(selectedLog.cost || selectedLog.tokensUsed) && (
                        <div className="border-t pt-4 space-y-2">
                          <h4 className="font-medium text-sm">Performance</h4>
                          {selectedLog.cost && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Cost</span>
                              <span className="font-medium">${parseFloat(selectedLog.cost).toFixed(6)}</span>
                            </div>
                          )}
                          {selectedLog.tokensUsed && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">AI Processing</span>
                              <span>{selectedLog.tokensUsed.toLocaleString()} units</span>
                            </div>
                          )}
                          {selectedLog.latencyMs && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Duration</span>
                              <span>{selectedLog.latencyMs > 1000 ? `${(selectedLog.latencyMs / 1000).toFixed(1)} seconds` : 'Less than 1 second'}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Summary */}
                      {(selectedLog.input || selectedLog.output) && (
                        <div className="border-t pt-4 space-y-2">
                          <h4 className="font-medium text-sm flex items-center gap-2">
                            <Code className="w-4 h-4" />
                            Details
                          </h4>
                          {selectedLog.input ? (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">What was requested</p>
                              <p className="text-xs bg-muted p-2 rounded max-h-24 overflow-y-auto">
                                {typeof selectedLog.input === 'string' ? selectedLog.input : summarizeData(selectedLog.input)}
                              </p>
                            </div>
                          ) : null}
                          {selectedLog.output ? (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Result</p>
                              <p className="text-xs bg-muted p-2 rounded max-h-24 overflow-y-auto">
                                {typeof selectedLog.output === 'string' ? selectedLog.output : summarizeData(selectedLog.output)}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      )}

                      {/* Error */}
                      {selectedLog.errorMessage && (
                        <div className="border-t pt-4 space-y-2">
                          <h4 className="font-medium text-sm text-red-500">Error</h4>
                          <p className="text-sm text-red-400">
                            {selectedLog.errorMessage?.includes('ECONNREFUSED') || selectedLog.errorMessage?.includes('timeout')
                              ? 'The service was temporarily unavailable. The system will retry automatically.'
                              : selectedLog.errorMessage?.includes('rate limit')
                                ? 'Too many requests. The system will slow down and retry.'
                                : selectedLog.errorMessage || 'An error occurred during this action.'}
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Audit-specific details */}
                  {'actorType' in selectedLog && !('toolName' in selectedLog) && (
                    <>
                      <div className="border-t pt-4 space-y-2">
                        <h4 className="font-medium text-sm">Actor</h4>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Type</span>
                          <Badge variant="outline">{selectedLog.actorType}</Badge>
                        </div>
                        {selectedLog.actorName && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Name</span>
                            <span>{selectedLog.actorName}</span>
                          </div>
                        )}
                      </div>

                      <div className="border-t pt-4 space-y-2">
                        <h4 className="font-medium text-sm">Resource</h4>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Type</span>
                          <span>{selectedLog.resourceType}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Action</span>
                          <Badge variant="outline">{selectedLog.action}</Badge>
                        </div>
                      </div>

                      {selectedLog.description && (
                        <div className="border-t pt-4">
                          <h4 className="font-medium text-sm mb-2">Description</h4>
                          <p className="text-sm">{selectedLog.description}</p>
                        </div>
                      )}

                      {selectedLog.changes && (
                        <div className="border-t pt-4 space-y-2">
                          <h4 className="font-medium text-sm">Changes</h4>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48">
                            {JSON.stringify(selectedLog.changes, null, 2)}
                          </pre>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Eye className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Select a log to view details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Activity Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Over Time (7 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between h-32 gap-1">
            {(actionStats?.byDay || []).map((day, i) => {
              const maxCount = Math.max(...(actionStats?.byDay || []).map((d) => d.count), 1);
              const height = (day.count / maxCount) * 100;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ delay: i * 0.05 }}
                    className="w-full bg-primary rounded-t min-h-[2px] hover:bg-primary/80 cursor-pointer relative"
                    title={`${day.date}: ${day.count} actions, $${day.cost.toFixed(4)}`}
                  >
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover border rounded px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <p className="font-medium">{day.count} actions</p>
                      <p className="text-muted-foreground">${day.cost.toFixed(4)}</p>
                    </div>
                  </motion.div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Breakdown by Tool */}
      <Card>
        <CardHeader>
          <CardTitle>Usage by Tool</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(actionStats?.byTool || []).slice(0, 8).map((tool, i) => (
              <motion.div
                key={tool.tool}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="p-4 rounded-lg border"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm truncate">{tool.tool}</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Calls</span>
                    <span className="font-medium">{tool.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cost</span>
                    <span>${tool.cost.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tokens</span>
                    <span>{tool.tokens.toLocaleString()}</span>
                  </div>
                </div>
              </motion.div>
            ))}

            {(!actionStats?.byTool || actionStats.byTool.length === 0) && (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No tool usage data available</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
