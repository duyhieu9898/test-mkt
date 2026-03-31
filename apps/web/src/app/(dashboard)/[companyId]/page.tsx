'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Rocket,
  FileText,
  TrendingUp,
  Users,
  Loader2,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  RefreshCw,
  Globe,
  Megaphone,
  BarChart3,
  Zap,
} from 'lucide-react';
import {
  useGrowthDashboard,
  useLandingPages,
  useTasks,
  useAgents,
} from '@/lib/api/hooks';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import { TrustBanner } from '@/components/trust-banner';
import { SetupChecklist } from '@/components/setup-checklist';

export default function DashboardPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const [isRunning, setIsRunning] = useState(false);

  const { data: growthData, isLoading } = useGrowthDashboard(companyId);
  const { data: pages } = useLandingPages(companyId);
  const { data: tasksData } = useTasks(companyId);
  const { data: agents } = useAgents(companyId);

  const allPages = pages || [];
  const allTasks = tasksData?.data || [];
  const allAgents = agents || [];

  // Stats
  const pagesCreated = allPages.length;
  const pagesPublished = allPages.filter((p) => p.status === 'published').length;
  const pagesDraft = allPages.filter((p) => p.status === 'draft' || p.status === 'ready').length;
  const tasksCompleted = allTasks.filter((t) => t.status === 'completed').length;
  const tasksRunning = allTasks.filter((t) => t.status === 'in_progress').length;
  const tasksPending = allTasks.filter((t) => t.status === 'pending').length;
  const tasksFailed = allTasks.filter((t) => t.status === 'failed').length;
  const activeAgents = allAgents.length; // Total agents (ready + running)

  // Determine next action
  const getNextAction = () => {
    if (pagesCreated === 0) {
      return {
        title: 'Create your first landing pages',
        description: 'AI will generate SEO-optimized pages for your business automatically.',
        cta: 'Generate Pages',
        action: () => router.push(`/${companyId}/landing-pages?action=generate`),
        icon: Sparkles,
        color: 'from-purple-500 to-pink-500',
      };
    }
    if (pagesDraft > 0 && pagesPublished === 0) {
      return {
        title: `${pagesDraft} pages ready to publish`,
        description: 'Your pages have been created. Publish them to start getting traffic from Google.',
        cta: 'Review & Publish',
        action: () => router.push(`/${companyId}/landing-pages`),
        icon: Globe,
        color: 'from-green-500 to-emerald-500',
      };
    }
    if (pagesPublished > 0 && tasksRunning > 0) {
      return {
        title: 'AI is working on your pages',
        description: `${tasksRunning} task${tasksRunning > 1 ? 's' : ''} in progress right now.`,
        cta: 'View Progress',
        action: () => router.push(`/${companyId}/landing-pages`),
        icon: TrendingUp,
        color: 'from-blue-500 to-cyan-500',
      };
    }
    if (tasksPending > 0) {
      return {
        title: `${tasksPending} tasks queued`,
        description: `AI has ${tasksPending} pending tasks. They will run automatically.`,
        cta: 'View Tasks',
        action: () => router.push(`/${companyId}/landing-pages`),
        icon: Clock,
        color: 'from-amber-500 to-orange-500',
      };
    }
    if (pagesPublished > 0) {
      return {
        title: 'Create more content to grow faster',
        description: 'More pages = more keywords = more traffic. Generate additional pages to expand your reach.',
        cta: 'Generate More Pages',
        action: () => router.push(`/${companyId}/landing-pages?action=generate`),
        icon: Rocket,
        color: 'from-orange-500 to-red-500',
      };
    }
    return {
      title: 'Start growing your business',
      description: 'AI will create content, optimize SEO, and drive traffic automatically.',
      cta: 'Get Started',
      action: () => router.push(`/${companyId}/landing-pages?action=generate`),
      icon: Sparkles,
      color: 'from-primary to-purple-500',
    };
  };

  // Run growth engine
  const handleRunEngine = useCallback(async () => {
    if (!token || isRunning) return;
    setIsRunning(true);
    try {
      await api.post('/ftux/execute', {
        companyId,
        goal: 'Optimize existing pages, create new content, and improve search rankings',
      }, { token });
      toast.success('AI Growth Engine activated!');
    } catch {
      toast.error('Failed to start engine');
    } finally {
      setIsRunning(false);
    }
  }, [token, companyId, isRunning]);

  // Recent activity from tasks
  const recentActivity = allTasks
    .filter((t) => t.status === 'completed' || t.status === 'in_progress')
    .slice(0, 5);

  const nextAction = getNextAction();
  const NextIcon = nextAction.icon;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-muted-foreground">Loading your growth dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Hero: Growth Progress */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold">Grow your business automatically</h1>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleRunEngine}
            disabled={isRunning}
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {isRunning ? 'Running...' : 'Run AI Engine'}
          </Button>
        </div>
        <p className="text-muted-foreground mb-4">
          {growthData?.companyName || 'Your business'} — AI is working for you
        </p>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pagesCreated}</p>
                  <p className="text-xs text-muted-foreground">Pages Created</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-50 rounded-lg">
                  <Globe className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pagesPublished}</p>
                  <p className="text-xs text-muted-foreground">Published</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{tasksCompleted}</p>
                  <p className="text-xs text-muted-foreground">Tasks Done</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-50 rounded-lg">
                  <Users className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeAgents}</p>
                  <p className="text-xs text-muted-foreground">AI Workers</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Data Trust Banner */}
      <TrustBanner variant="full" />

      {/* Setup Progress Banner */}
      <SetupChecklist variant="banner" />

      {/* Next Action — THE most important card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="overflow-hidden border-2 border-primary/20">
          <CardContent className="p-0">
            <div className="flex flex-col md:flex-row">
              <div className="flex-1 p-6">
                <Badge variant="secondary" className="mb-3 text-xs">Recommended Next Step</Badge>
                <h2 className="text-xl font-semibold mb-2">{nextAction.title}</h2>
                <p className="text-muted-foreground mb-4">{nextAction.description}</p>
                <Button
                  onClick={nextAction.action}
                  className={`gap-2 bg-gradient-to-r ${nextAction.color} text-white border-0`}
                  size="lg"
                >
                  <NextIcon className="w-5 h-5" />
                  {nextAction.cta}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
              <div className={`w-full md:w-48 bg-gradient-to-br ${nextAction.color} flex items-center justify-center p-8 md:p-0`}>
                <NextIcon className="w-16 h-16 text-white/30" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* AI Activity Feed */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">AI Activity</h3>
          <div className="flex gap-2">
            {tasksRunning > 0 && (
              <Badge variant="outline" className="gap-1 text-blue-600 border-blue-300">
                <RefreshCw className="w-3 h-3 animate-spin" />
                {tasksRunning} running
              </Badge>
            )}
            {tasksPending > 0 && tasksRunning === 0 && (
              <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
                <Clock className="w-3 h-3" />
                {tasksPending} queued
              </Badge>
            )}
          </div>
        </div>
        <Card>
          <CardContent className="p-0 divide-y">
            {recentActivity.length > 0 ? (
              recentActivity.map((task, i) => {
                const nextAction = getTaskNextAction(task, companyId);
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 p-4 ${nextAction && task.status === 'completed' ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
                    onClick={nextAction && task.status === 'completed' ? () => router.push(nextAction.href) : undefined}
                  >
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.status === 'completed' ? 'Completed' : 'Working...'}
                      </p>
                    </div>
                    {nextAction && task.status === 'completed' && (
                      <span className="text-xs text-primary font-medium shrink-0 flex items-center gap-1">
                        {nextAction.label} <ArrowRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center">
                <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">AI will show activity here once started</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Links */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="grid grid-cols-3 gap-3">
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push(`/${companyId}/landing-pages`)}
          >
            <CardContent className="pt-5 pb-5 text-center">
              <FileText className="w-6 h-6 text-blue-500 mx-auto mb-2" />
              <p className="text-sm font-medium">My Pages</p>
              <p className="text-xs text-muted-foreground">{pagesCreated} pages</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push(`/${companyId}/marketing`)}
          >
            <CardContent className="pt-5 pb-5 text-center">
              <Megaphone className="w-6 h-6 text-orange-500 mx-auto mb-2" />
              <p className="text-sm font-medium">My Ads</p>
              <p className="text-xs text-muted-foreground">Campaigns</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push(`/${companyId}/analytics`)}
          >
            <CardContent className="pt-5 pb-5 text-center">
              <BarChart3 className="w-6 h-6 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-medium">Analytics</p>
              <p className="text-xs text-muted-foreground">Traffic & rankings</p>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}

// Map task type → user-friendly next action
function getTaskNextAction(task: any, companyId: string): { label: string; cta: string; href: string } | null {
  const type = task.type || '';
  const title = (task.title || '').toLowerCase();

  if (type === 'generate_page_content' || type === 'create_landing_page' || title.includes('landing page') || title.includes('content'))
    return { label: 'Review your page', cta: 'View', href: `/${companyId}/landing-pages` };

  if (type === 'optimize_page_seo' || type === 'seo_audit' || title.includes('seo'))
    return { label: 'Check SEO results', cta: 'View', href: `/${companyId}/analytics` };

  if (type === 'publish_page' || title.includes('publish'))
    return { label: 'See your live page', cta: 'View', href: `/${companyId}/landing-pages` };

  if (title.includes('social') || title.includes('post') || type === 'create_social_post')
    return { label: 'Review social posts', cta: 'View', href: `/${companyId}/marketing` };

  if (title.includes('campaign') || title.includes('marketing') || title.includes('email'))
    return { label: 'See your campaigns', cta: 'View', href: `/${companyId}/marketing` };

  if (title.includes('keyword') || title.includes('research'))
    return { label: 'View keywords', cta: 'View', href: `/${companyId}/analytics` };

  if (title.includes('detect social') || title.includes('crawl'))
    return { label: 'View what AI learned', cta: 'View', href: `/${companyId}/knowledge` };

  return null;
}
