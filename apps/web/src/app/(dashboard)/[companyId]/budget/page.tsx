'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  useBudgetHierarchy,
  useBudgetTrends,
  useBudgetBreakdown,
  useBudgetForecast,
  useUpdateDepartmentBudget,
  useUpdateAgentBudget,
  useUpdateCompanyBudget,
  useResetBudgets,
} from '@/lib/api/hooks';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Bot,
  Wallet,
  PieChart,
  BarChart3,
  RefreshCw,
  Edit2,
  Save,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Target,
  Calendar,
  Lightbulb,
} from 'lucide-react';

export default function BudgetPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [breakdownBy, setBreakdownBy] = useState<'agent' | 'department' | 'model'>('agent');
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [editingBudget, setEditingBudget] = useState<{
    type: 'company' | 'department' | 'agent';
    id: string;
    value: number;
  } | null>(null);

  const { data: hierarchy, isLoading: loadingHierarchy, refetch: refetchHierarchy } = useBudgetHierarchy(companyId);
  const { data: trends, isLoading: loadingTrends } = useBudgetTrends(companyId, period);
  const { data: breakdown, isLoading: loadingBreakdown } = useBudgetBreakdown(companyId, breakdownBy);
  const { data: forecast, isLoading: loadingForecast } = useBudgetForecast(companyId);

  const updateDeptBudget = useUpdateDepartmentBudget();
  const updateAgentBudget = useUpdateAgentBudget();
  const updateCompanyBudget = useUpdateCompanyBudget();
  const resetBudgets = useResetBudgets();

  const toggleDept = (deptId: string) => {
    const newExpanded = new Set(expandedDepts);
    if (newExpanded.has(deptId)) {
      newExpanded.delete(deptId);
    } else {
      newExpanded.add(deptId);
    }
    setExpandedDepts(newExpanded);
  };

  const handleSaveBudget = async () => {
    if (!editingBudget) return;

    try {
      if (editingBudget.type === 'company') {
        await updateCompanyBudget.mutateAsync({
          companyId: editingBudget.id,
          monthlyBudget: editingBudget.value,
        });
      } else if (editingBudget.type === 'department') {
        await updateDeptBudget.mutateAsync({
          departmentId: editingBudget.id,
          budgetAllocated: editingBudget.value,
        });
      } else {
        await updateAgentBudget.mutateAsync({
          agentId: editingBudget.id,
          budgetLimit: editingBudget.value,
        });
      }
      setEditingBudget(null);
      refetchHierarchy();
    } catch (error) {
      console.error('Failed to update budget:', error);
    }
  };

  const handleResetBudgets = async () => {
    if (confirm('Are you sure you want to reset all budget spent values to $0?')) {
      await resetBudgets.mutateAsync(companyId);
      refetchHierarchy();
    }
  };

  if (loadingHierarchy && loadingTrends && loadingForecast) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const maxTrendCost = Math.max(...(trends?.trends || []).map((t) => t.cost), 0.001);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Budget Dashboard</h1>
          <p className="text-muted-foreground">Manage budgets and track spending across your organization</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleResetBudgets} disabled={resetBudgets.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${resetBudgets.isPending ? 'animate-spin' : ''}`} />
            Reset Monthly
          </Button>
        </div>
      </div>

      {/* Budget Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Monthly Budget */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <Wallet className="w-5 h-5 text-primary" />
              {editingBudget?.type === 'company' && editingBudget.id === companyId ? (
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSaveBudget}>
                    <Save className="w-4 h-4 text-green-500" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingBudget(null)}>
                    <X className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() =>
                    setEditingBudget({
                      type: 'company',
                      id: companyId,
                      value: hierarchy?.company.monthlyBudget || 0,
                    })
                  }
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
              )}
            </div>
            {editingBudget?.type === 'company' && editingBudget.id === companyId ? (
              <Input
                type="number"
                value={editingBudget.value}
                onChange={(e) => setEditingBudget({ ...editingBudget, value: parseFloat(e.target.value) || 0 })}
                className="h-8 text-lg font-bold"
                autoFocus
              />
            ) : (
              <h3 className="text-2xl font-bold">${(hierarchy?.company.monthlyBudget || 0).toFixed(2)}</h3>
            )}
            <p className="text-sm text-muted-foreground">Monthly Budget</p>
          </CardContent>
        </Card>

        {/* Total Spent */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-5 h-5 text-orange-500" />
              <Badge variant={(hierarchy?.company.utilizationPercent ?? 0) > 80 ? 'destructive' : 'secondary'}>
                {(hierarchy?.company.utilizationPercent ?? 0).toFixed(0)}%
              </Badge>
            </div>
            <h3 className="text-2xl font-bold">${(hierarchy?.company.totalSpent || 0).toFixed(2)}</h3>
            <p className="text-sm text-muted-foreground">Total Spent</p>
            <Progress
              value={hierarchy?.company.utilizationPercent || 0}
              className="mt-2 h-1"
            />
          </CardContent>
        </Card>

        {/* Forecast */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <Target className="w-5 h-5 text-blue-500" />
              <Badge
                variant={
                  forecast?.budgetStatus === 'over_budget'
                    ? 'destructive'
                    : forecast?.budgetStatus === 'at_risk'
                      ? 'default'
                      : 'secondary'
                }
              >
                {forecast?.budgetStatus === 'over_budget'
                  ? 'Over Budget'
                  : forecast?.budgetStatus === 'at_risk'
                    ? 'At Risk'
                    : 'On Track'}
              </Badge>
            </div>
            <h3 className="text-2xl font-bold">${(forecast?.projectedMonthEnd || 0).toFixed(2)}</h3>
            <p className="text-sm text-muted-foreground">Projected Month End</p>
          </CardContent>
        </Card>

        {/* Trend */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              {trends?.summary.trendDirection === 'up' ? (
                <TrendingUp className="w-5 h-5 text-red-500" />
              ) : trends?.summary.trendDirection === 'down' ? (
                <TrendingDown className="w-5 h-5 text-green-500" />
              ) : (
                <BarChart3 className="w-5 h-5 text-gray-500" />
              )}
              <span
                className={`text-sm font-medium ${
                  trends?.summary.trendDirection === 'up'
                    ? 'text-red-500'
                    : trends?.summary.trendDirection === 'down'
                      ? 'text-green-500'
                      : ''
                }`}
              >
                {(trends?.summary.trendPercent ?? 0) > 0 ? '+' : ''}
                {(trends?.summary.trendPercent ?? 0).toFixed(1)}%
              </span>
            </div>
            <h3 className="text-2xl font-bold">${(trends?.summary.avgDailyCost || 0).toFixed(4)}</h3>
            <p className="text-sm text-muted-foreground">Avg Daily Cost</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Budget Hierarchy */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Budget Hierarchy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Company Level */}
              <div className="p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary" />
                    <span className="font-semibold">{hierarchy?.company.name}</span>
                  </div>
                  <span className="font-bold">${(hierarchy?.company.totalSpent || 0).toFixed(2)}</span>
                </div>
                <Progress value={hierarchy?.company.utilizationPercent || 0} className="h-2" />
              </div>

              {/* Departments */}
              {hierarchy?.departments.map((dept) => (
                <motion.div
                  key={dept.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border rounded-lg overflow-hidden"
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleDept(dept.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedDepts.has(dept.id) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: dept.color }}
                        />
                        <span className="font-medium">{dept.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {dept.agents.length} agents
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">
                          ${dept.budgetSpent.toFixed(2)} / ${dept.budgetAllocated.toFixed(2)}
                        </span>
                        {editingBudget?.type === 'department' && editingBudget.id === dept.id ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Input
                              type="number"
                              value={editingBudget.value}
                              onChange={(e) =>
                                setEditingBudget({ ...editingBudget, value: parseFloat(e.target.value) || 0 })
                              }
                              className="h-7 w-24"
                            />
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSaveBudget}>
                              <Save className="w-4 h-4 text-green-500" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => setEditingBudget(null)}
                            >
                              <X className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingBudget({
                                type: 'department',
                                id: dept.id,
                                value: dept.budgetAllocated,
                              });
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <Progress
                      value={dept.utilizationPercent}
                      className="mt-2 h-1"
                    />
                  </div>

                  {/* Agents */}
                  {expandedDepts.has(dept.id) && (
                    <div className="border-t bg-muted/20">
                      {dept.agents.map((agent) => (
                        <div
                          key={agent.id}
                          className="p-3 pl-12 border-b last:border-b-0 flex items-center justify-between hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                              style={{ backgroundColor: agent.color }}
                            >
                              {agent.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{agent.name}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {agent.role.replace(/_/g, ' ')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right text-sm">
                              <p className="font-medium">${agent.budgetSpent.toFixed(2)}</p>
                              <p className="text-xs text-muted-foreground">of ${agent.budgetLimit.toFixed(2)}</p>
                            </div>
                            <div className="w-16">
                              <Progress value={agent.utilizationPercent} className="h-1" />
                            </div>
                            {editingBudget?.type === 'agent' && editingBudget.id === agent.id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  value={editingBudget.value}
                                  onChange={(e) =>
                                    setEditingBudget({ ...editingBudget, value: parseFloat(e.target.value) || 0 })
                                  }
                                  className="h-7 w-20"
                                />
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSaveBudget}>
                                  <Save className="w-4 h-4 text-green-500" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => setEditingBudget(null)}
                                >
                                  <X className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() =>
                                  setEditingBudget({
                                    type: 'agent',
                                    id: agent.id,
                                    value: agent.budgetLimit,
                                  })
                                }
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      {dept.agents.length === 0 && (
                        <div className="p-4 pl-12 text-sm text-muted-foreground">No agents in this department</div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Unassigned Agents */}
              {hierarchy?.unassignedAgents && hierarchy.unassignedAgents.length > 0 && (
                <div className="border rounded-lg">
                  <div className="p-4 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      <span className="font-medium">Unassigned Agents</span>
                      <Badge variant="outline">{hierarchy.unassignedAgents.length}</Badge>
                    </div>
                  </div>
                  <div>
                    {hierarchy.unassignedAgents.map((agent) => (
                      <div
                        key={agent.id}
                        className="p-3 pl-8 border-t flex items-center justify-between hover:bg-muted/30"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                            style={{ backgroundColor: agent.color }}
                          >
                            {agent.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{agent.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{agent.role.replace(/_/g, ' ')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right text-sm">
                            <p className="font-medium">${agent.budgetSpent.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">of ${agent.budgetLimit.toFixed(2)}</p>
                          </div>
                          <div className="w-16">
                            <Progress value={agent.utilizationPercent} className="h-1" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Forecast & Recommendations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Forecast
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status */}
            <div
              className={`p-4 rounded-lg ${
                forecast?.budgetStatus === 'over_budget'
                  ? 'bg-red-500/10 border border-red-500/20'
                  : forecast?.budgetStatus === 'at_risk'
                    ? 'bg-orange-500/10 border border-orange-500/20'
                    : 'bg-green-500/10 border border-green-500/20'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {forecast?.budgetStatus === 'over_budget' ? (
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                ) : forecast?.budgetStatus === 'at_risk' ? (
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                )}
                <span
                  className={`font-medium ${
                    forecast?.budgetStatus === 'over_budget'
                      ? 'text-red-500'
                      : forecast?.budgetStatus === 'at_risk'
                        ? 'text-orange-500'
                        : 'text-green-500'
                  }`}
                >
                  {forecast?.budgetStatus === 'over_budget'
                    ? 'Projected to exceed budget'
                    : forecast?.budgetStatus === 'at_risk'
                      ? 'Approaching budget limit'
                      : 'Budget on track'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {forecast?.remainingDays} days remaining in month
              </p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-lg font-bold">${(forecast?.currentSpent || 0).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Current Spent</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-lg font-bold">${(forecast?.avgDailyCost || 0).toFixed(4)}</p>
                <p className="text-xs text-muted-foreground">Avg Daily</p>
              </div>
            </div>

            {/* Recommendations */}
            {forecast?.recommendations && forecast.recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-yellow-500" />
                  Recommendations
                </h4>
                {forecast.recommendations.map((rec, i) => (
                  <div key={i} className="text-sm p-2 rounded bg-muted/50 flex items-start gap-2">
                    <span className="text-primary">•</span>
                    {rec}
                  </div>
                ))}
              </div>
            )}

            {/* Mini Forecast Chart */}
            {forecast?.dailyForecast && forecast.dailyForecast.length > 0 && (
              <div className="pt-4 border-t">
                <h4 className="font-medium mb-3">Cumulative Projection</h4>
                <div className="h-24 flex items-end justify-between gap-1">
                  {forecast.dailyForecast.slice(0, 14).map((day, i) => {
                    const maxCumulative = forecast.dailyForecast[forecast.dailyForecast.length - 1]?.cumulative || 1;
                    const height = (day.cumulative / maxCumulative) * 100;
                    const isOverBudget = day.cumulative > (forecast.monthlyBudget || 0);
                    return (
                      <div
                        key={day.date}
                        className={`flex-1 rounded-t min-h-[2px] ${isOverBudget ? 'bg-red-500' : 'bg-primary'}`}
                        style={{ height: `${height}%` }}
                        title={`${day.date}: $${day.cumulative.toFixed(2)}`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Today</span>
                  <span>End of Month</span>
                </div>
                {/* Budget line indicator */}
                <div className="h-0.5 bg-dashed border-t-2 border-dashed border-primary/30 mt-2" />
                <p className="text-xs text-muted-foreground text-center">Budget: ${(forecast.monthlyBudget || 0).toFixed(2)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Spending Trends */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Spending Trends
          </CardTitle>
          <div className="flex bg-muted rounded-lg p-1">
            {(['7d', '30d', '90d', '1y'] as const).map((p) => (
              <Button
                key={p}
                variant={period === p ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriod(p)}
              >
                {p === '7d' ? '7D' : p === '30d' ? '30D' : p === '90d' ? '90D' : '1Y'}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loadingTrends ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="flex items-end justify-between h-48 gap-1">
              {(trends?.trends || []).slice(-30).map((data, i) => {
                const day = new Date(data.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                });
                const showLabel = i % 5 === 0 || i === (trends?.trends || []).length - 1;
                return (
                  <div key={data.date} className="flex-1 flex flex-col items-center gap-1 group">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${(data.cost / maxTrendCost) * 100}%` }}
                      transition={{ delay: i * 0.02 }}
                      className="w-full bg-primary rounded-t min-h-[2px] hover:bg-primary/80 cursor-pointer relative"
                      title={`${data.date}: $${data.cost.toFixed(4)}`}
                    >
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover border rounded px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <p className="font-medium">${data.cost.toFixed(4)}</p>
                        <p className="text-muted-foreground">{data.tokens.toLocaleString()} units</p>
                      </div>
                    </motion.div>
                    {showLabel && <span className="text-[10px] text-muted-foreground">{day}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Spending Breakdown */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <PieChart className="w-5 h-5 text-primary" />
            Spending Breakdown
          </CardTitle>
          <div className="flex bg-muted rounded-lg p-1">
            {(['agent', 'department', 'model'] as const).map((b) => (
              <Button
                key={b}
                variant={breakdownBy === b ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setBreakdownBy(b)}
              >
                {b === 'agent' ? 'By Agent' : b === 'department' ? 'By Department' : 'By Model'}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loadingBreakdown ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(breakdown?.breakdown || []).slice(0, 9).map((item, i) => {
                const maxCost = Math.max(...(breakdown?.breakdown || []).map((b) => b.cost), 1);
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: item.color || '#6366f1' }}
                      >
                        {item.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.name}</p>
                        {item.role && (
                          <p className="text-xs text-muted-foreground capitalize">{item.role.replace(/_/g, ' ')}</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Cost</span>
                        <span className="font-medium">${item.cost.toFixed(4)}</span>
                      </div>
                      <Progress value={(item.cost / maxCost) * 100} className="h-1" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{item.tokens.toLocaleString()} units</span>
                        <span>{item.count} actions</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {(!breakdown?.breakdown || breakdown.breakdown.length === 0) && (
                <div className="col-span-full text-center py-8 text-muted-foreground">
                  <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No spending data available</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
