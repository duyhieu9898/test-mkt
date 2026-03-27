'use client';

import { motion } from 'framer-motion';
import { Bot, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { TypingText } from './typing-text';
import { ProgressStep } from './progress-step';
import type { ProcessingStep, DetectedInfo } from '@/lib/ftux/types';
import { STEP_LABELS } from '@/lib/ftux/processing-simulation';

interface ProcessingViewProps {
  userPrompt: string;
  currentStep: ProcessingStep | null;
  completedSteps: ProcessingStep[];
  detectedInfo: DetectedInfo | null;
  progress: number;
  aiThinking: string;
}

const ALL_STEPS: ProcessingStep[] = [
  'understanding',
  'analyzing_website',
  'creating_ceo',
  'creating_marketing',
  'creating_operations',
  'generating_strategy',
];

export function ProcessingView({
  userPrompt,
  currentStep,
  completedSteps,
  detectedInfo,
  progress,
  aiThinking,
}: ProcessingViewProps) {
  const getStepStatus = (step: ProcessingStep): 'pending' | 'active' | 'complete' => {
    if (completedSteps.includes(step)) return 'complete';
    if (currentStep === step) return 'active';
    return 'pending';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring' }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-500 mb-4"
          >
            <Bot className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold mb-2">Building Your AI Company...</h1>
          <p className="text-muted-foreground">
            Creating your personalized AI team
          </p>
        </div>

        {/* Main Card */}
        <Card className="border-0 shadow-xl">
          <CardContent className="p-6">
            {/* AI Thinking */}
            <div className="mb-6 p-4 rounded-lg bg-muted/50 min-h-[60px]">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary mb-1">AI is thinking...</p>
                  <p className="text-sm text-foreground">
                    <TypingText text={aiThinking || 'Analyzing your business idea...'} speed={25} />
                  </p>
                </div>
              </div>
            </div>

            {/* Detected Info */}
            {detectedInfo && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20"
              >
                <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                  Detected:
                </p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Market:</span>
                    <p className="font-medium">{detectedInfo.market}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Model:</span>
                    <p className="font-medium">{detectedInfo.model}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Strategy:</span>
                    <p className="font-medium">{detectedInfo.strategy}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Steps */}
            <div className="space-y-3">
              {ALL_STEPS.map((step, index) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <ProgressStep
                    label={STEP_LABELS[step]}
                    status={getStepStatus(step)}
                  />
                </motion.div>
              ))}
            </div>

            {/* Progress Bar */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Progress</span>
                <span className="text-sm font-medium">{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary to-purple-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User's Prompt */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 text-center"
        >
          <p className="text-sm text-muted-foreground">
            Building: <span className="text-foreground">&quot;{userPrompt}&quot;</span>
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
