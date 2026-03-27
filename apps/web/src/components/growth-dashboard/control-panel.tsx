'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  RefreshCw,
  Rocket,
  Loader2,
} from 'lucide-react';

interface ControlPanelProps {
  onGenerateContent?: () => void;
  onOptimizePages?: () => void;
  onDeployUpdates?: () => void;
  onRunOrchestrator?: () => void;
  isGenerating?: boolean;
  isOptimizing?: boolean;
  isDeploying?: boolean;
  isOrchestrating?: boolean;
  disabled?: boolean;
}

export function ControlPanel({
  onGenerateContent,
  onOptimizePages,
  onDeployUpdates,
  onRunOrchestrator,
  isGenerating,
  isOptimizing,
  isDeploying,
  isOrchestrating,
  disabled,
}: ControlPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 mb-6 flex-wrap"
    >
      {/* Primary action: Run AI Orchestrator */}
      {onRunOrchestrator && (
        <Button
          onClick={onRunOrchestrator}
          disabled={disabled || isOrchestrating}
          className="gap-2 bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90"
        >
          {isOrchestrating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Rocket className="w-4 h-4" />
          )}
          {isOrchestrating ? 'AI Running...' : 'Run AI Growth Engine'}
        </Button>
      )}

      <Button
        onClick={onGenerateContent}
        disabled={disabled || isGenerating}
        className="gap-2"
        variant="outline"
      >
        {isGenerating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        Generate Content
      </Button>

      <Button
        onClick={onOptimizePages}
        disabled={disabled || isOptimizing}
        className="gap-2"
        variant="outline"
      >
        {isOptimizing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
        Optimize Pages
      </Button>

      <Button
        onClick={onDeployUpdates}
        disabled={disabled || isDeploying}
        className="gap-2"
        variant="outline"
      >
        {isDeploying ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Rocket className="w-4 h-4" />
        )}
        Deploy Updates
      </Button>
    </motion.div>
  );
}
