'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Target,
  Calendar,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ChevronRight,
  Bell,
  Settings,
  RefreshCw,
  Plus,
  Zap,
  CalendarDays,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface KeyResult {
  id: string;
  metric: string;
  target: number;
  current: number;
  unit: string;
}

interface Objective {
  id: string;
  title: string;
  description: string;
  keyResults: KeyResult[];
  progress: number;
  status: 'on_track' | 'at_risk' | 'behind' | 'completed';
}

interface Priority {
  rank: number;
  title: string;
  description: string;
  category: 'growth' | 'efficiency' | 'innovation' | 'risk' | 'quality';
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}

interface Strategy {
  id: string;
  horizon: 'quarterly' | 'weekly' | 'daily';
  status: string;
  periodStart: string;
  periodEnd: string;
  vision?: string;
  mission?: string;
  theme?: string;
  objectives?: Objective[];
  priorities?: Priority[];
  overallProgress: number;
  healthScore: number;
}

interface Alignment {
  score: number;
  quarterlyToWeekly: number;
  weeklyToDaily: number;
  issues: Array<{
    issue: string;
    severity: 'critical' | 'warning' | 'info';
    recommendation: string;
  }>;
  computedAt: string;
}

interface Trigger {
  id: string;
  name: string;
  description?: string;
  triggerType: string;
  enabled: number;
  triggerCount: number;
  lastTriggeredAt?: string;
}

interface Risk {
  category: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  currentValue: number;
  threshold: number;
  trend: 'improving' | 'stable' | 'worsening';
  description: string;
  recommendedActions: string[];
}

interface RiskAssessment {
  overallRiskLevel: 'critical' | 'high' | 'medium' | 'low';
  risks: Risk[];
  actionsTaken: Array<{
    action: string;
    reason: string;
    success: boolean;
  }>;
  assessedAt: string;
}

interface TimelineStrategy {
  id: string;
  horizon: 'quarterly' | 'weekly' | 'daily';
  theme: string | null;
  status: string;
  periodStart: string;
  periodEnd: string;
  overallProgress: number;
  healthScore: number;
  parentId: string | null;
}

interface TimelineData {
  strategies: TimelineStrategy[];
  dateRange: {
    start: string;
    end: string;
  };
}

export default function StrategyPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [loading, setLoading] = useState(true);
  const [strategies, setStrategies] = useState<{
    quarterly: Strategy | null;
    weekly: Strategy | null;
    daily: Strategy | null;
  }>({ quarterly: null, weekly: null, daily: null });
  const [alignment, setAlignment] = useState<Alignment | null>(null);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);
  const [timelineView, setTimelineView] = useState<'month' | 'quarter' | 'year'>('quarter');
  const [timelineDate, setTimelineDate] = useState(new Date());

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      // Fetch active strategies
      const strategiesRes = await fetch(
        `/api/v1/strategy/company/${companyId}/active`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const strategiesData = await strategiesRes.json();

      if (strategiesData.data) {
        setStrategies({
          quarterly: strategiesData.data.quarterly,
          weekly: strategiesData.data.weekly,
          daily: strategiesData.data.daily,
        });
        setAlignment(strategiesData.data.alignment);
      }

      // Fetch triggers
      const triggersRes = await fetch(
        `/api/v1/strategy/company/${companyId}/triggers`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const triggersData = await triggersRes.json();
      setTriggers(triggersData.data || []);

      // Fetch risk assessment
      const riskRes = await fetch(
        `/api/v1/strategy/company/${companyId}/risks`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (riskRes.ok) {
        const riskData = await riskRes.json();
        setRiskAssessment(riskData.data);
      }

      // Fetch timeline data
      const timelineRes = await fetch(
        `/api/v1/strategy/company/${companyId}/timeline`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (timelineRes.ok) {
        const tlData = await timelineRes.json();
        setTimelineData(tlData.data);
      }
    } catch (error) {
      console.error('Failed to fetch strategy data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateStrategy = async (horizon: 'quarterly' | 'weekly' | 'daily') => {
    const token = localStorage.getItem('token');
    await fetch(`/api/v1/strategy/company/${companyId}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ horizon }),
    });
    // Refresh data
    fetchData();
  };

  const createDefaultTriggers = async () => {
    const token = localStorage.getItem('token');
    await fetch(`/api/v1/strategy/company/${companyId}/triggers/defaults`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Strategy Horizon</h1>
          <p className="text-muted-foreground">
            Multi-level strategic planning: Quarterly → Weekly → Daily
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button>
            <Sparkles className="h-4 w-4 mr-2" />
            AI Generate
          </Button>
        </div>
      </div>

      {/* Alignment Score */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'h-16 w-16 rounded-full flex items-center justify-center text-2xl font-bold',
                  alignment?.score && alignment.score >= 80
                    ? 'bg-green-100 text-green-700'
                    : alignment?.score && alignment.score >= 60
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                )}
              >
                {alignment?.score ?? 0}
              </div>
              <div>
                <h3 className="font-semibold text-lg">Strategy Alignment</h3>
                <p className="text-muted-foreground text-sm">
                  How well your daily actions align with long-term vision
                </p>
              </div>
            </div>
            <div className="flex gap-8">
              <div className="text-center">
                <div className="text-2xl font-bold">{alignment?.quarterlyToWeekly ?? 0}%</div>
                <div className="text-xs text-muted-foreground">Quarterly → Weekly</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{alignment?.weeklyToDaily ?? 0}%</div>
                <div className="text-xs text-muted-foreground">Weekly → Daily</div>
              </div>
            </div>
          </div>
          {alignment?.issues && alignment.issues.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
              <div className="flex items-center gap-2 text-yellow-800">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Alignment Issues</span>
              </div>
              <ul className="mt-2 space-y-1">
                {alignment.issues.map((issue, i) => (
                  <li key={i} className="text-sm text-yellow-700">
                    • {issue.issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">
            <CalendarDays className="h-4 w-4 mr-1" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="quarterly">Quarterly Vision</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Goals</TabsTrigger>
          <TabsTrigger value="daily">Daily Priorities</TabsTrigger>
          <TabsTrigger value="risks" className="relative">
            Risks
            {riskAssessment && (riskAssessment.overallRiskLevel === 'critical' || riskAssessment.overallRiskLevel === 'high') && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500" />
            )}
          </TabsTrigger>
          <TabsTrigger value="triggers">Event Triggers</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Quarterly */}
            <StrategyCard
              horizon="quarterly"
              icon={<Target className="h-5 w-5" />}
              title="Quarterly Vision"
              subtitle="90-day strategy"
              strategy={strategies.quarterly}
              onGenerate={() => generateStrategy('quarterly')}
            />

            {/* Weekly */}
            <StrategyCard
              horizon="weekly"
              icon={<Calendar className="h-5 w-5" />}
              title="Weekly Goals"
              subtitle="7-day focus"
              strategy={strategies.weekly}
              onGenerate={() => generateStrategy('weekly')}
            />

            {/* Daily */}
            <StrategyCard
              horizon="daily"
              icon={<Clock className="h-5 w-5" />}
              title="Daily Priorities"
              subtitle="Today's actions"
              strategy={strategies.daily}
              onGenerate={() => generateStrategy('daily')}
            />
          </div>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Strategy Timeline</h3>
              <p className="text-muted-foreground text-sm">
                Visualize your strategic horizons over time
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const newDate = new Date(timelineDate);
                  if (timelineView === 'month') {
                    newDate.setMonth(newDate.getMonth() - 1);
                  } else if (timelineView === 'quarter') {
                    newDate.setMonth(newDate.getMonth() - 3);
                  } else {
                    newDate.setFullYear(newDate.getFullYear() - 1);
                  }
                  setTimelineDate(newDate);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex border rounded-lg overflow-hidden">
                <Button
                  variant={timelineView === 'month' ? 'default' : 'ghost'}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setTimelineView('month')}
                >
                  Month
                </Button>
                <Button
                  variant={timelineView === 'quarter' ? 'default' : 'ghost'}
                  size="sm"
                  className="rounded-none border-x"
                  onClick={() => setTimelineView('quarter')}
                >
                  Quarter
                </Button>
                <Button
                  variant={timelineView === 'year' ? 'default' : 'ghost'}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setTimelineView('year')}
                >
                  Year
                </Button>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const newDate = new Date(timelineDate);
                  if (timelineView === 'month') {
                    newDate.setMonth(newDate.getMonth() + 1);
                  } else if (timelineView === 'quarter') {
                    newDate.setMonth(newDate.getMonth() + 3);
                  } else {
                    newDate.setFullYear(newDate.getFullYear() + 1);
                  }
                  setTimelineDate(newDate);
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setTimelineDate(new Date())}>
                Today
              </Button>
            </div>
          </div>

          {/* Timeline Gantt Chart */}
          <Card>
            <CardContent className="pt-6">
              <StrategyGantt
                data={timelineData}
                view={timelineView}
                centerDate={timelineDate}
              />
            </CardContent>
          </Card>

          {/* Legend */}
          <div className="flex items-center gap-6 px-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-purple-500" />
              <span className="text-sm text-muted-foreground">Quarterly</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-500" />
              <span className="text-sm text-muted-foreground">Weekly</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-500" />
              <span className="text-sm text-muted-foreground">Daily</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <div className="flex items-center gap-1">
                <div className="w-6 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="w-3/4 h-full bg-primary" />
                </div>
                <span className="text-xs text-muted-foreground">Progress</span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Quarterly Tab */}
        <TabsContent value="quarterly">
          <StrategyDetail
            strategy={strategies.quarterly}
            horizon="quarterly"
            onGenerate={() => generateStrategy('quarterly')}
          />
        </TabsContent>

        {/* Weekly Tab */}
        <TabsContent value="weekly">
          <StrategyDetail
            strategy={strategies.weekly}
            horizon="weekly"
            onGenerate={() => generateStrategy('weekly')}
          />
        </TabsContent>

        {/* Daily Tab */}
        <TabsContent value="daily">
          <StrategyDetail
            strategy={strategies.daily}
            horizon="daily"
            onGenerate={() => generateStrategy('daily')}
          />
        </TabsContent>

        {/* Risks Tab */}
        <TabsContent value="risks" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Risk Monitoring</h3>
              <p className="text-muted-foreground text-sm">
                Proactive risk detection and protective actions
              </p>
            </div>
            <Button variant="outline" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Overall Risk Level */}
          {riskAssessment && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'h-16 w-16 rounded-full flex items-center justify-center',
                      riskAssessment.overallRiskLevel === 'critical'
                        ? 'bg-red-100'
                        : riskAssessment.overallRiskLevel === 'high'
                        ? 'bg-orange-100'
                        : riskAssessment.overallRiskLevel === 'medium'
                        ? 'bg-yellow-100'
                        : 'bg-green-100'
                    )}
                  >
                    <AlertTriangle
                      className={cn(
                        'h-8 w-8',
                        riskAssessment.overallRiskLevel === 'critical'
                          ? 'text-red-600'
                          : riskAssessment.overallRiskLevel === 'high'
                          ? 'text-orange-600'
                          : riskAssessment.overallRiskLevel === 'medium'
                          ? 'text-yellow-600'
                          : 'text-green-600'
                      )}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg capitalize">
                      {riskAssessment.overallRiskLevel} Risk Level
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Last assessed: {new Date(riskAssessment.assessedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Risk Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {riskAssessment?.risks.map((risk, idx) => (
              <RiskCard key={idx} risk={risk} />
            ))}
          </div>

          {/* No Risks */}
          {(!riskAssessment || riskAssessment.risks.length === 0) && (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="font-semibold text-lg">All Clear</h3>
                <p className="text-muted-foreground">
                  No significant risks detected. Your company is operating smoothly.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Recent Actions Taken */}
          {riskAssessment && riskAssessment.actionsTaken.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Protective Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {riskAssessment.actionsTaken.map((action, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        {action.success ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="font-medium">{action.action.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{action.reason}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Triggers Tab */}
        <TabsContent value="triggers" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Event Triggers</h3>
              <p className="text-muted-foreground text-sm">
                Automated CEO activation based on metrics and events
              </p>
            </div>
            {triggers.length === 0 ? (
              <Button onClick={createDefaultTriggers}>
                <Zap className="h-4 w-4 mr-2" />
                Create Default Triggers
              </Button>
            ) : (
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Trigger
              </Button>
            )}
          </div>

          {triggers.length > 0 ? (
            <div className="grid gap-4">
              {triggers.map((trigger) => (
                <TriggerCard key={trigger.id} trigger={trigger} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">No triggers configured</h3>
                <p className="text-muted-foreground mb-4">
                  Event triggers automatically activate the CEO reasoning loop when certain conditions are met.
                </p>
                <Button onClick={createDefaultTriggers}>
                  Create Default Triggers
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Strategy Card Component
function StrategyCard({
  horizon,
  icon,
  title,
  subtitle,
  strategy,
  onGenerate,
}: {
  horizon: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  strategy: Strategy | null;
  onGenerate: () => void;
}) {
  if (!strategy) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            {icon}
          </div>
          <h3 className="font-semibold mb-1">{title}</h3>
          <p className="text-muted-foreground text-sm mb-4">{subtitle}</p>
          <Button variant="outline" onClick={onGenerate}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate with AI
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          <Badge variant={strategy.status === 'active' ? 'default' : 'secondary'}>
            {strategy.status}
          </Badge>
        </div>
        <CardDescription>{strategy.theme || subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {strategy.vision && (
            <p className="text-sm italic text-muted-foreground">
              "{strategy.vision.substring(0, 100)}..."
            </p>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">
                {strategy.overallProgress}%
              </span>
            </div>
            <Progress value={strategy.overallProgress} />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {strategy.objectives?.length || 0} objectives
            </span>
            <Button variant="ghost" size="sm">
              View <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Strategy Detail Component
function StrategyDetail({
  strategy,
  horizon,
  onGenerate,
}: {
  strategy: Strategy | null;
  horizon: string;
  onGenerate: () => void;
}) {
  if (!strategy) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">No {horizon} strategy defined</h3>
          <p className="text-muted-foreground mb-4">
            Create a {horizon} strategy to guide your company's direction.
          </p>
          <Button onClick={onGenerate}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate with AI
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Vision & Theme */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{strategy.theme || `${horizon} Strategy`}</CardTitle>
            <Badge variant={strategy.status === 'active' ? 'default' : 'secondary'}>
              {strategy.status}
            </Badge>
          </div>
          <CardDescription>
            {new Date(strategy.periodStart).toLocaleDateString()} -{' '}
            {new Date(strategy.periodEnd).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {strategy.vision && (
            <blockquote className="border-l-4 border-primary pl-4 italic">
              {strategy.vision}
            </blockquote>
          )}
          {strategy.mission && (
            <p className="mt-4 text-muted-foreground">{strategy.mission}</p>
          )}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Overall Progress</span>
              <span>{strategy.overallProgress}%</span>
            </div>
            <Progress value={strategy.overallProgress} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* Objectives */}
      {strategy.objectives && strategy.objectives.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Objectives</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {strategy.objectives.map((obj) => (
              <div key={obj.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium">{obj.title}</h4>
                    <p className="text-sm text-muted-foreground">{obj.description}</p>
                  </div>
                  <Badge
                    variant={
                      obj.status === 'completed'
                        ? 'default'
                        : obj.status === 'on_track'
                        ? 'secondary'
                        : 'destructive'
                    }
                  >
                    {obj.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="mt-3">
                  <Progress value={obj.progress} className="h-2" />
                  <span className="text-xs text-muted-foreground">{obj.progress}%</span>
                </div>
                {obj.keyResults && obj.keyResults.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {obj.keyResults.map((kr) => (
                      <div key={kr.id} className="flex items-center justify-between text-sm">
                        <span>{kr.metric}</span>
                        <span className="font-mono">
                          {kr.current} / {kr.target} {kr.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Priorities */}
      {strategy.priorities && strategy.priorities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Priorities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {strategy.priorities.map((priority, idx) => (
                <div key={idx} className="flex items-center gap-4 p-3 border rounded-lg">
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm',
                      priority.rank === 1
                        ? 'bg-yellow-100 text-yellow-700'
                        : priority.rank === 2
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-orange-100 text-orange-700'
                    )}
                  >
                    {priority.rank}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">{priority.title}</h4>
                    <p className="text-sm text-muted-foreground">{priority.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline">{priority.category}</Badge>
                    <Badge variant="outline">Impact: {priority.impact}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Trigger Card Component
function TriggerCard({ trigger }: { trigger: Trigger }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'h-10 w-10 rounded-full flex items-center justify-center',
                trigger.enabled ? 'bg-green-100' : 'bg-gray-100'
              )}
            >
              <Zap
                className={cn(
                  'h-5 w-5',
                  trigger.enabled ? 'text-green-600' : 'text-gray-400'
                )}
              />
            </div>
            <div>
              <h4 className="font-medium">{trigger.name}</h4>
              <p className="text-sm text-muted-foreground">
                {trigger.description || trigger.triggerType.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium">{trigger.triggerCount}x</div>
              <div className="text-xs text-muted-foreground">triggered</div>
            </div>
            <Badge variant={trigger.enabled ? 'default' : 'secondary'}>
              {trigger.enabled ? 'Active' : 'Disabled'}
            </Badge>
            <Button variant="ghost" size="icon">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Strategy Gantt Chart Component
function StrategyGantt({
  data,
  view,
  centerDate,
}: {
  data: TimelineData | null;
  view: 'month' | 'quarter' | 'year';
  centerDate: Date;
}) {
  // Calculate date range based on view
  const getDateRange = () => {
    const start = new Date(centerDate);
    const end = new Date(centerDate);

    if (view === 'month') {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
    } else if (view === 'quarter') {
      const quarterStart = Math.floor(start.getMonth() / 3) * 3;
      start.setMonth(quarterStart, 1);
      end.setMonth(quarterStart + 3, 0);
    } else {
      start.setMonth(0, 1);
      end.setMonth(11, 31);
    }

    return { start, end };
  };

  const { start: rangeStart, end: rangeEnd } = getDateRange();
  const totalDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));

  // Generate time markers
  const getTimeMarkers = () => {
    const markers: { label: string; position: number }[] = [];

    if (view === 'month') {
      // Weekly markers
      const current = new Date(rangeStart);
      while (current <= rangeEnd) {
        const dayOffset = Math.ceil((current.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
        markers.push({
          label: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          position: (dayOffset / totalDays) * 100,
        });
        current.setDate(current.getDate() + 7);
      }
    } else if (view === 'quarter') {
      // Monthly markers
      const current = new Date(rangeStart);
      while (current <= rangeEnd) {
        const dayOffset = Math.ceil((current.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
        markers.push({
          label: current.toLocaleDateString('en-US', { month: 'short' }),
          position: (dayOffset / totalDays) * 100,
        });
        current.setMonth(current.getMonth() + 1);
      }
    } else {
      // Quarterly markers
      const current = new Date(rangeStart);
      while (current <= rangeEnd) {
        const quarter = Math.floor(current.getMonth() / 3) + 1;
        const dayOffset = Math.ceil((current.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
        markers.push({
          label: `Q${quarter}`,
          position: (dayOffset / totalDays) * 100,
        });
        current.setMonth(current.getMonth() + 3);
      }
    }

    return markers;
  };

  // Calculate bar position and width
  const getBarStyle = (strategy: TimelineStrategy) => {
    const strategyStart = new Date(strategy.periodStart);
    const strategyEnd = new Date(strategy.periodEnd);

    // Clamp to visible range
    const visibleStart = Math.max(strategyStart.getTime(), rangeStart.getTime());
    const visibleEnd = Math.min(strategyEnd.getTime(), rangeEnd.getTime());

    if (visibleStart >= visibleEnd) {
      return { left: 0, width: 0, visible: false };
    }

    const startOffset = (visibleStart - rangeStart.getTime()) / (1000 * 60 * 60 * 24);
    const duration = (visibleEnd - visibleStart) / (1000 * 60 * 60 * 24);

    return {
      left: (startOffset / totalDays) * 100,
      width: (duration / totalDays) * 100,
      visible: true,
    };
  };

  const horizonColors = {
    quarterly: 'bg-purple-500',
    weekly: 'bg-blue-500',
    daily: 'bg-green-500',
  };

  const horizonBgColors = {
    quarterly: 'bg-purple-100',
    weekly: 'bg-blue-100',
    daily: 'bg-green-100',
  };

  const markers = getTimeMarkers();

  // Group strategies by horizon
  const quarterlyStrategies = data?.strategies.filter(s => s.horizon === 'quarterly') || [];
  const weeklyStrategies = data?.strategies.filter(s => s.horizon === 'weekly') || [];
  const dailyStrategies = data?.strategies.filter(s => s.horizon === 'daily') || [];

  // Today marker
  const today = new Date();
  const todayOffset = Math.ceil((today.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
  const todayPosition = (todayOffset / totalDays) * 100;
  const showTodayMarker = todayPosition >= 0 && todayPosition <= 100;

  if (!data || data.strategies.length === 0) {
    return (
      <div className="text-center py-12">
        <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="font-semibold mb-2">No strategies in this period</h3>
        <p className="text-muted-foreground text-sm">
          Create strategies to see them visualized on the timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with view title */}
      <div className="text-center font-medium text-lg">
        {view === 'month' && centerDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        {view === 'quarter' && `Q${Math.floor(centerDate.getMonth() / 3) + 1} ${centerDate.getFullYear()}`}
        {view === 'year' && centerDate.getFullYear()}
      </div>

      {/* Timeline header */}
      <div className="relative h-8 border-b">
        {markers.map((marker, idx) => (
          <div
            key={idx}
            className="absolute text-xs text-muted-foreground"
            style={{ left: `${marker.position}%` }}
          >
            <div className="border-l border-muted h-full absolute" />
            <span className="ml-1">{marker.label}</span>
          </div>
        ))}
      </div>

      {/* Gantt rows */}
      <div className="space-y-4 relative">
        {/* Today marker */}
        {showTodayMarker && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
            style={{ left: `${todayPosition}%` }}
          >
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs bg-red-500 text-white px-1 rounded">
              Today
            </div>
          </div>
        )}

        {/* Quarterly Row */}
        {quarterlyStrategies.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-600">Quarterly</span>
            </div>
            <div className="relative h-12 bg-muted/30 rounded-lg">
              {quarterlyStrategies.map((strategy) => {
                const style = getBarStyle(strategy);
                if (!style.visible) return null;

                return (
                  <div
                    key={strategy.id}
                    className={cn(
                      'absolute top-1 bottom-1 rounded-md overflow-hidden cursor-pointer transition-all hover:ring-2 ring-purple-400',
                      horizonBgColors.quarterly
                    )}
                    style={{ left: `${style.left}%`, width: `${style.width}%` }}
                    title={`${strategy.theme || 'Quarterly Strategy'} (${strategy.overallProgress}%)`}
                  >
                    <div
                      className={cn('h-full', horizonColors.quarterly)}
                      style={{ width: `${strategy.overallProgress}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-xs font-medium truncate">
                      {strategy.theme || 'Quarterly Strategy'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Weekly Row */}
        {weeklyStrategies.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-600">Weekly</span>
            </div>
            <div className="relative h-10 bg-muted/30 rounded-lg">
              {weeklyStrategies.map((strategy) => {
                const style = getBarStyle(strategy);
                if (!style.visible) return null;

                return (
                  <div
                    key={strategy.id}
                    className={cn(
                      'absolute top-1 bottom-1 rounded-md overflow-hidden cursor-pointer transition-all hover:ring-2 ring-blue-400',
                      horizonBgColors.weekly
                    )}
                    style={{ left: `${style.left}%`, width: `${style.width}%` }}
                    title={`${strategy.theme || 'Weekly Goals'} (${strategy.overallProgress}%)`}
                  >
                    <div
                      className={cn('h-full', horizonColors.weekly)}
                      style={{ width: `${strategy.overallProgress}%` }}
                    />
                    {style.width > 8 && (
                      <span className="absolute inset-0 flex items-center px-2 text-xs font-medium truncate">
                        {strategy.theme || 'Week'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Daily Row */}
        {dailyStrategies.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-600">Daily</span>
            </div>
            <div className="relative h-8 bg-muted/30 rounded-lg">
              {dailyStrategies.map((strategy) => {
                const style = getBarStyle(strategy);
                if (!style.visible) return null;

                return (
                  <div
                    key={strategy.id}
                    className={cn(
                      'absolute top-1 bottom-1 rounded overflow-hidden cursor-pointer transition-all hover:ring-2 ring-green-400',
                      horizonBgColors.daily
                    )}
                    style={{ left: `${style.left}%`, width: `${Math.max(style.width, 1)}%` }}
                    title={`${strategy.theme || 'Daily Priorities'} (${strategy.overallProgress}%)`}
                  >
                    <div
                      className={cn('h-full', horizonColors.daily)}
                      style={{ width: `${strategy.overallProgress}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Strategy count summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground pt-4 border-t">
        <span>
          Showing {data.strategies.length} strategies in view
        </span>
        <span>
          {new Date(rangeStart).toLocaleDateString()} - {new Date(rangeEnd).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

// Risk Card Component
function RiskCard({ risk }: { risk: Risk }) {
  const severityColors = {
    critical: { bg: 'bg-red-100', text: 'text-red-700', badge: 'bg-red-500' },
    high: { bg: 'bg-orange-100', text: 'text-orange-700', badge: 'bg-orange-500' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', badge: 'bg-yellow-500' },
    low: { bg: 'bg-blue-100', text: 'text-blue-700', badge: 'bg-blue-500' },
  };

  const trendIcons = {
    improving: <TrendingUp className="h-4 w-4 text-green-500 rotate-180" />,
    stable: <span className="h-4 w-4 flex items-center justify-center text-gray-500">—</span>,
    worsening: <TrendingUp className="h-4 w-4 text-red-500" />,
  };

  const colors = severityColors[risk.severity];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className={cn('p-3 rounded-lg', colors.bg)}>
            <AlertTriangle className={cn('h-5 w-5', colors.text)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">{risk.name}</h4>
              <div className="flex items-center gap-2">
                {trendIcons[risk.trend]}
                <Badge className={cn(colors.badge, 'text-white')}>
                  {risk.severity}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{risk.description}</p>
            <div className="flex items-center gap-4 text-sm">
              <span className="font-mono">
                Current: <span className="font-bold">{risk.currentValue.toFixed(1)}</span>
              </span>
              <span className="text-muted-foreground">
                Threshold: {risk.threshold}
              </span>
            </div>
            {risk.recommendedActions.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <span className="text-xs text-muted-foreground">Recommended Actions:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {risk.recommendedActions.map((action, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {action.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
