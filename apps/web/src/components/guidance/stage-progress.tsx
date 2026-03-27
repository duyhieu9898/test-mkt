'use client';

import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Lightbulb,
  Wrench,
  Rocket,
  TrendingUp,
  Settings,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import type { PlaybookProgress } from '@/lib/api/hooks';

interface StageProgressProps {
  progress: PlaybookProgress | null;
}

const stages = [
  { id: 'idea', name: 'Idea', icon: Lightbulb, color: '#f59e0b' },
  { id: 'mvp', name: 'MVP', icon: Wrench, color: '#3b82f6' },
  { id: 'launch', name: 'Launch', icon: Rocket, color: '#ef4444' },
  { id: 'growth', name: 'Growth', icon: TrendingUp, color: '#10b981' },
  { id: 'optimize', name: 'Optimize', icon: Settings, color: '#8b5cf6' },
];

export function StageProgress({ progress }: StageProgressProps) {
  if (!progress) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <p className="text-sm">No playbook active</p>
      </div>
    );
  }

  const currentStageIndex = stages.findIndex((s) => s.id === progress.currentStage);
  const currentStageData = progress.stageProgress[progress.currentStage];
  const stagePercent = currentStageData?.progress || 0;

  return (
    <div className="space-y-4">
      {/* Current Stage Info */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Current Stage</p>
          <h3 className="font-semibold text-lg capitalize">{progress.currentStage}</h3>
        </div>
        <Badge variant="outline" className="text-sm">
          {progress.overallProgress}% complete
        </Badge>
      </div>

      {/* Overall Progress */}
      <Progress value={progress.overallProgress} className="h-2" />

      {/* Stage Timeline */}
      <div className="flex items-center justify-between mt-6">
        {stages.map((stage, index) => {
          const isCompleted = index < currentStageIndex;
          const isCurrent = stage.id === progress.currentStage;
          const isPending = index > currentStageIndex;
          const Icon = stage.icon;

          return (
            <div key={stage.id} className="flex items-center">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.1 }}
                className="flex flex-col items-center"
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isCurrent
                      ? 'ring-2 ring-offset-2'
                      : 'bg-muted text-muted-foreground'
                  }`}
                  style={{
                    backgroundColor: isCurrent ? `${stage.color}20` : undefined,
                    '--tw-ring-color': isCurrent ? stage.color : undefined,
                    color: isCurrent ? stage.color : undefined,
                  } as React.CSSProperties}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={`text-xs mt-2 font-medium ${
                    isCurrent ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {stage.name}
                </span>
                {isCurrent && (
                  <span className="text-[10px] text-muted-foreground">
                    {stagePercent}%
                  </span>
                )}
              </motion.div>

              {/* Connector line */}
              {index < stages.length - 1 && (
                <div
                  className={`h-0.5 w-8 mx-1 ${
                    isCompleted ? 'bg-green-500' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Current Stage Details */}
      {progress.currentStageDetails && (
        <div className="mt-6 p-4 rounded-lg bg-muted/50">
          <h4 className="font-medium text-sm mb-2">
            {progress.currentStageDetails.name}
          </h4>
          <p className="text-sm text-muted-foreground mb-3">
            {progress.currentStageDetails.description}
          </p>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              Tasks: {currentStageData?.tasksCompleted || 0}/{currentStageData?.tasksTotal || 0}
            </span>
            <span>
              Milestones: {currentStageData?.milestonesAchieved?.length || 0}/
              {progress.currentStageDetails.milestones?.length || 0}
            </span>
            <span>~{progress.currentStageDetails.estimatedDays} days</span>
          </div>
        </div>
      )}
    </div>
  );
}
