'use client';

import { motion } from 'framer-motion';
import { Search, FileText, Share2, ArrowRight, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { MasterPlan } from '@/lib/ftux/types';

interface MasterPlanViewProps {
  masterPlan: MasterPlan;
  companyName: string;
  onApprove: () => Promise<void>;
  isApproving?: boolean;
  approvalError?: string | null;
}

const priorityColors = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-green-50 text-green-700 border-green-200',
};

const planIcons = {
  seoGrowthPlan: Search,
  contentPlan: FileText,
  socialMediaPlan: Share2,
};

const planColors = {
  seoGrowthPlan: 'from-blue-500 to-cyan-500',
  contentPlan: 'from-purple-500 to-pink-500',
  socialMediaPlan: 'from-green-500 to-emerald-500',
};

export function MasterPlanView({
  masterPlan,
  companyName,
  onApprove,
  isApproving = false,
  approvalError,
}: MasterPlanViewProps) {
  const plans = [
    { key: 'seoGrowthPlan' as const, data: masterPlan.seoGrowthPlan },
    { key: 'contentPlan' as const, data: masterPlan.contentPlan },
    { key: 'socialMediaPlan' as const, data: masterPlan.socialMediaPlan },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-5xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-primary to-purple-500 mb-4"
          >
            <Zap className="w-7 h-7 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold mb-2">Your Growth Master Plan</h2>
          <p className="text-muted-foreground">
            AI has designed a comprehensive strategy for {companyName}
          </p>
        </div>

        {/* 3 Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {plans.map(({ key, data }, index) => {
            const Icon = planIcons[key];
            const gradient = planColors[key];

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.15 }}
              >
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} mb-2`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <CardTitle className="text-lg">{data.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{data.description}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {data.items.map((item, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
                            item.priority === 'high' ? 'bg-red-500' :
                            item.priority === 'medium' ? 'bg-amber-500' :
                            'bg-green-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-tight">{item.action}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">{item.timeline}</span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${priorityColors[item.priority]}`}
                              >
                                {item.priority}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="text-center"
        >
          <Button
            onClick={onApprove}
            size="lg"
            className="gap-2 px-8 py-6 text-lg bg-gradient-to-r from-primary to-purple-500"
            disabled={isApproving}
          >
            {isApproving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {isApproving ? 'Approving plan...' : 'Approve Plan'}
            {!isApproving ? <ArrowRight className="w-5 h-5" /> : null}
          </Button>
          {approvalError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {approvalError}
            </p>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
