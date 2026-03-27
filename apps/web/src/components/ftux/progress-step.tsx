'use client';

import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type StepStatus = 'pending' | 'active' | 'complete';

interface ProgressStepProps {
  label: string;
  status: StepStatus;
  detail?: string;
}

export function ProgressStep({ label, status, detail }: ProgressStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-start gap-3"
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5">
        {status === 'complete' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"
          >
            <Check className="w-3 h-3 text-white" />
          </motion.div>
        )}
        {status === 'active' && (
          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
            <Loader2 className="w-3 h-3 text-white animate-spin" />
          </div>
        )}
        {status === 'pending' && (
          <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1">
        <p
          className={cn(
            'text-sm font-medium transition-colors',
            status === 'complete' && 'text-green-600 dark:text-green-400',
            status === 'active' && 'text-foreground',
            status === 'pending' && 'text-muted-foreground'
          )}
        >
          {label}
        </p>
        {detail && status === 'complete' && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="text-xs text-muted-foreground mt-0.5"
          >
            {detail}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
