'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Edit3, Globe, Loader2, Save, Users, Target, Package, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { DetectedBusinessInfo, DetectedInfo, WebsiteAnalysis } from '@/lib/ftux/types';
import { appT, type AppLanguage } from '@/lib/app-language';

interface BusinessConfirmationViewProps {
  detectedInfo: DetectedInfo;
  websiteAnalysis: WebsiteAnalysis | null;
  companyName: string;
  onConfirm: () => Promise<void>;
  onSave: (details: DetectedBusinessInfo) => Promise<void>;
  isConfirming?: boolean;
  confirmError?: string | null;
  onBack: () => void;
  language?: AppLanguage;
}

export function BusinessConfirmationView({
  detectedInfo,
  websiteAnalysis,
  companyName,
  onConfirm,
  onSave,
  isConfirming = false,
  confirmError,
  onBack,
  language = 'en',
}: BusinessConfirmationViewProps) {
  const t = (key: Parameters<typeof appT>[1]) => appT(language, key);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [finalizationSeconds, setFinalizationSeconds] = useState(0);

  const businessInfo = websiteAnalysis?.businessInfo;
  const initialDetails = useMemo<DetectedBusinessInfo>(() => ({
    companyName: businessInfo?.companyName || companyName,
    industry: businessInfo?.industry || businessInfo?.market || detectedInfo.market,
    market: businessInfo?.market || detectedInfo.market,
    model: businessInfo?.model || detectedInfo.model,
    audience: businessInfo?.audience || (language === 'ja' ? '一般的な顧客' : 'General audience'),
    strategy: businessInfo?.strategy || detectedInfo.strategy,
    offerings: businessInfo?.offerings || [],
    valueProposition: businessInfo?.valueProposition || '',
  }), [businessInfo, companyName, detectedInfo, language]);
  const [details, setDetails] = useState(initialDetails);
  const [draft, setDraft] = useState(initialDetails);

  useEffect(() => {
    if (!isConfirming) {
      setFinalizationSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setFinalizationSeconds((Date.now() - startedAt) / 1000);
    }, 500);
    return () => window.clearInterval(timer);
  }, [isConfirming]);

  const estimatedProgress = useMemo(() => {
    if (finalizationSeconds < 10) return 8 + (finalizationSeconds / 10) * 24;
    if (finalizationSeconds < 28) return 32 + ((finalizationSeconds - 10) / 18) * 30;
    if (finalizationSeconds < 52) return 62 + ((finalizationSeconds - 28) / 24) * 24;
    return Math.min(94, 86 + ((finalizationSeconds - 52) / 30) * 8);
  }, [finalizationSeconds]);

  const finalizationStages = [
    {
      label: t('finalGrowthPlan'),
      detail: t('finalGrowthPlanDesc'),
      startsAt: 0,
    },
    {
      label: t('finalBrandIq'),
      detail: t('finalBrandIqDesc'),
      startsAt: 32,
    },
    {
      label: t('finalAdvisor'),
      detail: t('finalAdvisorDesc'),
      startsAt: 62,
    },
    {
      label: t('finalSave'),
      detail: t('finalSaveDesc'),
      startsAt: 86,
    },
  ];
  const activeFinalizationStage = finalizationStages.reduce(
    (active, stage, index) => estimatedProgress >= stage.startsAt ? index : active,
    0,
  );

  const startEditing = () => {
    setDraft(details);
    setSaveError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraft(details);
    setSaveError(null);
    setIsEditing(false);
  };

  const updateDraft = (field: keyof DetectedBusinessInfo, value: string | string[]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    const normalized = {
      ...draft,
      companyName: draft.companyName.trim(),
      industry: draft.industry.trim(),
      market: draft.market.trim(),
      model: draft.model.trim(),
      audience: draft.audience.trim(),
      strategy: draft.strategy.trim(),
      valueProposition: draft.valueProposition.trim(),
      offerings: draft.offerings.map((item) => item.trim()).filter(Boolean),
    };

    if (!normalized.companyName || !normalized.market || !normalized.model || !normalized.audience) {
      setSaveError(language === 'ja'
        ? '保存する前に、会社名、市場、ビジネスモデル、ターゲット顧客を入力してください。'
        : 'Add a company name, market, business model, and target audience before saving.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(normalized);
      setDetails(normalized);
      setDraft(normalized);
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : language === 'ja'
        ? '変更を保存できませんでした。もう一度お試しください。'
        : 'Could not save your changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-4"
          >
            <CheckCircle2 className="w-7 h-7 text-green-600" />
          </motion.div>
          <h2 className="text-2xl font-bold mb-2">{t('understandBusinessTitle')}</h2>
          <p className="text-muted-foreground">
            {t('understandBusinessDesc')}
          </p>
        </div>

        {/* Business Summary */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="mb-6">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold">{details.companyName}</h3>
                  {websiteAnalysis && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-medium text-muted-foreground">{t('aiConfidence')}:</span>
                      <span className={`text-xs font-bold ${
                        (websiteAnalysis as any).businessInfo?.confidence >= 0.7 ? 'text-green-600' :
                        (websiteAnalysis as any).businessInfo?.confidence >= 0.4 ? 'text-amber-600' :
                        'text-red-600'
                      }`}>
                        {Math.round(((websiteAnalysis as any).businessInfo?.confidence || 0) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={isEditing ? cancelEditing : startEditing}
                  className="gap-1"
                  disabled={isSaving}
                >
                  {isEditing ? <X className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
                  {isEditing ? t('cancel') : t('edit')}
                </Button>
              </div>

              {isEditing ? (
                <div className="space-y-5 border-t pt-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="business-company-name">{t('companyName')}</Label>
                      <Input
                        id="business-company-name"
                        value={draft.companyName}
                        onChange={(event) => updateDraft('companyName', event.target.value)}
                        disabled={isSaving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business-industry">{t('industry')}</Label>
                      <Input
                        id="business-industry"
                        value={draft.industry}
                        onChange={(event) => updateDraft('industry', event.target.value)}
                        placeholder={language === 'ja' ? '例：飲食業' : 'Example: Food and beverage'}
                        disabled={isSaving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business-market">{t('market')}</Label>
                      <Input
                        id="business-market"
                        value={draft.market}
                        onChange={(event) => updateDraft('market', event.target.value)}
                        disabled={isSaving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business-model">{t('businessModel')}</Label>
                      <Input
                        id="business-model"
                        value={draft.model}
                        onChange={(event) => updateDraft('model', event.target.value)}
                        placeholder={language === 'ja' ? '例：オンライン販売と配送' : 'Example: Online sales and delivery'}
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-audience">{t('targetAudience')}</Label>
                    <Textarea
                      id="business-audience"
                      value={draft.audience}
                      onChange={(event) => updateDraft('audience', event.target.value)}
                      placeholder={language === 'ja' ? '誰が主な顧客になりそうですか？' : 'Who is most likely to buy from you?'}
                      rows={2}
                      disabled={isSaving}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-offerings">{t('productsServices')}</Label>
                    <Textarea
                      id="business-offerings"
                      value={draft.offerings.join('\n')}
                      onChange={(event) => updateDraft('offerings', event.target.value.split('\n'))}
                      placeholder={language === 'ja'
                        ? '1行に1つずつ入力\n例：店内飲食\n宅配'
                        : 'Add one item per line\nExample: In-store dining\nHome delivery'}
                      rows={3}
                      disabled={isSaving}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-value">{t('businessValue')}</Label>
                    <Textarea
                      id="business-value"
                      value={draft.valueProposition}
                      onChange={(event) => updateDraft('valueProposition', event.target.value)}
                      placeholder={language === 'ja' ? '顧客があなたを選ぶ主な理由を説明してください。' : 'Describe the main reason customers choose you.'}
                      rows={2}
                      disabled={isSaving}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-strategy">{t('growthDirection')}</Label>
                    <Textarea
                      id="business-strategy"
                      value={draft.strategy}
                      onChange={(event) => updateDraft('strategy', event.target.value)}
                      placeholder={language === 'ja' ? '顧客を獲得し、維持するための方向性を入力してください。' : 'How should the business attract and retain customers?'}
                      rows={2}
                      disabled={isSaving}
                    />
                  </div>

                  {saveError && (
                    <p role="alert" className="text-sm text-destructive">{saveError}</p>
                  )}

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="outline" onClick={cancelEditing} disabled={isSaving}>
                      {t('cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {isSaving ? t('saving') : t('saveChanges')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start gap-3">
                      <Target className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{t('market')}</p>
                        <p className="font-medium">{details.market}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Package className="w-5 h-5 text-purple-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{t('businessModel')}</p>
                        <p className="font-medium">{details.model}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Users className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{t('targetAudience')}</p>
                        <p className="font-medium">{details.audience}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <TrendingUp className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{t('strategy')}</p>
                        <p className="font-medium">{details.strategy}</p>
                      </div>
                    </div>
                  </div>

                  {details.offerings.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">{t('coreOfferings')}</p>
                      <div className="flex flex-wrap gap-2">
                        {details.offerings.map((offering, i) => (
                          <Badge key={i} variant="secondary">{offering}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {details.valueProposition && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">{t('valueProposition')}</p>
                      <p className="text-sm">{details.valueProposition}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* SEO Score (if website was analyzed) */}
        {websiteAnalysis?.seoAudit && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-500" />
                    <h3 className="font-semibold">{t('websiteSeoScore')}</h3>
                  </div>
                  <div className={`text-2xl font-bold ${
                    websiteAnalysis.seoAudit.score >= 80 ? 'text-green-600' :
                    websiteAnalysis.seoAudit.score >= 50 ? 'text-amber-600' :
                    'text-red-600'
                  }`}>
                    {websiteAnalysis.seoAudit.score}/100
                  </div>
                </div>

                {websiteAnalysis.seoAudit.missingElements.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-red-600">{t('issuesFound')}</p>
                    {websiteAnalysis.seoAudit.missingElements.slice(0, 3).map((issue, i) => (
                      <p key={i} className="text-sm text-muted-foreground">• {issue}</p>
                    ))}
                    {websiteAnalysis.seoAudit.missingElements.length > 3 && (
                      <p className="text-sm text-muted-foreground">
                        +{websiteAnalysis.seoAudit.missingElements.length - 3} {t('moreIssues')}
                      </p>
                    )}
                  </div>
                )}

                {/* Social Profiles */}
                {websiteAnalysis.socialProfiles.some(s => s.detected) && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium mb-2">{t('socialProfilesDetected')}</p>
                    <div className="flex gap-2">
                      {websiteAnalysis.socialProfiles.filter(s => s.detected).map((profile, i) => (
                        <Badge key={i} variant="outline">{profile.platform}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {isConfirming ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border bg-white p-5 shadow-sm"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{t('preparingCompanyIntelligence')}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {t('preparingCompanyIntelligenceDesc')}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-slate-500">
                    {t('estimated')} {Math.round(estimatedProgress)}%
                  </span>
                </div>

                <Progress
                  value={estimatedProgress}
                  className="mt-4 h-2 bg-slate-100"
                  indicatorClassName="bg-indigo-600 duration-500"
                  aria-label="Estimated company intelligence preparation progress"
                />

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {finalizationStages.map((stage, index) => {
                    const completed = index < activeFinalizationStage;
                    const active = index === activeFinalizationStage;
                    return (
                      <div key={stage.label} className="flex items-start gap-2.5">
                        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                          completed
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : active
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                              : 'border-slate-200 bg-white text-slate-400'
                        }`}>
                          {completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                        </div>
                        <div>
                          <p className={`text-sm font-medium ${active ? 'text-indigo-700' : completed ? 'text-slate-700' : 'text-slate-400'}`}>
                            {stage.label}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{stage.detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="mt-5 border-t pt-3 text-xs text-muted-foreground">
                  {t('finalKeepOpen')}
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex gap-3 justify-center"
          >
            <Button variant="outline" onClick={onBack}>
              {t('startOver')}
            </Button>
            <Button
              onClick={onConfirm}
              size="lg"
              className="gap-2 bg-gradient-to-r from-primary to-purple-500"
              disabled={isEditing || isSaving}
            >
              <CheckCircle2 className="w-4 h-4" />
              {t('confirmBuildTeam')}
            </Button>
          </motion.div>
        )}
        {confirmError && (
          <p role="alert" className="mt-3 text-center text-sm text-destructive">
            {confirmError}
          </p>
        )}
      </motion.div>
    </div>
  );
}
