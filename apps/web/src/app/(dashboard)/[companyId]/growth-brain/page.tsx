'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Brain, Zap, TrendingUp, TrendingDown, CheckCircle2, Clock,
  Loader2, Target, AlertTriangle, Sparkles, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function GrowthBrainPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const qc = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkResult, setThinkResult] = useState<any>(null);

  // Revenue data
  const { data: revenueData } = useQuery({
    queryKey: ['revenue', companyId],
    queryFn: () => api.get<any>(`/dashboard/company/${companyId}/revenue`, { token: token! }),
    enabled: !!token,
  });
  const revenue = revenueData?.snapshot;
  const revenueDecisions = (revenueData?.decisions || []) as any[];

  const { data, isLoading } = useQuery({
    queryKey: ['growth-brain', companyId],
    queryFn: () => api.get<any>(`/dashboard/company/${companyId}/growth-brain`, { token: token! }),
    enabled: !!token,
    refetchInterval: 30000,
  });

  const handleRunAnalysis = async () => {
    if (!token || isRunning) return;
    setIsRunning(true);
    try {
      const res = await api.post<any>(`/dashboard/company/${companyId}/growth-brain/run`, {}, { token });
      toast.success(`Growth Brain made ${res.decisionsCreated} decisions!`);
      qc.invalidateQueries({ queryKey: ['growth-brain'] });
    } catch { toast.error('Analysis failed'); }
    finally { setIsRunning(false); }
  };

  const handleDeepThink = async () => {
    if (!token || isThinking) return;
    setIsThinking(true);
    setThinkResult(null);
    try {
      const res = await api.post<any>(`/dashboard/company/${companyId}/growth-brain/think`, {
        goal: 'Analyze all pages, research market opportunities, create comprehensive growth strategy with actionable tasks',
      }, { token });
      setThinkResult(res);
      toast.success(`Intelligence Engine created ${res.tasksCreated} strategic tasks!`);
      qc.invalidateQueries({ queryKey: ['growth-brain'] });
    } catch { toast.error('Deep analysis failed'); }
    finally { setIsThinking(false); }
  };

  const decisions = data?.decisions || [];
  const pendingTasks = data?.pendingTasks || [];
  const winners = data?.winningPatterns || [];
  const failures = data?.failedStrategies || [];
  const pageStats = data?.pageStats || {};

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" /> Growth Brain
          </h1>
          <p className="text-muted-foreground">AI analyzes your performance and makes decisions automatically</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleRunAnalysis} disabled={isRunning || isThinking}>
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {isRunning ? 'Analyzing...' : 'Quick Analysis'}
          </Button>
          <Button className="gap-2" onClick={handleDeepThink} disabled={isRunning || isThinking}>
            {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {isThinking ? 'AI is thinking...' : 'Deep Strategy Think'}
          </Button>
        </div>
      </div>

      {/* Page Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-4 text-center">
          <p className="text-2xl font-bold">{pageStats.total || 0}</p>
          <p className="text-xs text-muted-foreground">Total Pages</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center">
          <p className="text-2xl font-bold">{pageStats.published || 0}</p>
          <p className="text-xs text-muted-foreground">Published</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center">
          <p className="text-2xl font-bold">{pendingTasks.length}</p>
          <p className="text-xs text-muted-foreground">Pending Tasks</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center">
          <p className="text-2xl font-bold">{decisions.length}</p>
          <p className="text-xs text-muted-foreground">AI Decisions</p>
        </CardContent></Card>
      </div>

      {/* Revenue Brain */}
      {revenue && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            💰 Revenue Overview
          </h3>
          <div className="grid grid-cols-4 gap-3">
            <Card className={revenue.profit >= 0 ? 'border-green-200' : 'border-red-200'}>
              <CardContent className="pt-3 pb-3 text-center">
                <p className={`text-xl font-bold ${revenue.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${revenue.profit}
                </p>
                <p className="text-[10px] text-muted-foreground">Profit</p>
              </CardContent>
            </Card>
            <Card><CardContent className="pt-3 pb-3 text-center">
              <p className="text-xl font-bold">${revenue.totalRevenue}</p>
              <p className="text-[10px] text-muted-foreground">Revenue</p>
            </CardContent></Card>
            <Card><CardContent className="pt-3 pb-3 text-center">
              <p className="text-xl font-bold">${revenue.totalSpend}</p>
              <p className="text-[10px] text-muted-foreground">Spend</p>
            </CardContent></Card>
            <Card><CardContent className="pt-3 pb-3 text-center">
              <p className="text-xl font-bold">{revenue.avgROAS}x</p>
              <p className="text-[10px] text-muted-foreground">ROAS</p>
            </CardContent></Card>
          </div>

          {/* Revenue Decisions */}
          {revenueDecisions.length > 0 && (
            <div className="space-y-2">
              {revenueDecisions.filter((d: any) => d.priority === 'critical' || d.priority === 'high').slice(0, 5).map((d: any, i: number) => (
                <Card key={i} className={d.priority === 'critical' ? 'border-red-200 bg-red-50/30' : 'border-amber-200 bg-amber-50/30'}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className={`text-[9px] shrink-0 ${d.priority === 'critical' ? 'text-red-600 border-red-300' : 'text-amber-600 border-amber-300'}`}>
                        {d.priority}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{d.action}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{d.reason}</p>
                        <p className="text-xs text-green-600 font-medium mt-0.5">📈 {d.revenueImpact}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Intelligence Engine Result */}
      {thinkResult && thinkResult.success && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-5 pb-5 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" /> AI Strategic Analysis
            </h3>

            {/* Reasoning */}
            <div className="p-3 bg-background rounded-lg text-sm">
              <p className="font-medium text-xs text-muted-foreground mb-1">AI's Reasoning:</p>
              <p>{thinkResult.reasoning}</p>
            </div>

            {/* Research */}
            {thinkResult.research?.opportunities?.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1">Opportunities Found:</p>
                <ul className="text-sm space-y-1">
                  {thinkResult.research.opportunities.map((o: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5"><Target className="w-3 h-3 text-green-600 mt-0.5 shrink-0" />{o}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Strategy */}
            {thinkResult.strategy?.approach && (
              <div className="p-3 bg-background rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-1">Strategy:</p>
                <p className="text-sm font-medium">{thinkResult.strategy.approach}</p>
              </div>
            )}

            {/* Tasks Created */}
            {thinkResult.tasks?.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1">{thinkResult.tasksCreated} Tasks Created:</p>
                <div className="space-y-1">
                  {thinkResult.tasks.map((t: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-[9px] capitalize">{t.priority}</Badge>
                      <span>{t.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reflection */}
            {thinkResult.reflection && (
              <div className="p-3 bg-amber-50 rounded-lg text-sm">
                <p className="font-medium text-xs text-amber-700 mb-1">AI Self-Reflection (based on real data):</p>
                <p className="text-amber-900 italic">{thinkResult.reflection}</p>
              </div>
            )}

            {/* Tool calls log — show data sources used */}
            {thinkResult.toolCalls?.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-[10px] text-muted-foreground">
                  Data sources used: {Array.from(new Set((thinkResult.toolCalls as any[]).map((t: any) => t.tool))).join(', ')}
                  {' '}({thinkResult.toolCalls.length} queries)
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Winning Patterns */}
      {winners.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
            <TrendingUp className="w-4 h-4 text-green-600" /> What's Working
          </h3>
          <div className="space-y-2">
            {winners.map((w: any, i: number) => (
              <Card key={i} className="border-green-200 bg-green-50/30">
                <CardContent className="p-3">
                  <p className="text-sm font-medium text-green-900">{w.title}</p>
                  <p className="text-xs text-green-700 mt-0.5">{tryParseContent(w.content)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Failed Strategies */}
      {failures.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
            <TrendingDown className="w-4 h-4 text-red-600" /> Needs Improvement
          </h3>
          <div className="space-y-2">
            {failures.map((f: any, i: number) => (
              <Card key={i} className="border-red-200 bg-red-50/30">
                <CardContent className="p-3">
                  <p className="text-sm font-medium text-red-900">{f.title}</p>
                  <p className="text-xs text-red-700 mt-0.5">{tryParseContent(f.content)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Pending Tasks (created by Growth Brain) */}
      {pendingTasks.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
            <Clock className="w-4 h-4 text-amber-600" /> Queued Actions ({pendingTasks.length})
          </h3>
          <div className="space-y-2">
            {pendingTasks.map((t: any) => (
              <Card key={t.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <Badge variant="outline" className="text-[10px] capitalize shrink-0">{t.priority}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.type}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">Queued</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent AI Decisions */}
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
          <Sparkles className="w-4 h-4 text-primary" /> Recent AI Decisions
        </h3>
        {decisions.length > 0 ? (
          <div className="space-y-2">
            {decisions.map((d: any) => (
              <Card key={d.id}>
                <CardContent className="p-3">
                  <p className="text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{tryParseContent(d.content)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(d.createdAt).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <Brain className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No decisions yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Growth Brain analyzes your pages and creates optimization tasks automatically every 30 minutes.
            </p>
            <Button className="gap-2" onClick={handleRunAnalysis} disabled={isRunning}>
              <Zap className="w-4 h-4" /> Run First Analysis
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}

function tryParseContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === 'string') return parsed;
    if (parsed.issues) return `${parsed.issues.length} issues found`;
    if (parsed.keyword) return `Keyword: ${parsed.keyword}`;
    if (Array.isArray(parsed)) return parsed.map((p: any) => p.keyword || p.title || p).join(', ');
    return JSON.stringify(parsed).substring(0, 150);
  } catch {
    return content.substring(0, 150);
  }
}
