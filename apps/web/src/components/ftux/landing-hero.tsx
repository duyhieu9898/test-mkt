'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, Rocket, Globe, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  APP_LANGUAGES,
  APP_LANGUAGE_LABELS,
  appT,
  normalizeAppLanguage,
  type AppLanguage,
} from '@/lib/app-language';

interface LandingHeroProps {
  onSubmit: (prompt: string, websiteUrl?: string, language?: AppLanguage) => void;
  isProcessing: boolean;
}

type UserPath = null | 'beginner' | 'advanced';
const MIN_BUSINESS_DESCRIPTION_LENGTH = 10;

function detectIsUrl(input: string): boolean {
  return /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(input.trim());
}

export function LandingHero({ onSubmit, isProcessing }: LandingHeroProps) {
  const [path, setPath] = useState<UserPath>(null);
  const [prompt, setPrompt] = useState('');
  const [language, setLanguage] = useState<AppLanguage>('en');
  const t = useCallback((key: Parameters<typeof appT>[1]) => appT(language, key), [language]);

  const isUrl = useMemo(() => detectIsUrl(prompt), [prompt]);
  const trimmedLength = prompt.trim().length;
  const isWebsiteInput = isUrl || path === 'advanced';
  const isInputValid = isWebsiteInput
    ? trimmedLength >= 5
    : trimmedLength >= MIN_BUSINESS_DESCRIPTION_LENGTH;
  const beginnerExamples = language === 'ja'
    ? ['AIコンテンツ制作会社', 'フィットネスコーチング', 'オンライン教育サービス']
    : language === 'vi'
      ? ['Agency nội dung AI', 'Nền tảng coaching fitness', 'Startup giáo dục online']
      : ['AI content agency', 'Fitness coaching platform', 'Online education startup'];

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!isInputValid) return;

    if (isWebsiteInput) {
      const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      onSubmit(`Analyze and grow this business: ${url}`, url, language);
    } else {
      onSubmit(trimmed, undefined, language);
    }
  }, [prompt, isInputValid, isWebsiteInput, language, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = isInputValid && !isProcessing;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl text-center"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-purple-500 mb-3">
            <Rocket className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">1Person</h1>
        </motion.div>

        {/* Path Selection OR Input */}
        <AnimatePresence mode="wait">
          {path === null ? (
            /* Step 1: Choose path */
            <motion.div
              key="path-select"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-xl md:text-2xl font-semibold mb-2">
                {t('welcomeStartTitle')}
              </h2>
              <p className="text-muted-foreground mb-8">
                {t('welcomeStartSubtitle')}
              </p>

              <div className="mx-auto mb-6 flex max-w-xs items-center justify-center gap-2">
                <span className="text-sm text-muted-foreground">{t('language')}</span>
                <Select value={language} onValueChange={(value) => setLanguage(normalizeAppLanguage(value))}>
                  <SelectTrigger className="h-9 w-36 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APP_LANGUAGES.map((item: AppLanguage) => (
                      <SelectItem key={item} value={item}>
                        {APP_LANGUAGE_LABELS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Beginner */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setPath('beginner')}
                  className="p-6 rounded-xl border-2 border-transparent hover:border-primary/30 bg-card hover:bg-primary/5 transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">{t('startingFresh')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('startingFreshDesc')}
                  </p>
                </motion.button>

                {/* Advanced */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setPath('advanced')}
                  className="p-6 rounded-xl border-2 border-transparent hover:border-primary/30 bg-card hover:bg-primary/5 transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-4">
                    <Globe className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">{t('haveWebsite')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('haveWebsiteDesc')}
                  </p>
                </motion.button>
              </div>
            </motion.div>
          ) : (
            /* Step 2: Input */
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <h2 className="text-xl md:text-2xl font-semibold mb-2">
                {path === 'beginner'
                  ? t('describeBusinessIdea')
                  : t('pasteWebsiteUrl')}
              </h2>
              <p className="text-muted-foreground mb-6">
                {path === 'beginner'
                  ? t('businessIdeaHelp')
                  : t('websiteUrlHelp')}
              </p>

              {/* Input */}
              <div className="mb-4">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    path === 'beginner'
                      ? t('businessIdeaPlaceholder')
                      : t('websiteUrlPlaceholder')
                  }
                  className="min-h-[100px] text-lg p-4 resize-none border-2 focus:border-primary/50 transition-colors"
                  disabled={isProcessing}
                />
                {prompt.length > 0 && (
                  <div className="mt-2 flex items-start justify-between gap-3">
                    {!isWebsiteInput && trimmedLength < MIN_BUSINESS_DESCRIPTION_LENGTH ? (
                      <p className="text-left text-xs text-red-600">
                        {t('addMoreBusinessDetail')}
                        {' '}({MIN_BUSINESS_DESCRIPTION_LENGTH - trimmedLength} {t('moreCharacters')}).
                      </p>
                    ) : (
                      <span />
                    )}
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      isUrl ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                    }`}>
                      {isUrl ? `🌐 ${t('websiteDetected')}` : `💡 ${t('businessIdea')}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Example suggestions */}
              {prompt.length === 0 && (
                <div className="flex flex-wrap gap-2 justify-center mb-6">
                  {path === 'beginner'
                    ? beginnerExamples.map((ex) => (
                        <button
                          key={ex}
                          onClick={() => setPrompt(ex)}
                          className="px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {ex}
                        </button>
                      ))
                    : ['kidleaderhub.com', 'stripe.com', 'notion.so'].map((ex) => (
                        <button
                          key={ex}
                          onClick={() => setPrompt(ex)}
                          className="px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {ex}
                        </button>
                      ))}
                </div>
              )}

              {/* CTA */}
              <div className="flex items-center gap-3 justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setPath(null); setPrompt(''); }}
                  disabled={isProcessing}
                >
                  ← {t('back')}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  size="lg"
                  className="gap-2 px-8 bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 shadow-lg"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {t('building')}
                    </>
                  ) : (
                    <>
                      {path === 'advanced' ? <Globe className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                      {path === 'advanced' ? t('analyzeAndGrow') : t('createMyBusiness')}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-10 text-xs text-muted-foreground"
        >
          {language === 'ja'
            ? 'AIがページ作成、コンテンツ制作、集客を自動で支援します'
            : language === 'vi'
              ? 'AI tự tạo trang, viết nội dung và hỗ trợ tăng traffic'
              : 'AI creates pages, writes content, and drives traffic automatically'}
        </motion.p>
      </motion.div>
    </div>
  );
}
