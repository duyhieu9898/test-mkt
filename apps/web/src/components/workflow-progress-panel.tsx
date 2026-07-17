'use client';

/**
 * WorkflowProgressPanel — the "I can see it running" UI (W1B.4).
 *
 * Shows each generation step flipping from pending → running → done
 * in real time as the backend publishes SSE events. This is the
 * end-user visibility requirement from docs 06/07 — if they can't
 * see it, they don't trust it.
 */

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Circle, XCircle } from 'lucide-react';

type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

interface StepState {
  key: string;
  label: string;
  description: string;
  status: StepStatus;
  startedAt?: number;
  durationMs?: number;
  error?: string;
}

/**
 * Canonical step order for the campaign generation flow. The backend
 * emits events with these exact keys (see `routes/campaigns.ts`).
 */
const GENERATE_STEPS: Omit<StepState, 'status'>[] = [
  { key: 'create_campaign', label: 'Creating campaign', description: 'Setting up the campaign shell' },
  { key: 'build_business_context', label: 'Reading your business', description: 'Loading brand, products, audience context' },
  { key: 'generate_banners', label: 'Designing banners', description: 'AI creates 3 banner variants with different angles' },
  { key: 'generate_social_posts', label: 'Writing social posts', description: 'AI writes 3 posts tailored to your audience' },
  { key: 'finalize_ready', label: 'Ready for review', description: 'Campaign ready — you can review and launch' },
];

const LAUNCH_STEPS: Omit<StepState, 'status'>[] = [
  { key: 'launch_campaign', label: 'Starting launch', description: 'Preparing to publish assets' },
  { key: 'publish_banners', label: 'Publishing banners', description: 'Activating banner assets' },
  { key: 'schedule_posts', label: 'Scheduling posts', description: 'Queuing social posts for publishing' },
];

interface Props {
  companyId: string;
  campaignId: string;
  token: string;
  /** Which flow to track: 'generate' (default) or 'launch' */
  flow?: 'generate' | 'launch';
  /** Called when the whole flow reaches finalize_ready or fails */
  onTerminal?: (outcome: 'ready' | 'failed') => void;
}

export function WorkflowProgressPanel({ companyId, campaignId, token, flow = 'generate', onTerminal }: Props) {
  const steps_config = flow === 'launch' ? LAUNCH_STEPS : GENERATE_STEPS;
  const terminalStep = flow === 'launch' ? 'launch_campaign' : 'finalize_ready';
  const [steps, setSteps] = useState<StepState[]>(() =>
    steps_config.map((s, index) => ({
      ...s,
      // Launch is optimistically visible before the API round-trip finishes.
      // Marking the first step as running gives immediate, truthful feedback.
      status: flow === 'launch' && index === 0 ? 'running' : 'pending',
    })),
  );
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
    // EventSource doesn't support custom headers — we pass the token
    // as a query param and the backend auth middleware accepts it.
    // (If the middleware only reads headers, see fallback below.)
    const url = `${apiBase}/campaigns/${companyId}/${campaignId}/stream?token=${encodeURIComponent(token)}`;

    let es: EventSource | null = null;
    try {
      es = new EventSource(url, { withCredentials: false });
    } catch (err) {
      setConnectionError('Unable to open live stream');
      return;
    }

    es.addEventListener('campaign:step', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as {
          step: string;
          status: 'started' | 'completed' | 'failed';
          durationMs?: number;
          error?: string;
        };
        setSteps((prev) => {
          const next = prev.map((s) => {
            if (s.key !== data.step) return s;
            if (data.status === 'started') {
              return { ...s, status: 'running' as StepStatus, startedAt: Date.now() };
            }
            if (data.status === 'completed') {
              return { ...s, status: 'completed' as StepStatus, durationMs: data.durationMs };
            }
            if (data.status === 'failed') {
              return { ...s, status: 'failed' as StepStatus, error: data.error };
            }
            return s;
          });

          // Notify terminal
          if (data.status === 'completed' && data.step === terminalStep) {
            onTerminal?.('ready');
          }
          if (data.status === 'failed') {
            onTerminal?.('failed');
          }
          return next;
        });
      } catch {
        // ignore malformed events
      }
    });

    es.onerror = () => {
      setConnectionError('Lost connection to progress stream');
    };

    return () => {
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, campaignId, token]);

  const summary = useMemo(() => {
    const done = steps.filter((s) => s.status === 'completed').length;
    const failed = steps.some((s) => s.status === 'failed');
    return { done, total: steps.length, failed };
  }, [steps]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-900">
            {flow === 'launch' ? 'AI is launching your campaign' : 'AI is building your campaign'}
          </h3>
          <p className="text-sm text-slate-600">
            {summary.failed
              ? 'Something went wrong — see details below'
              : summary.done === summary.total
              ? 'All steps complete'
              : `${summary.done} of ${summary.total} steps complete`}
          </p>
        </div>
        {summary.failed ? (
          <XCircle className="w-6 h-6 text-red-500" />
        ) : summary.done === summary.total ? (
          <CheckCircle2 className="w-6 h-6 text-green-500" />
        ) : (
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        )}
      </div>

      {connectionError && (
        <div className="mb-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
          {connectionError}
        </div>
      )}

      <ol className="space-y-3">
        {steps.map((step, idx) => (
          <li key={step.key} className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {step.status === 'completed' && (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
              {step.status === 'running' && (
                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
              )}
              {step.status === 'pending' && (
                <Circle className="w-5 h-5 text-slate-300" />
              )}
              {step.status === 'failed' && (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={
                    step.status === 'completed'
                      ? 'font-medium text-slate-900'
                      : step.status === 'running'
                      ? 'font-medium text-indigo-700'
                      : step.status === 'failed'
                      ? 'font-medium text-red-700'
                      : 'font-medium text-slate-500'
                  }
                >
                  {idx + 1}. {step.label}
                </span>
                {step.status === 'completed' && step.durationMs !== undefined && (
                  <span className="text-xs text-slate-500">
                    {(step.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{step.description}</div>
              {step.error && (
                <div className="mt-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                  {step.error}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
