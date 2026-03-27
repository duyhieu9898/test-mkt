'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, Rocket, Globe, ArrowRight, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { InputType } from '@/lib/ftux/types';

interface LandingHeroProps {
  onSubmit: (prompt: string, websiteUrl?: string) => void;
  isProcessing: boolean;
}

type UserPath = null | 'beginner' | 'advanced';

function detectIsUrl(input: string): boolean {
  return /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(input.trim());
}

export function LandingHero({ onSubmit, isProcessing }: LandingHeroProps) {
  const [path, setPath] = useState<UserPath>(null);
  const [prompt, setPrompt] = useState('');

  const isUrl = useMemo(() => detectIsUrl(prompt), [prompt]);

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (trimmed.length < 5) return;

    if (isUrl || path === 'advanced') {
      const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      onSubmit(`Analyze and grow this business: ${url}`, url);
    } else {
      onSubmit(trimmed);
    }
  }, [prompt, isUrl, path, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = prompt.trim().length >= 5 && !isProcessing;

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
                How would you like to start?
              </h2>
              <p className="text-muted-foreground mb-8">
                AI will handle everything — just tell us where you are
              </p>

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
                  <h3 className="font-semibold text-lg mb-1">I'm starting fresh</h3>
                  <p className="text-sm text-muted-foreground">
                    Describe your idea and AI will create everything — pages, content, marketing plan
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
                  <h3 className="font-semibold text-lg mb-1">I have a website</h3>
                  <p className="text-sm text-muted-foreground">
                    Paste your URL and AI will analyze it, find improvements, and grow your traffic
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
                  ? 'Describe your business idea'
                  : 'Paste your website URL'}
              </h2>
              <p className="text-muted-foreground mb-6">
                {path === 'beginner'
                  ? 'AI will create landing pages, content, and a growth plan automatically'
                  : 'AI will crawl your site, audit SEO, and create an improvement plan'}
              </p>

              {/* Input */}
              <div className="mb-4">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    path === 'beginner'
                      ? 'e.g. A fitness coaching platform for busy professionals...'
                      : 'e.g. kidleaderhub.com'
                  }
                  className="min-h-[100px] text-lg p-4 resize-none border-2 focus:border-primary/50 transition-colors"
                  disabled={isProcessing}
                />
                {prompt.length > 0 && (
                  <div className="flex justify-end mt-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      isUrl ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                    }`}>
                      {isUrl ? '🌐 Website detected' : '💡 Business idea'}
                    </span>
                  </div>
                )}
              </div>

              {/* Example suggestions */}
              {prompt.length === 0 && (
                <div className="flex flex-wrap gap-2 justify-center mb-6">
                  {path === 'beginner'
                    ? ['AI content agency', 'Fitness coaching platform', 'Online education startup'].map((ex) => (
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
                  ← Back
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
                      Building...
                    </>
                  ) : (
                    <>
                      {path === 'advanced' ? <Globe className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                      {path === 'advanced' ? 'Analyze & Grow' : 'Create My Business'}
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
          AI creates pages, writes content, and drives traffic — automatically
        </motion.p>
      </motion.div>
    </div>
  );
}
