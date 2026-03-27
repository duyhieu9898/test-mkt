'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { GuidanceItemComponent } from './guidance-item';
import { StageProgress } from './stage-progress';
import {
  useGuidance,
  useOnboardingProgress,
  usePlaybookProgress,
  useCompleteGuidance,
  useDismissGuidance,
} from '@/lib/api/hooks';
import {
  Compass,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  Target,
  Sparkles,
} from 'lucide-react';

interface CEOGuidanceWidgetProps {
  companyId: string;
}

export function CEOGuidanceWidget({ companyId }: CEOGuidanceWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAllGuidance, setShowAllGuidance] = useState(false);

  const { data: guidance, isLoading: guidanceLoading } = useGuidance(companyId);
  const { data: onboardingProgress, isLoading: progressLoading } = useOnboardingProgress(companyId);
  const { data: playbookProgress, isLoading: playbookLoading } = usePlaybookProgress(companyId);

  const completeGuidance = useCompleteGuidance();
  const dismissGuidance = useDismissGuidance();

  const isLoading = guidanceLoading || progressLoading || playbookLoading;
  const activeGuidance = guidance?.filter((g) => g.status === 'pending' || g.status === 'shown') || [];
  const displayedGuidance = showAllGuidance ? activeGuidance : activeGuidance.slice(0, 3);

  const handleComplete = async (guidanceId: string) => {
    try {
      await completeGuidance.mutateAsync(guidanceId);
    } catch (error) {
      console.error('Failed to complete guidance:', error);
    }
  };

  const handleDismiss = async (guidanceId: string) => {
    try {
      await dismissGuidance.mutateAsync(guidanceId);
    } catch (error) {
      console.error('Failed to dismiss guidance:', error);
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-primary/5 via-purple-500/5 to-pink-500/5 border-primary/20">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  // If no guidance or playbook, show minimal card
  if (!activeGuidance.length && !playbookProgress) {
    return null;
  }

  const percentComplete = onboardingProgress?.percentComplete || 0;

  return (
    <Card className="bg-gradient-to-br from-primary/5 via-purple-500/5 to-pink-500/5 border-primary/20 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Compass className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Getting Started</CardTitle>
              <p className="text-xs text-muted-foreground">
                Your step-by-step guide to success
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{percentComplete}%</span>
              <div className="w-24">
                <Progress value={percentComplete} className="h-2" />
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <CardContent className="pt-4 space-y-6">
              {/* Playbook Stage Progress */}
              {playbookProgress && (
                <div className="p-4 rounded-lg bg-background/50 border">
                  <div className="flex items-center gap-2 mb-4">
                    <Target className="w-4 h-4 text-primary" />
                    <h3 className="font-medium text-sm">Business Stage</h3>
                    {playbookProgress.playbook && (
                      <Badge variant="outline" className="text-xs ml-auto">
                        {playbookProgress.playbook.name}
                      </Badge>
                    )}
                  </div>
                  <StageProgress progress={playbookProgress} />
                </div>
              )}

              {/* Guidance Items */}
              {activeGuidance.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h3 className="font-medium text-sm">Next Steps</h3>
                    <Badge variant="secondary" className="text-xs">
                      {activeGuidance.length} remaining
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                      {displayedGuidance.map((item) => (
                        <GuidanceItemComponent
                          key={item.id}
                          item={item}
                          onComplete={handleComplete}
                          onDismiss={handleDismiss}
                          isLoading={completeGuidance.isPending || dismissGuidance.isPending}
                        />
                      ))}
                    </AnimatePresence>
                  </div>

                  {activeGuidance.length > 3 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-3 text-xs"
                      onClick={() => setShowAllGuidance(!showAllGuidance)}
                    >
                      {showAllGuidance
                        ? 'Show less'
                        : `Show ${activeGuidance.length - 3} more`}
                      {showAllGuidance ? (
                        <ChevronUp className="w-3 h-3 ml-1" />
                      ) : (
                        <ChevronDown className="w-3 h-3 ml-1" />
                      )}
                    </Button>
                  )}
                </div>
              )}

              {/* Completed State */}
              {activeGuidance.length === 0 && percentComplete >= 100 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-6"
                >
                  <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">All set!</h3>
                  <p className="text-sm text-muted-foreground">
                    You've completed all the getting started steps.
                  </p>
                </motion.div>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
