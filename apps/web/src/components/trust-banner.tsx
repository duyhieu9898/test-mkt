'use client';

import { useParams, useRouter } from 'next/navigation';
import { Shield, ExternalLink, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface TrustBannerProps {
  variant?: 'full' | 'compact' | 'inline';
}

/**
 * TrustBanner — Shows data protection status and links to transparency tools.
 * Place this anywhere users interact with their data.
 *
 * Variants:
 * - "full": Card with explanation + 2 buttons (for Dashboard)
 * - "compact": Small bar with icon + link (for Knowledge, other pages)
 * - "inline": Single line with link (for inside other cards)
 */
export function TrustBanner({ variant = 'compact' }: TrustBannerProps) {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;

  const goToTransparency = () => router.push(`/${companyId}/ai-brain?tab=transparency`);

  const shareProofLink = () => {
    const url = `${window.location.origin}/proof/${companyId}`;
    navigator.clipboard.writeText(url);
    toast.success('Proof link copied! Share it with anyone to verify your data.');
  };

  if (variant === 'full') {
    return (
      <div className="rounded-xl border border-green-200 bg-gradient-to-r from-green-50/80 to-emerald-50/50 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-green-100 rounded-lg shrink-0">
            <Shield className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-green-900 text-sm">Your Data is Protected</p>
            <p className="text-xs text-green-700 mt-0.5">
              All data is stored separately from other companies. Every action is logged and verifiable.
            </p>
            <div className="flex gap-2 mt-2.5">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-green-300 text-green-700 hover:bg-green-50" onClick={goToTransparency}>
                <ShieldCheck className="w-3 h-3" /> View Transparency
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-green-600" onClick={shareProofLink}>
                <ExternalLink className="w-3 h-3" /> Share Proof
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50/60 border border-green-100">
        <Shield className="w-3.5 h-3.5 text-green-600 shrink-0" />
        <p className="text-xs text-green-700 flex-1">
          Your data is stored securely and separately.
        </p>
        <button
          onClick={goToTransparency}
          className="text-[10px] text-green-600 hover:text-green-800 font-medium whitespace-nowrap flex items-center gap-0.5"
        >
          Verify <ShieldCheck className="w-3 h-3" />
        </button>
        <button
          onClick={shareProofLink}
          className="text-[10px] text-green-600 hover:text-green-800 whitespace-nowrap flex items-center gap-0.5"
        >
          Share <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // inline
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-green-600">
      <Shield className="w-3 h-3" />
      <button onClick={goToTransparency} className="hover:underline">Protected & Verifiable</button>
    </span>
  );
}
