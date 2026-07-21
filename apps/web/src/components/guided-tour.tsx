'use client';

/**
 * First-time guided tour for /campaigns.
 *
 * Shows 3 sequential coach marks pointing at key UI elements, helping
 * non-technical users understand the product on first visit. Dismissed
 * state persists in localStorage so the tour appears only once.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Brain, Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/lib/api/hooks';
import { appT, normalizeAppLanguage, type AppMessageKey } from '@/lib/app-language';

const STORAGE_KEY = '1person.tour.campaigns.dismissed';

interface Step {
  titleKey: AppMessageKey;
  bodyKey: AppMessageKey;
  icon: React.ReactNode;
  // Absolute position on screen (bottom-right style coach mark)
  position: { top?: string; left?: string; right?: string; bottom?: string };
  arrow?: 'up' | 'down' | 'left' | 'right';
}

const STEPS: Step[] = [
  {
    titleKey: 'campaignsTourCreateTitle',
    bodyKey: 'campaignsTourCreateDesc',
    icon: <Sparkles className="w-5 h-5 text-indigo-500" />,
    position: { top: '5.5rem', right: '1.5rem' },
    arrow: 'up',
  },
  {
    titleKey: 'campaignsTourBrainTitle',
    bodyKey: 'campaignsTourBrainDesc',
    icon: <Brain className="w-5 h-5 text-indigo-500" />,
    position: { top: '12rem', left: '17rem' },
    arrow: 'left',
  },
  {
    titleKey: 'campaignsTourTrustTitle',
    bodyKey: 'campaignsTourTrustDesc',
    icon: <Shield className="w-5 h-5 text-indigo-500" />,
    position: { top: '19rem', left: '17rem' },
    arrow: 'left',
  },
];

export function GuidedTour() {
  const params = useParams<{ companyId?: string }>();
  const companyId = typeof params?.companyId === 'string' ? params.companyId : '';
  const { data: company } = useCompany(companyId);
  const language = normalizeAppLanguage(company?.settings?.language);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setMounted(true);
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) {
        // Small delay so the page renders first
        const t = setTimeout(() => setVisible(true), 600);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage blocked (SSR, private mode) — skip tour
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    setVisible(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  };

  if (!mounted || !visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Soft backdrop — clicks pass through to let users explore */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-[1px] z-40 pointer-events-none"
          />

          {/* Coach mark bubble */}
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={current.position}
            className="fixed z-50 w-[20rem] max-w-[calc(100vw-2rem)] rounded-xl bg-white shadow-2xl border border-slate-200 p-5"
          >
            <button
              onClick={dismiss}
              aria-label={appT(language, 'tourSkip')}
              className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                {current.icon}
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <h3 className="font-semibold text-slate-900 text-sm">{appT(language, current.titleKey)}</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{appT(language, current.bodyKey)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
              <div className="flex gap-1.5">
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      i === step ? 'bg-indigo-500' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {!isLast && (
                  <button
                    onClick={dismiss}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    {appT(language, 'tourSkipAll')}
                  </button>
                )}
                <Button
                  size="sm"
                  onClick={next}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white h-7 text-xs px-3"
                >
                  {isLast ? appT(language, 'tourGotIt') : appT(language, 'tourNext')}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
