'use client';

/**
 * Shown when an action returns a 402 / "out of credits" error. Surfaces
 * top-up and upgrade options instead of a plain toast.
 */

import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, Mail, Wallet, Clock } from 'lucide-react';
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
  const params = useParams();
  const companyId = params?.companyId as string | undefined;

  const goCredits = () => {
    onClose();
    router.push(companyId ? `/${companyId}/settings/credits` : '/pricing');
  };

  const contactSupport = () => {
    window.location.href = 'mailto:support@1person.ai?subject=Add credits to my 1Person account';
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
                  Need more credits?
                </div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">
                  Contact support to add credits
                </div>
                <div className="text-xs text-slate-600">Online top-up will be added later.</div>
              </div>
              <Button
                size="sm"
                onClick={contactSupport}
                className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
              >
                <Mail className="w-3.5 h-3.5 mr-1" /> Contact
              </Button>
            </div>
          </div>

          <Button variant="outline" onClick={goCredits} className="w-full justify-center">
            <Wallet className="w-4 h-4 mr-2" /> View credit usage
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
