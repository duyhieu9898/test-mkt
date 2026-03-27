'use client';

import { motion } from 'framer-motion';
import { Rocket, Search, FileText, Share2, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExecutionTriggerViewProps {
  companyName: string;
  onExecute: () => void;
  isExecuting: boolean;
}

export function ExecutionTriggerView({
  companyName,
  onExecute,
  isExecuting,
}: ExecutionTriggerViewProps) {
  const engines = [
    { icon: Search, label: 'SEO Engine', desc: 'Optimize and track rankings' },
    { icon: FileText, label: 'Content Engine', desc: 'Create SEO articles and pages' },
    { icon: Share2, label: 'Social Engine', desc: 'Schedule and post content' },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg text-center"
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary to-purple-500 mb-6"
        >
          <Rocket className="w-10 h-10 text-white" />
        </motion.div>

        <h2 className="text-3xl font-bold mb-3">Ready to launch?</h2>
        <p className="text-muted-foreground text-lg mb-8">
          Your AI team will start executing the growth plan for {companyName}
        </p>

        {/* What will happen */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-3 mb-10"
        >
          {engines.map((engine, i) => (
            <motion.div
              key={engine.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-left"
            >
              {isExecuting ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              ) : (
                <engine.icon className="w-5 h-5 text-primary shrink-0" />
              )}
              <div>
                <p className="font-medium text-sm">{engine.label}</p>
                <p className="text-xs text-muted-foreground">{engine.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Button
            onClick={onExecute}
            disabled={isExecuting}
            size="lg"
            className="gap-2 px-10 py-7 text-xl bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 shadow-xl hover:shadow-2xl transition-all"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Activating AI Team...
              </>
            ) : (
              <>
                <Rocket className="w-6 h-6" />
                Start Growing My Company
              </>
            )}
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 text-sm text-muted-foreground"
        >
          Your AI agents will begin working autonomously
        </motion.p>
      </motion.div>
    </div>
  );
}
