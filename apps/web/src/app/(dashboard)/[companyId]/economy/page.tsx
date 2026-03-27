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
import {
  useAgentCredits,
  useEconomyOverview,
  useAgentTransactions,
  useUpdateAgentLimits,
  useResetMonthlyCredits,
  type AgentCredits,
  type CreditTransaction,
} from '@/lib/api/hooks';
import {
  Coins,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Settings,
  Users,
  Zap,
  DollarSign,
  BarChart3,
  PieChart,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function EconomyPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'transactions'>('overview');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<AgentCredits>>({});

  // Data hooks
  const { data: overview, isLoading: loadingOverview, refetch: refetchOverview } = useEconomyOverview(companyId);
  const { data: agentCredits, isLoading: loadingCredits, refetch: refetchCredits } = useAgentCredits(companyId);
  const { data: transactions, isLoading: loadingTransactions } = useAgentTransactions(selectedAgent || '');

  // Mutations
  const updateLimits = useUpdateAgentLimits();
  const resetCredits = useResetMonthlyCredits();

  const handleRefresh = () => {
    refetchOverview();
    refetchCredits();
  };

  const handleSaveLimits = async (agentId: string) => {
    await updateLimits.mutateAsync({ agentId, limits: editValues });
    setEditingAgent(null);
    setEditValues({});
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'consumption':
        return <ArrowDownRight className="w-4 h-4 text-red-500" />;
      case 'allocation':
        return <ArrowUpRight className="w-4 h-4 text-green-500" />;
      case 'transfer_in':
        return <ArrowUpRight className="w-4 h-4 text-blue-500" />;
      case 'transfer_out':
        return <ArrowDownRight className="w-4 h-4 text-orange-500" />;
      case 'reward':
        return <Coins className="w-4 h-4 text-yellow-500" />;
      case 'penalty':
        return <ArrowDownRight className="w-4 h-4 text-red-500" />;
      default:
        return <DollarSign className="w-4 h-4" />;
    }
  };

  const getResourceLabel = (type: string) => {
    switch (type) {
      case 'api_calls':
        return 'Agent Actions';
      case 'tokens':
        return 'AI Usage';
      case 'tools':
        return 'Tools';
      case 'external_api':
        return 'External Services';
      case 'budget':
        return 'Budget';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agent Economy</h1>
          <p className="text-muted-foreground">Manage agent credits, budgets, and resource allocation</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => resetCredits.mutate(companyId)}
            disabled={resetCredits.isPending}
          >
            {resetCredits.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Reset Monthly
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      {loadingOverview ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : overview && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-5 h-5 text-green-500" />
              </div>
              <h3 className="text-2xl font-bold">${overview.totals.totalBudget.toLocaleString()}</h3>
              <p className="text-sm text-muted-foreground">Total Budget</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-2xl font-bold">${overview.totals.totalSpent.toLocaleString()}</h3>
              <p className="text-sm text-muted-foreground">Total Spent</p>
              <Progress value={overview.utilizationPercent} className="mt-2 h-1" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-blue-500" />
              </div>
              <h3 className="text-2xl font-bold">{overview.totals.totalApiCalls.toLocaleString()}</h3>
              <p className="text-sm text-muted-foreground">Agent Actions</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-5 h-5 text-purple-500" />
              </div>
              <h3 className="text-2xl font-bold">{(overview.totals.totalTokens / 1000000).toFixed(2)}M</h3>
              <p className="text-sm text-muted-foreground">Tokens Used</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-orange-500" />
              </div>
              <h3 className="text-2xl font-bold">{overview.agentCount}</h3>
              <p className="text-sm text-muted-foreground">Active Agents</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="overview" className="gap-2">
            <PieChart className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-2">
            <Users className="w-4 h-4" />
            Agents
          </TabsTrigger>
          <TabsTrigger value="transactions" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Transactions
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Spenders */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Spenders</CardTitle>
                <CardDescription>Agents with highest budget usage</CardDescription>
              </CardHeader>
              <CardContent>
                {overview?.topSpenders && overview.topSpenders.length > 0 ? (
                  <div className="space-y-4">
                    {overview.topSpenders.map((agent, idx) => (
                      <div key={agent.agentId} className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                          style={{ backgroundColor: agent.agentColor || '#6366f1' }}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{agent.agentName}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>${agent.budgetSpent.toFixed(2)}</span>
                            <span>/</span>
                            <span>${agent.budgetAllocation.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="w-20">
                          <Progress
                            value={agent.budgetAllocation > 0 ? (agent.budgetSpent / agent.budgetAllocation) * 100 : 0}
                            className="h-2"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No spending data yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Transactions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Transactions</CardTitle>
                <CardDescription>Latest credit movements</CardDescription>
              </CardHeader>
              <CardContent>
                {overview?.recentTransactions && overview.recentTransactions.length > 0 ? (
                  <div className="space-y-3">
                    {overview.recentTransactions.slice(0, 8).map((tx) => (
                      <div key={tx.id} className="flex items-center gap-3 text-sm">
                        {getTransactionIcon(tx.transactionType)}
                        <div className="flex-1 min-w-0">
                          <p className="truncate">{tx.description || tx.transactionType}</p>
                          <p className="text-xs text-muted-foreground">
                            {getResourceLabel(tx.resourceType)} • {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        <span className={cn(
                          'font-medium',
                          tx.amount >= 0 ? 'text-green-600' : 'text-red-600'
                        )}>
                          {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Coins className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No transactions yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-4 mt-6">
          {loadingCredits ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : agentCredits && agentCredits.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {agentCredits.map((agent) => (
                <Card key={agent.id} className={cn(
                  'transition-all',
                  selectedAgent === agent.agentId && 'ring-2 ring-primary'
                )}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                          style={{ backgroundColor: agent.agent?.color || '#6366f1' }}
                        >
                          {agent.agent?.name?.charAt(0) || 'A'}
                        </div>
                        <div>
                          <CardTitle className="text-base">{agent.agent?.name || 'Unknown Agent'}</CardTitle>
                          <p className="text-sm text-muted-foreground capitalize">
                            {agent.agent?.role?.replace(/_/g, ' ') || 'Agent'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {agent.performanceMultiplier !== 1 && (
                          <Badge variant={agent.performanceMultiplier > 1 ? 'default' : 'secondary'}>
                            {agent.performanceMultiplier}x
                          </Badge>
                        )}
                        {editingAgent === agent.agentId ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleSaveLimits(agent.agentId)}
                              disabled={updateLimits.isPending}
                            >
                              {updateLimits.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4 text-green-500" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => { setEditingAgent(null); setEditValues({}); }}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingAgent(agent.agentId);
                              setEditValues({
                                monthlyApiCallsLimit: agent.monthlyApiCallsLimit,
                                monthlyTokensLimit: agent.monthlyTokensLimit,
                                budgetAllocation: agent.budgetAllocation,
                              });
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Budget */}
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Budget</span>
                          {editingAgent === agent.agentId ? (
                            <Input
                              type="number"
                              value={editValues.budgetAllocation || 0}
                              onChange={(e) => setEditValues({ ...editValues, budgetAllocation: parseFloat(e.target.value) })}
                              className="w-24 h-6 text-right"
                            />
                          ) : (
                            <span>${agent.budgetSpent.toFixed(2)} / ${agent.budgetAllocation.toFixed(2)}</span>
                          )}
                        </div>
                        <Progress
                          value={agent.utilizationPercent?.budget || 0}
                          className={cn('h-2', (agent.utilizationPercent?.budget || 0) > 80 && 'bg-red-200')}
                        />
                      </div>

                      {/* Agent Actions */}
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Agent Actions</span>
                          {editingAgent === agent.agentId ? (
                            <Input
                              type="number"
                              value={editValues.monthlyApiCallsLimit || 0}
                              onChange={(e) => setEditValues({ ...editValues, monthlyApiCallsLimit: parseInt(e.target.value) })}
                              className="w-24 h-6 text-right"
                            />
                          ) : (
                            <span>{agent.apiCallsUsed.toLocaleString()} / {agent.monthlyApiCallsLimit.toLocaleString()}</span>
                          )}
                        </div>
                        <Progress
                          value={agent.utilizationPercent?.apiCalls || 0}
                          className={cn('h-2', (agent.utilizationPercent?.apiCalls || 0) > 80 && 'bg-orange-200')}
                        />
                      </div>

                      {/* Tokens */}
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Tokens</span>
                          {editingAgent === agent.agentId ? (
                            <Input
                              type="number"
                              value={editValues.monthlyTokensLimit || 0}
                              onChange={(e) => setEditValues({ ...editValues, monthlyTokensLimit: parseInt(e.target.value) })}
                              className="w-24 h-6 text-right"
                            />
                          ) : (
                            <span>{(agent.tokensUsed / 1000).toFixed(1)}K / {(agent.monthlyTokensLimit / 1000).toFixed(0)}K</span>
                          )}
                        </div>
                        <Progress
                          value={agent.utilizationPercent?.tokens || 0}
                          className={cn('h-2', (agent.utilizationPercent?.tokens || 0) > 80 && 'bg-yellow-200')}
                        />
                      </div>

                      {/* Tools */}
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Tool Uses</span>
                          <span>{agent.toolsUsed.toLocaleString()} / {agent.monthlyToolsLimit.toLocaleString()}</span>
                        </div>
                        <Progress value={agent.utilizationPercent?.tools || 0} className="h-2" />
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setSelectedAgent(selectedAgent === agent.agentId ? null : agent.agentId)}
                      >
                        {selectedAgent === agent.agentId ? 'Hide Transactions' : 'View Transactions'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No agent credits configured yet</p>
                  <p className="text-sm">Credits will appear when agents start using resources</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Transaction History</CardTitle>
                  <CardDescription>
                    {selectedAgent ? 'Showing transactions for selected agent' : 'Select an agent to view transactions'}
                  </CardDescription>
                </div>
                {agentCredits && agentCredits.length > 0 && (
                  <Select value={selectedAgent || ''} onValueChange={(v: string) => setSelectedAgent(v || null)}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agentCredits.map((agent) => (
                        <SelectItem key={agent.agentId} value={agent.agentId}>
                          {agent.agent?.name || agent.agentId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {selectedAgent ? (
                loadingTransactions ? (
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : transactions?.data && transactions.data.length > 0 ? (
                  <div className="space-y-2">
                    {transactions.data.map((tx) => (
                      <div key={tx.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                        {getTransactionIcon(tx.transactionType)}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{tx.description || tx.transactionType.replace(/_/g, ' ')}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {getResourceLabel(tx.resourceType)}
                            </Badge>
                            <span>{format(new Date(tx.createdAt), 'MMM d, HH:mm')}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={cn(
                            'font-semibold',
                            tx.amount >= 0 ? 'text-green-600' : 'text-red-600'
                          )}>
                            {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Balance: {tx.balanceAfter.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Coins className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No transactions for this agent</p>
                  </div>
                )
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Select an agent to view transaction history</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
