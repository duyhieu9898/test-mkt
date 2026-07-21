'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useFTUXStore } from '@/stores/ftux-store';
import { useAuthStore } from '@/stores/auth-store';
import { LandingHero } from '@/components/ftux/landing-hero';
import { ProcessingView } from '@/components/ftux/processing-view';
import { BusinessConfirmationView } from '@/components/ftux/business-confirmation-view';
import { OrgChartView } from '@/components/ftux/org-chart-view';
import { MasterPlanView } from '@/components/ftux/master-plan-view';
import { ExecutionTriggerView } from '@/components/ftux/execution-trigger-view';
import { CelebrationView } from '@/components/ftux/celebration-view';
import { SetupChecklist } from '@/components/setup-checklist';
import { Button } from '@/components/ui/button';
import { STEP_LABELS } from '@/lib/ftux/processing-simulation';
import { appT, type AppLanguage } from '@/lib/app-language';
import { api } from '@/lib/api/client';
import type {
  DetectedBusinessInfo,
  ProcessingStep,
  FTUXAgent,
  FTUXStrategy,
  MasterPlan,
  WebsiteAnalysis,
} from '@/lib/ftux/types';

interface FTUXStatusResponse {
  status: 'processing' | 'complete' | 'error';
  currentStep: ProcessingStep | null;
  completedSteps: ProcessingStep[];
  progress: number;
  detectedInfo: {
    market: string;
    model: string;
    strategy: string;
    businessType: string;
  } | null;
  websiteAnalysis: WebsiteAnalysis | null;
  masterPlan: MasterPlan | null;
  results: {
    companyId: string;
    companyName: string;
    agentIds: string[];
    strategyId: string | null;
  } | null;
  error: string | null;
}

interface AgentResponse {
  id: string;
  name: string;
  role: string;
  title: string;
  description: string;
  capabilities: string[];
  color: string;
  supervisorId: string | null;
}

export default function FTUXWelcomePage() {
  const {
    step,
    setStep,
    userPrompt,
    setUserPrompt,
    setInputType,
    setWebsiteUrl,
    isProcessing,
    processingStep,
    completedSteps,
    progress,
    aiThinking,
    detectedInfo,
    websiteAnalysis,
    setWebsiteAnalysis,
    masterPlan,
    setMasterPlan,
    company,
    agents,
    setAgents,
    strategy,
    startProcessing,
    updateProcessingStep,
    completeProcessingStep,
    setAiThinking,
    setProgress,
    setDetectedInfo,
    updateBusinessDetails,
    setResults,
    startExecution,
    reset,
  } = useFTUXStore();

  const router = useRouter();
  const processingRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizationError, setFinalizationError] = useState<string | null>(null);
  const [isApprovingPlan, setIsApprovingPlan] = useState(false);
  const [planApprovalError, setPlanApprovalError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>('en');
  const token = useAuthStore((state) => state.token);
  const t = useCallback((key: Parameters<typeof appT>[1]) => appT(selectedLanguage, key), [selectedLanguage]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!token) {
      router.push('/login');
    }
  }, [token, router]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Poll backend status - REAL progress, not fake animation
  const pollStatus = useCallback(async (sessionId: string, language: AppLanguage = selectedLanguage) => {
    if (!token) return;
    const localT = (key: Parameters<typeof appT>[1]) => appT(language, key);

    // Map backend steps to thinking text
    const stepThinkingMap: Record<string, string> = {
      understanding: localT('stepUnderstanding'),
      analyzing_website: localT('stepAnalyzingWebsite'),
      creating_ceo: localT('stepCreatingCeo'),
      creating_marketing: localT('stepCreatingMarketing'),
      creating_operations: localT('stepCreatingOperations'),
      generating_strategy: localT('stepGeneratingStrategy'),
      setting_up_brand: localT('stepSettingUpBrand'),
    };

    let consecutivePollFailures = 0;

    pollingRef.current = setInterval(async () => {
      try {
        const status = await api.get<FTUXStatusResponse>(
          `/ftux/status/${sessionId}`,
          { token }
        );
        consecutivePollFailures = 0;

        // Update real step
        if (status.currentStep) {
          updateProcessingStep(status.currentStep);
          setAiThinking(stepThinkingMap[status.currentStep] || `${STEP_LABELS[status.currentStep] || status.currentStep}...`);
        }

        // Update real progress
        setProgress(status.progress);

        // Update completed steps
        for (const s of status.completedSteps) {
          if (!completedSteps.includes(s)) {
            completeProcessingStep(s);
          }
        }

        // Update detected info
        if (status.detectedInfo) {
          setDetectedInfo(status.detectedInfo);
        }

        // Handle completion
        if (status.status === 'complete' && status.results) {
          if (pollingRef.current) clearInterval(pollingRef.current);

          // Store website analysis and master plan
          if (status.websiteAnalysis) setWebsiteAnalysis(status.websiteAnalysis);
          if (status.masterPlan) setMasterPlan(status.masterPlan);

          // Fetch agents
          const agentsResponse = await api.get<{ data: AgentResponse[] }>(
            `/agents?companyId=${status.results.companyId}`,
            { token }
          );

          const ftuxAgents: FTUXAgent[] = agentsResponse.data.map((agent) => ({
            id: agent.id,
            name: agent.name,
            role: agent.role,
            title: agent.title,
            color: agent.color,
            emoji: getRoleEmoji(agent.role),
            supervisorId: agent.supervisorId || undefined,
            responsibilities: agent.capabilities || [],
          }));

          const ftuxStrategy: FTUXStrategy = {
            vision: selectedLanguage === 'ja' ? 'AI生成の成長プラン' : 'AI-generated growth plan',
            days: [],
          };

          setResults(
            {
              id: status.results.companyId,
              name: status.results.companyName,
              slug: status.results.companyName.toLowerCase().replace(/\s+/g, '-'),
            },
            ftuxAgents,
            ftuxStrategy,
            status.masterPlan || undefined,
            status.websiteAnalysis || undefined
          );

          // Move to business confirmation
          setTimeout(() => setStep('business-confirmation'), 500);
          processingRef.current = false;
        }

        // Handle error
        if (status.status === 'error') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setError(status.error || (language === 'ja' ? '処理に失敗しました' : 'Processing failed'));
          processingRef.current = false;
        }
      } catch (err) {
        console.error('Polling error:', err);
        consecutivePollFailures += 1;
        if (consecutivePollFailures >= 3) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setError(err instanceof Error ? err.message : language === 'ja'
            ? 'オンボーディング状況を読み取れませんでした'
            : 'Could not read onboarding status');
          processingRef.current = false;
        }
      }
    }, 1500); // Poll every 1.5 seconds
  }, [
    token,
    completedSteps,
    updateProcessingStep,
    setAiThinking,
    setProgress,
    completeProcessingStep,
    setDetectedInfo,
    setWebsiteAnalysis,
    setMasterPlan,
    setResults,
    setStep,
    selectedLanguage,
  ]);

  // Handle prompt submission
  const handlePromptSubmit = useCallback(async (prompt: string, url?: string, language?: AppLanguage) => {
    if (processingRef.current || !token) return;
    processingRef.current = true;
    const contentLanguage = language ?? 'en';
    setSelectedLanguage(contentLanguage);

    setUserPrompt(prompt);
    if (url) {
      setWebsiteUrl(url);
      setInputType('url');
    }
    startProcessing();
    setError(null);

    try {
      const response = await api.post<{ sessionId: string; status: string }>('/ftux/process', {
        prompt,
        websiteUrl: url,
        websiteOption: url ? 'has_website' : 'new_business',
        language: contentLanguage,
      }, { token });

      // Start polling real backend status
      pollStatus(response.sessionId, contentLanguage);
    } catch (err) {
      console.error('FTUX start error:', err);
      setError(err instanceof Error ? err.message : contentLanguage === 'ja'
        ? '処理を開始できませんでした'
        : 'Failed to start processing');
      processingRef.current = false;
    }
  }, [token, setUserPrompt, setWebsiteUrl, setInputType, startProcessing, pollStatus]);

  // Handle business confirmation
  const handleBusinessConfirm = useCallback(async () => {
    if (!company || !token || isFinalizing) return;

    setIsFinalizing(true);
    setFinalizationError(null);
    try {
      const result = await api.post<{
        masterPlan: MasterPlan;
        brandIqReady: boolean;
        advisorReady: boolean;
      }>('/ftux/finalize', { companyId: company.id }, { token });
      setMasterPlan(result.masterPlan);
      setStep('org-chart');
    } catch (err) {
      setFinalizationError(
        err instanceof Error
          ? err.message
          : selectedLanguage === 'ja'
            ? '会社インテリジェンスを準備できませんでした。もう一度お試しください。'
            : 'Could not prepare your company intelligence. Please try again.',
      );
    } finally {
      setIsFinalizing(false);
    }
  }, [company, isFinalizing, selectedLanguage, setMasterPlan, setStep, token]);

  const handleBusinessDetailsSave = useCallback(async (details: DetectedBusinessInfo) => {
    if (!company || !token) return;

    await api.patch(`/companies/${company.id}`, {
      name: details.companyName,
      industry: details.industry || details.market,
      businessType: details.model,
      businessPlan: {
        vision: details.strategy,
        mission: details.valueProposition,
        targetAudience: {
          demographics: [details.audience],
          painPoints: [],
        },
        valueProposition: details.valueProposition,
        revenueModel: details.model,
        competitors: [],
        suggestedAgents: [],
        offerings: details.offerings,
        growthPlan: masterPlan || undefined,
      },
    }, { token });

    updateBusinessDetails(details);
  }, [company, masterPlan, token, updateBusinessDetails]);

  // Handle org chart continue
  const handleOrgChartContinue = useCallback(() => {
    if (masterPlan) {
      setStep('master-plan');
    } else {
      setStep('execution-trigger');
    }
  }, [setStep, masterPlan]);

  // Handle master plan approval
  const handleMasterPlanApprove = useCallback(async () => {
    if (!company || !token || isApprovingPlan) return;

    setIsApprovingPlan(true);
    setPlanApprovalError(null);
    try {
      await api.post('/ftux/approve-growth-plan', { companyId: company.id }, { token });
      setStep('execution-trigger');
    } catch (err) {
      setPlanApprovalError(
        err instanceof Error ? err.message : selectedLanguage === 'ja'
          ? '成長プランを承認できませんでした。もう一度お試しください。'
          : 'Could not approve the Growth Plan. Please try again.',
      );
    } finally {
      setIsApprovingPlan(false);
    }
  }, [company, isApprovingPlan, selectedLanguage, setStep, token]);

  // Handle execution trigger
  const handleExecutionTrigger = useCallback(async () => {
    if (!company || !token) return;
    setIsExecuting(true);

    try {
      await api.post('/ftux/execute', { companyId: company.id }, { token });
      startExecution();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setStep('celebration');
    } catch (err) {
      console.error('Execution trigger failed:', err);
      setStep('celebration');
    } finally {
      setIsExecuting(false);
    }
  }, [company, token, startExecution, setStep]);

  // Reset on mount
  useEffect(() => {
    reset();
  }, [reset]);

  if (!token) return null;

  // Default master plan for display
  const displayMasterPlan: MasterPlan = masterPlan || {
    seoGrowthPlan: {
      title: selectedLanguage === 'ja' ? 'SEO成長プラン' : 'SEO Growth Plan',
      description: selectedLanguage === 'ja' ? '自然検索で見つかりやすくします' : 'Improve organic search visibility',
      items: [
        { action: selectedLanguage === 'ja' ? 'メタタグと説明文を最適化する' : 'Optimize meta tags and descriptions', timeline: selectedLanguage === 'ja' ? '1週目' : 'Week 1', expectedImpact: selectedLanguage === 'ja' ? '検索エンジンに理解されやすくなる' : 'Better search indexing', priority: 'high' },
        { action: selectedLanguage === 'ja' ? '主要サービス向けのSEOランディングページを作成する' : 'Create SEO landing pages for key services', timeline: selectedLanguage === 'ja' ? '1〜2週目' : 'Week 1-2', expectedImpact: selectedLanguage === 'ja' ? '重要な検索語句を狙える' : 'Target key search terms', priority: 'high' },
        { action: selectedLanguage === 'ja' ? '内部リンク構造を整える' : 'Build internal linking structure', timeline: selectedLanguage === 'ja' ? '2週目' : 'Week 2', expectedImpact: selectedLanguage === 'ja' ? 'サイト評価を高める' : 'Improved authority', priority: 'medium' },
      ],
    },
    contentPlan: {
      title: selectedLanguage === 'ja' ? 'コンテンツプラン' : 'Content Plan',
      description: selectedLanguage === 'ja' ? '集客と成約につながるコンテンツを作成します' : 'Create content that attracts and converts',
      items: [
        { action: selectedLanguage === 'ja' ? '主要テーマの柱となる記事を書く' : 'Write pillar articles for main topics', timeline: selectedLanguage === 'ja' ? '1〜2週目' : 'Week 1-2', expectedImpact: selectedLanguage === 'ja' ? '専門性を示す' : 'Establish authority', priority: 'high' },
        { action: selectedLanguage === 'ja' ? 'コンテンツカレンダーを作成する' : 'Create content calendar', timeline: selectedLanguage === 'ja' ? '1週目' : 'Week 1', expectedImpact: selectedLanguage === 'ja' ? '継続的に発信できる' : 'Consistent publishing', priority: 'medium' },
        { action: selectedLanguage === 'ja' ? '事例・導入ストーリーを作成する' : 'Develop case studies', timeline: selectedLanguage === 'ja' ? '2〜3週目' : 'Week 2-3', expectedImpact: selectedLanguage === 'ja' ? '信頼を高める' : 'Build trust', priority: 'medium' },
      ],
    },
    socialMediaPlan: {
      title: selectedLanguage === 'ja' ? 'SNSプラン' : 'Social Media Plan',
      description: selectedLanguage === 'ja' ? 'SNSでブランド認知を高めます' : 'Build brand awareness on social platforms',
      items: [
        { action: selectedLanguage === 'ja' ? 'SNSプロフィールを整備する' : 'Set up social media profiles', timeline: selectedLanguage === 'ja' ? '1週目' : 'Week 1', expectedImpact: selectedLanguage === 'ja' ? 'ブランドの存在感を作る' : 'Brand presence', priority: 'high' },
        { action: selectedLanguage === 'ja' ? '週3回、複数タイプの投稿を行う' : 'Post 3x/week with content mix', timeline: selectedLanguage === 'ja' ? '継続' : 'Ongoing', expectedImpact: selectedLanguage === 'ja' ? 'フォロワーを増やす' : 'Grow followers', priority: 'medium' },
        { action: selectedLanguage === 'ja' ? '業界コミュニティと交流する' : 'Engage with industry communities', timeline: selectedLanguage === 'ja' ? '継続' : 'Ongoing', expectedImpact: selectedLanguage === 'ja' ? 'ネットワークを広げる' : 'Network growth', priority: 'low' },
      ],
    },
  };

  return (
    <AnimatePresence mode="wait">
      {step === 'landing' && (
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3 }}
        >
          <LandingHero onSubmit={handlePromptSubmit} isProcessing={isProcessing} />
          {error && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg">
              {error}
            </div>
          )}
        </motion.div>
      )}

      {step === 'processing' && (
        <motion.div
          key="processing"
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3 }}
        >
          <ProcessingView
            userPrompt={userPrompt}
            currentStep={processingStep}
            completedSteps={completedSteps}
            detectedInfo={detectedInfo}
            progress={progress}
            aiThinking={aiThinking}
            error={error}
            language={selectedLanguage}
            onRetry={() => {
              if (pollingRef.current) clearInterval(pollingRef.current);
              processingRef.current = false;
              setError(null);
              reset();
              setStep('landing');
            }}
          />
        </motion.div>
      )}

      {step === 'business-confirmation' && company && detectedInfo && (
        <motion.div
          key="business-confirmation"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.3 }}
        >
          <BusinessConfirmationView
            detectedInfo={detectedInfo}
            websiteAnalysis={websiteAnalysis}
            companyName={company.name}
            onConfirm={handleBusinessConfirm}
            onSave={handleBusinessDetailsSave}
            isConfirming={isFinalizing}
            confirmError={finalizationError}
            language={selectedLanguage}
            onBack={() => {
              reset();
              setStep('landing');
            }}
          />
        </motion.div>
      )}

      {step === 'org-chart' && company && (
        <motion.div
          key="org-chart"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.3 }}
        >
          <OrgChartView
            agents={agents}
            companyId={company.id}
            companyName={company.name}
            onContinue={handleOrgChartContinue}
            onAgentsUpdated={setAgents}
            language={selectedLanguage}
          />
        </motion.div>
      )}

      {step === 'master-plan' && company && (
        <motion.div
          key="master-plan"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.3 }}
        >
          <MasterPlanView
            masterPlan={displayMasterPlan}
            companyName={company.name}
            onApprove={handleMasterPlanApprove}
            isApproving={isApprovingPlan}
            approvalError={planApprovalError}
            language={selectedLanguage}
          />
        </motion.div>
      )}

      {step === 'execution-trigger' && company && (
        <motion.div
          key="execution-trigger"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3 }}
        >
          <ExecutionTriggerView
            companyName={company.name}
            onExecute={handleExecutionTrigger}
            isExecuting={isExecuting}
            language={selectedLanguage}
          />
        </motion.div>
      )}

      {step === 'celebration' && company && (
        <motion.div
          key="celebration"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <CelebrationView
            companyId={company.id}
            companyName={company.name}
            agentCount={agents.length}
            taskCount={strategy?.days.reduce((sum, d) => sum + d.activities.length, 0) || 0}
            budget={500}
            language={selectedLanguage}
            onComplete={() => router.push(`/${company.id}?tour=1`)}
          />
        </motion.div>
      )}

      {step === 'setup' && company && (
        <motion.div
          key="setup"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <SetupChecklist variant="full" companyId={company.id} />
          <div className="text-center mt-6">
            <Button onClick={() => router.push(`/${company.id}`)}>
              {t('goToDashboard')} →
            </Button>
            <p className="text-xs text-muted-foreground mt-2">{t('completeStepsAnytime')}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function getRoleEmoji(role: string): string {
  const emojiMap: Record<string, string> = {
    ceo: '👔',
    marketing_manager: '📣',
    content_creator: '✍️',
    ads_specialist: '📈',
    analyst: '📊',
    sales_manager: '💼',
    support: '🛠️',
  };
  return emojiMap[role] || '🤖';
}
