'use client';

/**
 * Shown when an action returns a 402 / "out of credits" error. Surfaces
 * top-up and upgrade options instead of a plain toast.
 */

import { useRouter } from 'next/navigation';
import { AlertCircle, Zap, ArrowUpCircle, Clock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onClose: () => void;
  required?: number;
  available?: number;
}

export function OutOfCreditsModal({ open, onClose, required, available }: Props) {
  const router = useRouter();

  const goTopup = () => {
    onClose();
    router.push('/pricing#topup');
  };

  const goUpgrade = () => {
    onClose();
    router.push('/pricing');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-2">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <DialogTitle className="text-center text-red-700">
            You&apos;re out of credits
          </DialogTitle>
          <DialogDescription className="text-center">
            {typeof required === 'number' && typeof available === 'number' ? (
              <>
                You need <span className="font-semibold text-slate-900">{required}</span>{' '}
                credits but only have{' '}
                <span className="font-semibold text-slate-900">{available}</span>.
              </>
            ) : (
              'You don\'t have enough credits for this action.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                  Recommended
                </div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">
                  Top up 2,000 credits
                </div>
                <div className="text-xs text-slate-600">One-time purchase · $30</div>
              </div>
              <Button
                size="sm"
                onClick={goTopup}
                className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
              >
                <Zap className="w-3.5 h-3.5 mr-1" /> Top up
              </Button>
            </div>
          </div>

          <Button variant="outline" onClick={goUpgrade} className="w-full justify-center">
            <ArrowUpCircle className="w-4 h-4 mr-2" /> Or upgrade your plan
          </Button>

          <div className="flex items-center gap-2 text-xs text-slate-500 justify-center pt-1">
            <Clock className="w-3.5 h-3.5" />
            Or wait for your monthly reset
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="w-full">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
