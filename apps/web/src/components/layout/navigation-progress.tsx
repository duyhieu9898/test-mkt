'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const NAVIGATION_START_EVENT = 'app:navigation-start';

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function getInternalNavigationTarget(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return null;
  }
  if (anchor.target && anchor.target !== '_self') return null;

  try {
    const target = new URL(href, window.location.href);
    if (target.origin !== window.location.origin) return null;

    const current = `${window.location.pathname}${window.location.search}`;
    const next = `${target.pathname}${target.search}`;
    if (current === next) return null;
    return next;
  } catch {
    return null;
  }
}

export function notifyNavigationStart() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NAVIGATION_START_EVENT));
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = useMemo(
    () => `${pathname}?${searchParams?.toString() ?? ''}`,
    [pathname, searchParams],
  );
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (safetyTimerRef.current) window.clearTimeout(safetyTimerRef.current);
      hideTimerRef.current = null;
      safetyTimerRef.current = null;
    };

    const start = () => {
      clearTimers();
      setVisible(true);
      // In local dev, a page can compile slowly. This prevents a stuck indicator
      // if a navigation is cancelled or blocked by another overlay.
      safetyTimerRef.current = window.setTimeout(() => setVisible(false), 12000);
    };

    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || isModifiedClick(event)) return;
      const target = event.target instanceof Element
        ? event.target.closest('a[href]')
        : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (target.dataset.navigationProgress === 'off') return;
      if (!getInternalNavigationTarget(target)) return;
      start();
    };

    window.addEventListener(NAVIGATION_START_EVENT, start);
    document.addEventListener('click', handleClick, true);
    return () => {
      clearTimers();
      window.removeEventListener(NAVIGATION_START_EVENT, start);
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setVisible(false), 220);
  }, [routeKey, visible]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80]" aria-live="polite" aria-label="Loading next page">
      <div className="h-1 overflow-hidden bg-violet-100">
        <div className="h-full w-1/2 animate-navigation-progress rounded-r-full bg-gradient-to-r from-violet-600 via-indigo-500 to-sky-400" />
      </div>
      <div className="absolute right-4 top-3 hidden items-center gap-2 rounded-full border border-violet-100 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur sm:flex">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
        Opening page...
      </div>
    </div>
  );
}
