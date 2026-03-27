'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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
  useSimulations,
  useSimulationDetails,
  useSimulationTemplates,
  useCreateSimulation,
  useCreateSimulationFromTemplate,
  useStartSimulation,
  usePauseSimulation,
  useCancelSimulation,
  useCreateDefaultTemplates,
  type Simulation,
  type SimulationTemplate,
  type SimulationSnapshot,
} from '@/lib/api/hooks';
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  TrendingUp,
  AlertTriangle,
  Target,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3,
  LineChart,
  Activity,
  Settings,
  Calendar,
  FileText,
  Lightbulb,
  X,
} from 'lucide-react';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

export default function SimulationPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [activeTab, setActiveTab] = useState<'simulations' | 'templates' | 'create'>('simulations');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [selectedSimulation, setSelectedSimulation] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SimulationTemplate | null>(null);
  const [page, setPage] = useState(0);
  const limit = 10;

  // Data hooks
  const { data: simulationsData, isLoading: loadingSimulations, refetch } = useSimulations(
    companyId,
    statusFilter,
    limit,
    page * limit
  );
  const { data: templates, isLoading: loadingTemplates, refetch: refetchTemplates } = useSimulationTemplates(companyId);
  const { data: simulationDetails, isLoading: loadingDetails } = useSimulationDetails(selectedSimulation || '');

  // Mutations
  const createSimulation = useCreateSimulation();
  const createFromTemplate = useCreateSimulationFromTemplate();
  const startSimulation = useStartSimulation();
  const pauseSimulation = usePauseSimulation();
  const cancelSimulation = useCancelSimulation();
  const createDefaults = useCreateDefaultTemplates();

  const simulations = simulationsData?.data || [];
  const totalSimulations = simulationsData?.total || 0;
  const totalPages = Math.ceil(totalSimulations / limit);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'scenario':
        return <FlaskConical className="w-4 h-4" />;
      case 'stress_test':
        return <Zap className="w-4 h-4" />;
      case 'forecast':
        return <TrendingUp className="w-4 h-4" />;
      case 'optimization':
        return <Target className="w-4 h-4" />;
      case 'training':
        return <Activity className="w-4 h-4" />;
      default:
        return <FlaskConical className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      case 'running':
        return <Badge className="bg-blue-500">Running</Badge>;
      case 'paused':
        return <Badge variant="secondary">Paused</Badge>;
      case 'completed':
        return <Badge className="bg-green-500">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleStart = async (id: string) => {
    await startSimulation.mutateAsync(id);
    refetch();
  };

  const handlePause = async (id: string) => {
    await pauseSimulation.mutateAsync(id);
    refetch();
  };

  const handleCancel = async (id: string) => {
    await cancelSimulation.mutateAsync(id);
    refetch();
  };

  const handleCreateFromTemplate = async (template: SimulationTemplate, name: string, description?: string) => {
    await createFromTemplate.mutateAsync({
      templateId: template.id,
      companyId,
      name,
      description,
    });
    setShowCreateModal(false);
    setSelectedTemplate(null);
    setActiveTab('simulations');
    refetch();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Simulation Engine</h1>
          <p className="text-muted-foreground">Run simulations to test scenarios and optimize your company</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Simulation
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-5 h-5 text-blue-500" />
            </div>
            <h3 className="text-2xl font-bold">
              {simulations.filter((s) => s.status === 'running').length}
            </h3>
            <p className="text-sm text-muted-foreground">Running</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold">
              {simulations.filter((s) => s.status === 'completed').length}
            </h3>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-2xl font-bold">
              {simulations.filter((s) => s.status === 'failed').length}
            </h3>
            <p className="text-sm text-muted-foreground">Failed</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-purple-500" />
            </div>
            <h3 className="text-2xl font-bold">{templates?.length || 0}</h3>
            <p className="text-sm text-muted-foreground">Templates</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="simulations" className="gap-2">
            <FlaskConical className="w-4 h-4" />
            Simulations
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="w-4 h-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="create" className="gap-2">
            <Plus className="w-4 h-4" />
            Create
          </TabsTrigger>
        </TabsList>

        {/* Simulations Tab */}
        <TabsContent value="simulations" className="space-y-4 mt-6">
          {/* Filters */}
          <div className="flex gap-2">
            <Select value={statusFilter || 'all'} onValueChange={(v: string) => {
              setStatusFilter(v === 'all' ? undefined : v);
              setPage(0);
            }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Simulation List */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {loadingSimulations ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : simulations.length > 0 ? (
                <>
                  {simulations.map((sim) => (
                    <Card
                      key={sim.id}
                      className={cn(
                        'cursor-pointer hover:border-primary transition-colors',
                        selectedSimulation === sim.id && 'border-primary'
                      )}
                      onClick={() => setSelectedSimulation(sim.id)}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              'p-2 rounded-lg',
                              sim.type === 'scenario' ? 'bg-blue-100 text-blue-600' :
                              sim.type === 'stress_test' ? 'bg-red-100 text-red-600' :
                              sim.type === 'forecast' ? 'bg-green-100 text-green-600' :
                              sim.type === 'optimization' ? 'bg-purple-100 text-purple-600' :
                              'bg-orange-100 text-orange-600'
                            )}>
                              {getTypeIcon(sim.type)}
                            </div>
                            <div>
                              <h3 className="font-semibold">{sim.name}</h3>
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {sim.description || `${sim.type.replace(/_/g, ' ')} simulation`}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-muted-foreground capitalize">
                                  {sim.type.replace(/_/g, ' ')}
                                </span>
                                <span className="text-xs text-muted-foreground">•</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(sim.createdAt), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {getStatusBadge(sim.status)}
                            {sim.status === 'running' && (
                              <div className="flex items-center gap-2 w-32">
                                <Progress value={sim.progress} className="h-2" />
                                <span className="text-xs text-muted-foreground">{sim.progress}%</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 mt-4 pt-4 border-t">
                          {sim.status === 'draft' && (
                            <Button
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleStart(sim.id); }}
                              disabled={startSimulation.isPending}
                            >
                              {startSimulation.isPending ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <Play className="w-4 h-4 mr-1" />
                              )}
                              Start
                            </Button>
                          )}
                          {sim.status === 'running' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => { e.stopPropagation(); handlePause(sim.id); }}
                                disabled={pauseSimulation.isPending}
                              >
                                {pauseSimulation.isPending ? (
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                ) : (
                                  <Pause className="w-4 h-4 mr-1" />
                                )}
                                Pause
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => { e.stopPropagation(); handleCancel(sim.id); }}
                                disabled={cancelSimulation.isPending}
                              >
                                <Square className="w-4 h-4 mr-1" />
                                Cancel
                              </Button>
                            </>
                          )}
                          {sim.status === 'paused' && (
                            <Button
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleStart(sim.id); }}
                              disabled={startSimulation.isPending}
                            >
                              <Play className="w-4 h-4 mr-1" />
                              Resume
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Showing {page * limit + 1} - {Math.min((page + 1) * limit, totalSimulations)} of {totalSimulations}
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
              ) : (
                <Card>
                  <CardContent className="py-12">
                    <div className="text-center text-muted-foreground">
                      <FlaskConical className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No simulations found</p>
                      <Button variant="outline" className="mt-4" onClick={() => setShowCreateModal(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Simulation
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Details Panel */}
            <div>
              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle className="text-base">Simulation Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedSimulation && simulationDetails ? (
                    <SimulationDetailsPanel simulation={simulationDetails} loading={loadingDetails} />
                  ) : loadingDetails ? (
                    <div className="flex items-center justify-center h-48">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FlaskConical className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Select a simulation to view details</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Pre-configured simulation templates for common scenarios
            </p>
            {(!templates || templates.length === 0) && (
              <Button
                onClick={() => createDefaults.mutate()}
                disabled={createDefaults.isPending}
              >
                {createDefaults.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Create Default Templates
              </Button>
            )}
          </div>

          {loadingTemplates ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card key={template.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          'p-2 rounded-lg',
                          template.type === 'scenario' ? 'bg-blue-100 text-blue-600' :
                          template.type === 'stress_test' ? 'bg-red-100 text-red-600' :
                          template.type === 'forecast' ? 'bg-green-100 text-green-600' :
                          template.type === 'optimization' ? 'bg-purple-100 text-purple-600' :
                          'bg-orange-100 text-orange-600'
                        )}>
                          {getTypeIcon(template.type)}
                        </div>
                        <div>
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          <p className="text-xs text-muted-foreground capitalize">
                            {template.type.replace(/_/g, ' ')}
                          </p>
                        </div>
                      </div>
                      {template.isSystem && (
                        <Badge variant="secondary">System</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {template.description || 'No description'}
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span>{template.usageCount} uses</span>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-2 border-t">
                    <Button
                      className="w-full"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setShowCreateModal(true);
                      }}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Use Template
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No templates available</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Create Tab */}
        <TabsContent value="create" className="space-y-4 mt-6">
          <CreateSimulationForm
            companyId={companyId}
            templates={templates || []}
            onSuccess={() => {
              setActiveTab('simulations');
              refetch();
            }}
            isLoading={createSimulation.isPending}
            onSubmit={(data) => createSimulation.mutateAsync({ companyId, data })}
          />
        </TabsContent>
      </Tabs>

      {/* Create from Template Modal */}
      {showCreateModal && selectedTemplate && (
        <CreateFromTemplateModal
          template={selectedTemplate}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedTemplate(null);
          }}
          onCreate={handleCreateFromTemplate}
          isLoading={createFromTemplate.isPending}
        />
      )}

      {/* Quick Create Modal (no template) */}
      {showCreateModal && !selectedTemplate && (
        <QuickCreateModal
          templates={templates || []}
          onSelectTemplate={(template) => setSelectedTemplate(template)}
          onClose={() => setShowCreateModal(false)}
          onCreateCustom={() => {
            setShowCreateModal(false);
            setActiveTab('create');
          }}
        />
      )}
    </div>
  );
}

// Simulation Details Panel
function SimulationDetailsPanel({
  simulation,
  loading,
}: {
  simulation: Simulation & { snapshots?: SimulationSnapshot[] };
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-semibold">{simulation.name}</h3>
        {simulation.description && (
          <p className="text-sm text-muted-foreground mt-1">{simulation.description}</p>
        )}
      </div>

      {/* Progress */}
      {simulation.status === 'running' && (
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Progress</span>
            <span>{simulation.progress}%</span>
          </div>
          <Progress value={simulation.progress} />
          {simulation.currentStep && (
            <p className="text-xs text-muted-foreground mt-1">{simulation.currentStep}</p>
          )}
        </div>
      )}

      {/* Config Summary */}
      <div>
        <h4 className="text-sm font-medium mb-2">Configuration</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type</span>
            <span className="capitalize">{simulation.type.replace(/_/g, ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Scenario</span>
            <span className="capitalize">{simulation.config.scenario?.type?.replace(/_/g, ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Speed</span>
            <span>{simulation.config.timeframe?.speedMultiplier}x</span>
          </div>
        </div>
      </div>

      {/* Results */}
      {simulation.results && (
        <div>
          <h4 className="text-sm font-medium mb-2">Results</h4>
          {simulation.results.summary && (
            <p className="text-sm text-muted-foreground">{simulation.results.summary}</p>
          )}

          {simulation.results.metrics && Object.keys(simulation.results.metrics).length > 0 && (
            <div className="mt-2 space-y-1">
              {Object.entries(simulation.results.metrics).slice(0, 5).map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                  <span>{typeof value === 'number' ? value.toLocaleString() : value}</span>
                </div>
              ))}
            </div>
          )}

          {simulation.results.insights && simulation.results.insights.length > 0 && (
            <div className="mt-3">
              <h5 className="text-xs font-medium mb-1">Insights</h5>
              <ul className="space-y-1">
                {simulation.results.insights.slice(0, 3).map((insight, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex gap-2">
                    <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {simulation.results.recommendations && simulation.results.recommendations.length > 0 && (
            <div className="mt-3">
              <h5 className="text-xs font-medium mb-1">Recommendations</h5>
              <ul className="space-y-1">
                {simulation.results.recommendations.slice(0, 3).map((rec, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex gap-2">
                    <Target className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Snapshots Timeline */}
      {simulation.snapshots && simulation.snapshots.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Timeline ({simulation.snapshots.length} snapshots)</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {simulation.snapshots.slice(-5).map((snapshot) => (
              <div key={snapshot.id} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-muted-foreground">
                  {format(new Date(snapshot.simulationTime), 'MMM d, HH:mm')}
                </span>
                {snapshot.events && snapshot.events[0] && (
                  <span className="truncate">{snapshot.events[0].description}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {simulation.errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-600 text-sm font-medium mb-1">
            <AlertTriangle className="w-4 h-4" />
            Error
          </div>
          <p className="text-sm text-red-600">{simulation.errorMessage}</p>
        </div>
      )}

      {/* Timestamps */}
      <div className="pt-4 border-t space-y-1 text-xs text-muted-foreground">
        <p>Created: {format(new Date(simulation.createdAt), 'MMM d, yyyy HH:mm')}</p>
        {simulation.startedAt && <p>Started: {format(new Date(simulation.startedAt), 'MMM d, yyyy HH:mm')}</p>}
        {simulation.completedAt && <p>Completed: {format(new Date(simulation.completedAt), 'MMM d, yyyy HH:mm')}</p>}
      </div>
    </div>
  );
}

// Quick Create Modal
function QuickCreateModal({
  templates,
  onSelectTemplate,
  onClose,
  onCreateCustom,
}: {
  templates: SimulationTemplate[];
  onSelectTemplate: (template: SimulationTemplate) => void;
  onClose: () => void;
  onCreateCustom: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-lg mx-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>New Simulation</CardTitle>
              <CardDescription>Choose a template or create custom</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {templates.length > 0 && (
            <>
              <h4 className="text-sm font-medium">From Template</h4>
              <div className="grid grid-cols-1 gap-2">
                {templates.slice(0, 4).map((template) => (
                  <Button
                    key={template.id}
                    variant="outline"
                    className="justify-start h-auto py-3"
                    onClick={() => onSelectTemplate(template)}
                  >
                    <div className="flex items-center gap-3">
                      <FlaskConical className="w-5 h-5" />
                      <div className="text-left">
                        <p className="font-medium">{template.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {template.type.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>
            </>
          )}
          <Button className="w-full" onClick={onCreateCustom}>
            <Settings className="w-4 h-4 mr-2" />
            Create Custom Simulation
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// Create from Template Modal
function CreateFromTemplateModal({
  template,
  onClose,
  onCreate,
  isLoading,
}: {
  template: SimulationTemplate;
  onClose: () => void;
  onCreate: (template: SimulationTemplate, name: string, description?: string) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState(`${template.name} - ${format(new Date(), 'MMM d')}`);
  const [description, setDescription] = useState(template.description || '');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Create from Template</CardTitle>
          <CardDescription>Based on: {template.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Simulation Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter simulation name"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this simulation run..."
              rows={3}
            />
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={() => onCreate(template, name, description)}
            disabled={isLoading || !name.trim()}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Create
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// Create Simulation Form
function CreateSimulationForm({
  companyId,
  templates,
  onSuccess,
  onSubmit,
  isLoading,
}: {
  companyId: string;
  templates: SimulationTemplate[];
  onSuccess: () => void;
  onSubmit: (data: Partial<Simulation>) => Promise<unknown>;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'scenario' as Simulation['type'],
    scenarioType: 'growth',
    duration: '30d',
    speedMultiplier: 100,
    growthRate: 0.1,
    newTasksPerDay: 50,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      name: formData.name,
      description: formData.description,
      type: formData.type,
      config: {
        timeframe: {
          duration: formData.duration,
          speedMultiplier: formData.speedMultiplier,
        },
        scenario: {
          type: formData.scenarioType,
          parameters: {
            growthRate: formData.growthRate,
            newTasksPerDay: formData.newTasksPerDay,
          },
        },
        agentConfig: {
          includeAgents: 'all',
        },
      },
    });
    onSuccess();
  };

  const types = [
    { value: 'scenario', label: 'Scenario', desc: 'Test what-if scenarios' },
    { value: 'stress_test', label: 'Stress Test', desc: 'Test under high load' },
    { value: 'forecast', label: 'Forecast', desc: 'Project future outcomes' },
    { value: 'optimization', label: 'Optimization', desc: 'Find optimal configurations' },
    { value: 'training', label: 'Training', desc: 'Train agents on scenarios' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Custom Simulation</CardTitle>
        <CardDescription>Configure a new simulation from scratch</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Simulation"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select
                value={formData.type}
                onValueChange={(v: string) => setFormData({ ...formData, type: v as Simulation['type'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div>
                        <div className="font-medium">{type.label}</div>
                        <div className="text-xs text-muted-foreground">{type.desc}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what you want to simulate..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Duration</label>
              <Select
                value={formData.duration}
                onValueChange={(v: string) => setFormData({ ...formData, duration: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 Days</SelectItem>
                  <SelectItem value="30d">30 Days</SelectItem>
                  <SelectItem value="90d">90 Days</SelectItem>
                  <SelectItem value="180d">6 Months</SelectItem>
                  <SelectItem value="365d">1 Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Speed Multiplier</label>
              <Select
                value={String(formData.speedMultiplier)}
                onValueChange={(v: string) => setFormData({ ...formData, speedMultiplier: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1x (Real-time)</SelectItem>
                  <SelectItem value="10">10x</SelectItem>
                  <SelectItem value="100">100x</SelectItem>
                  <SelectItem value="1000">1000x</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Scenario Type</label>
              <Select
                value={formData.scenarioType}
                onValueChange={(v: string) => setFormData({ ...formData, scenarioType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="growth">Growth</SelectItem>
                  <SelectItem value="high_load">High Load</SelectItem>
                  <SelectItem value="budget_optimization">Budget Optimization</SelectItem>
                  <SelectItem value="market_expansion">Market Expansion</SelectItem>
                  <SelectItem value="cost_reduction">Cost Reduction</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Growth Rate</label>
              <Input
                type="number"
                step="0.01"
                value={formData.growthRate}
                onChange={(e) => setFormData({ ...formData, growthRate: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground mt-1">Monthly growth percentage (0.1 = 10%)</p>
            </div>
            <div>
              <label className="text-sm font-medium">Tasks Per Day</label>
              <Input
                type="number"
                value={formData.newTasksPerDay}
                onChange={(e) => setFormData({ ...formData, newTasksPerDay: parseInt(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground mt-1">Simulated new tasks created daily</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-4">
          <Button type="submit" className="w-full" disabled={isLoading || !formData.name}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FlaskConical className="w-4 h-4 mr-2" />
            )}
            Create Simulation
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
