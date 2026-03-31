'use client';

import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, ArrowRight, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

interface SetupStep {
  id: string;
  label: string;
  completed: boolean;
  action: string;
}

interface SetupStatus {
  steps: SetupStep[];
  completedCount: number;
  totalCount: number;
  percentage: number;
  nextStep: SetupStep | null;
  allComplete: boolean;
}

interface SetupChecklistProps {
  variant: 'full' | 'banner';
  companyId?: string;
}

export function SetupChecklist({ variant, companyId: propCompanyId }: SetupChecklistProps) {
  const params = useParams();
  const router = useRouter();
  const companyId = propCompanyId || (params.companyId as string);
  const token = useAuthStore((state) => state.token);

  const { data: status, isLoading } = useQuery<SetupStatus>({
    queryKey: ['setup-status', companyId],
    queryFn: () => api.get(`/dashboard/company/${companyId}/setup-status`, { token: token! }),
    enabled: !!token && !!companyId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading || !status) return null;
  if (status.allComplete && variant === 'banner') return null; // Hide banner when all done

  if (variant === 'banner') {
    return (
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-purple-50/50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-4 h-4 text-primary" />
                <p className="font-medium text-sm">Setup Progress</p>
                <span className="text-xs text-muted-foreground">{status.completedCount}/{status.totalCount} complete</span>
              </div>
              <Progress value={status.percentage} className="h-2 mb-2" />
              {status.nextStep && (
                <p className="text-xs text-muted-foreground">
                  Next: <span className="font-medium text-foreground">{status.nextStep.label}</span>
                </p>
              )}
            </div>
            {status.nextStep && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1"
                onClick={() => router.push(status.nextStep!.action)}
              >
                Set up <ArrowRight className="w-3 h-3" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full variant (for FTUX / dedicated setup page)
  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className="text-center">
        <h2 className="text-xl font-bold mb-1">Set up your platform</h2>
        <p className="text-sm text-muted-foreground">Complete these steps to unlock all features</p>
        <Progress value={status.percentage} className="h-2 mt-3" />
        <p className="text-xs text-muted-foreground mt-1">{status.completedCount} of {status.totalCount} complete</p>
      </div>

      <div className="space-y-2">
        {status.steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
              step.completed
                ? 'bg-green-50/50 border-green-200'
                : 'bg-background hover:border-primary/30 cursor-pointer'
            }`}
            onClick={() => !step.completed && router.push(step.action)}
          >
            {step.completed ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-muted-foreground/30 shrink-0" />
            )}
            <span className={`text-sm flex-1 ${step.completed ? 'text-green-900' : 'font-medium'}`}>
              {step.label}
            </span>
            {!step.completed && (
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
