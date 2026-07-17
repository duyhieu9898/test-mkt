'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TourStep {
  target: string;
  title: string;
  description: string;
  path?: string;
}

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const tourSteps: TourStep[] = [
  {
    target: 'dashboard-menu',
    title: 'Start with the big picture',
    description: 'Dashboard shows what is happening in this company: priorities, progress, AI team activity, and the next useful thing to do.',
  },
  {
    target: 'walkthrough-menu',
    title: 'Use the setup guide',
    description: 'Walkthrough turns the product into a simple checklist, so you know where to start and what to set up first.',
  },
  {
    target: 'walkthrough-quick-start',
    path: '/walkthrough',
    title: 'Follow Quick Start',
    description: 'This checklist helps you get real value quickly: add knowledge, review your brand, create a page, and connect the tools AI needs.',
  },
  {
    target: 'knowledge-menu',
    path: '/walkthrough',
    title: 'Teach AI your business',
    description: 'Knowledge Hub is where you add product details, FAQs, documents, offers, and internal notes that AI should trust.',
  },
  {
    target: 'brain-hub-menu',
    path: '/walkthrough',
    title: 'See what AI has learned',
    description: 'Brain Hub shows the sources, signals, and business context AI is using, so recommendations stay grounded in your real company.',
  },
  {
    target: 'landing-pages-menu',
    path: '/walkthrough',
    title: 'Create a page to send customers to',
    description: 'Landing Pages helps you build a focused public page for an offer, campaign, product, or lead generation without needing a developer.',
  },
  {
    target: 'market-menu',
    path: '/walkthrough',
    title: 'Understand competitors and demand',
    description: 'Market & Competitors helps AI compare your business with the market, spot gaps, and find opportunities worth acting on.',
  },
  {
    target: 'ceo-advisor-menu',
    title: 'Ask for strategic next steps',
    description: 'CEO Advisor reads your company context, knowledge, campaigns, blogs, and market signals, then suggests the highest-impact actions.',
  },
  {
    target: 'campaign-launcher-menu',
    title: 'Turn strategy into a campaign',
    description: 'Campaign Launcher creates a practical marketing package from your inputs: blog content, social posts, banners, and campaign assets.',
  },
  {
    target: 'analytics-menu',
    title: 'Measure what is working',
    description: 'Analytics helps you see performance after campaigns and pages go live, so you can improve based on results instead of guessing.',
  },
];

function visibleTarget(target: string): HTMLElement | null {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-guided-tour="${target}"]`),
  );
  return elements.find((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }) ?? null;
}

function rectFromElement(element: HTMLElement): HighlightRect {
  const rect = element.getBoundingClientRect();
  const margin = 5;
  const top = Math.max(6, rect.top - margin);
  const left = Math.max(6, rect.left - margin);
  const right = Math.min(window.innerWidth - 6, rect.right + margin);
  const bottom = Math.min(window.innerHeight - 6, rect.bottom + margin);
  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    right,
    bottom,
  };
}

export function CompanyGuidedTour() {
  const params = useParams<{ companyId?: string }>();
  const companyId = params.companyId;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [highlight, setHighlight] = useState<HighlightRect | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [mounted, setMounted] = useState(false);
  const scrolledStep = useRef<number | null>(null);
  const initializedCompany = useRef<string | null>(null);
  const autoNavigatedStep = useRef<number | null>(null);
  const pendingTourPath = useRef<string | null>(null);
  const previousPath = useRef<string | null>(null);
  const step = tourSteps[stepIndex];
  const storageKey = companyId ? `1person:company-tour:v1:${companyId}` : null;

  const persist = useCallback((nextStep: number, isActive: boolean) => {
    if (!storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify({
      active: isActive,
      completed: !isActive,
      step: nextStep,
    }));
  }, [storageKey]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const finish = useCallback(() => {
    autoNavigatedStep.current = null;
    pendingTourPath.current = null;
    setActive(false);
    setTransitioning(false);
    setHighlight(null);
    persist(tourSteps.length - 1, false);
    window.dispatchEvent(new Event('guided-tour:close-sidebar'));
  }, [persist]);

  useEffect(() => {
    const restartTour = () => {
      scrolledStep.current = null;
      autoNavigatedStep.current = null;
      pendingTourPath.current = null;
      previousPath.current = pathname;
      setTransitioning(false);
      setHighlight(null);
      setStepIndex(0);
      setActive(true);
      persist(0, true);
    };
    window.addEventListener('guided-tour:restart', restartTour);
    return () => window.removeEventListener('guided-tour:restart', restartTour);
  }, [pathname, persist]);

  useEffect(() => {
    if (active && companyId) {
      router.prefetch(`/${companyId}/walkthrough`);
    }
  }, [active, companyId, router]);

  useEffect(() => {
    if (!companyId || !storageKey) return;
    if (initializedCompany.current === companyId) return;
    initializedCompany.current = companyId;

    if (searchParams.get('tour') === '1') {
      setStepIndex(0);
      setActive(true);
      persist(0, true);
      window.history.replaceState({}, '', pathname);
      return;
    }

    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null') as {
        active?: boolean;
        step?: number;
      } | null;
      if (saved?.active && typeof saved.step === 'number' && saved.step < tourSteps.length) {
        setStepIndex(saved.step);
        setActive(true);
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [companyId, pathname, persist, searchParams, storageKey]);

  useEffect(() => {
    if (!active || !companyId || !step?.path) return;
    if (autoNavigatedStep.current === stepIndex) return;
    const expectedPath = `/${companyId}${step.path}`;
    if (pathname !== expectedPath) {
      autoNavigatedStep.current = stepIndex;
      pendingTourPath.current = expectedPath;
      router.push(expectedPath);
      return;
    }
    autoNavigatedStep.current = stepIndex;
  }, [active, companyId, pathname, router, step, stepIndex]);

  useEffect(() => {
    if (!active) {
      previousPath.current = pathname;
      return;
    }

    const previous = previousPath.current;
    if (previous === null) {
      previousPath.current = pathname;
      return;
    }
    if (previous === pathname) return;

    previousPath.current = pathname;

    if (pendingTourPath.current === pathname) {
      pendingTourPath.current = null;
      return;
    }

    finish();
  }, [active, finish, pathname]);

  useEffect(() => {
    if (!active || !step) {
      setHighlight(null);
      return;
    }

    let sidebarRequested = false;
    const locate = () => {
      const target = visibleTarget(step.target);
      if (!target) {
        setHighlight(null);
        if (!sidebarRequested && step.target.endsWith('-menu')) {
          sidebarRequested = true;
          window.dispatchEvent(new Event('guided-tour:open-sidebar'));
        }
        return;
      }

      if (scrolledStep.current !== stepIndex) {
        scrolledStep.current = stepIndex;
        target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      }
      setHighlight(rectFromElement(target));
      setTransitioning(false);
    };

    locate();
    const timer = window.setInterval(locate, 250);
    window.addEventListener('resize', locate);
    window.addEventListener('scroll', locate, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', locate);
      window.removeEventListener('scroll', locate, true);
    };
  }, [active, step, stepIndex]);

  const tooltipStyle = useMemo(() => {
    if (!highlight || !mounted) return {};
    const estimatedHeight = 230;
    const gap = 14;
    const preferLeft = step?.target === 'walkthrough-quick-start'
      && highlight.left >= 240;
    const width = preferLeft
      ? Math.min(260, highlight.left - gap - 12)
      : Math.min(340, window.innerWidth - 24);
    let left: number;
    let top: number;

    if (preferLeft) {
      left = highlight.left - gap - width;
      top = Math.min(
        Math.max(12, highlight.top),
        window.innerHeight - estimatedHeight - 12,
      );
    } else if (highlight.right + gap + width <= window.innerWidth - 12) {
      left = highlight.right + gap;
      top = Math.min(highlight.top, window.innerHeight - estimatedHeight - 12);
    } else if (highlight.bottom + gap + estimatedHeight <= window.innerHeight - 12) {
      left = Math.min(Math.max(12, highlight.left), window.innerWidth - width - 12);
      top = highlight.bottom + gap;
    } else {
      left = Math.min(Math.max(12, highlight.left), window.innerWidth - width - 12);
      top = Math.max(12, highlight.top - estimatedHeight - gap);
    }

    return { width, left: Math.max(12, left), top: Math.max(12, top) };
  }, [highlight, mounted, step]);

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, finish]);

  const next = useCallback(() => {
    if (stepIndex >= tourSteps.length - 1) {
      finish();
      return;
    }
    const nextStep = stepIndex + 1;
    const nextConfig = tourSteps[nextStep];
    const nextPath = nextConfig?.path ? `/${companyId}${nextConfig.path}` : null;
    setTransitioning(Boolean(nextPath && pathname !== nextPath));
    setHighlight(null);
    autoNavigatedStep.current = null;
    setStepIndex(nextStep);
    persist(nextStep, true);
  }, [companyId, finish, pathname, persist, stepIndex]);

  if (!mounted || !active || !step || !companyId) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100]" role="dialog" aria-label="Getting started tour">
      <div className="absolute inset-0 pointer-events-none" />

      {highlight && !transitioning ? (
        <div
          className="pointer-events-none fixed rounded-lg border-2 border-violet-500 shadow-[0_0_0_9999px_rgba(15,23,42,0.58)] transition-all duration-200"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
          }}
        />
      ) : (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-slate-950/55">
          <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-xl">
            <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
            {transitioning ? 'Opening Walkthrough...' : 'Preparing the next guide step...'}
          </div>
        </div>
      )}

      {highlight && !transitioning && (
        <div
          className="pointer-events-auto fixed rounded-lg bg-white p-5 shadow-2xl"
          style={tooltipStyle}
        >
          <button
            type="button"
            aria-label="Skip guided tour"
            onClick={finish}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>

          <p className="text-xs font-semibold text-violet-600">
            Step {stepIndex + 1} of {tourSteps.length}
            <span className="ml-2 font-normal text-slate-400">
              {tourSteps.length - stepIndex - 1} remaining
            </span>
          </p>
          <h2 className="mt-2 pr-7 text-lg font-semibold text-slate-900">{step.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={finish}
              className="text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              Skip tour
            </button>
            <Button onClick={next} className="gap-2 bg-violet-600 hover:bg-violet-700">
              {stepIndex === tourSteps.length - 1 ? (
                <>
                  Finish <Check className="h-4 w-4" />
                </>
              ) : (
                <>
                  Next <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
