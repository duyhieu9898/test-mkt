/**
 * Langfuse singleton — LLM observability (W0.3 / ADR-01).
 *
 * Self-hosted at http://localhost:5050 in dev. Powers the "Why this
 * output?" drill-down by capturing every LLM call with prompt, model,
 * temperature, token counts, sources, and step timings.
 *
 * See docs/architecture/06-transparent-data-system.md ADR-01 for the
 * architectural decision to use Langfuse instead of custom lineage tables.
 */

import { Langfuse } from 'langfuse';
import { env } from './env';

let instance: Langfuse | null = null;
let warned = false;

export function getLangfuse(): Langfuse | null {
  if (instance) return instance;
  if (!env.LANGFUSE_ENABLED) return null;
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY || !env.LANGFUSE_BASE_URL) {
    if (!warned) {
      console.warn('[langfuse] LANGFUSE_ENABLED=true but keys/base URL are incomplete; observability disabled.');
      warned = true;
    }
    return null;
  }
  try {
    instance = new Langfuse({
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      baseUrl: env.LANGFUSE_BASE_URL,
    });
    return instance;
  } catch (err) {
    if (!warned) {
      console.warn('[langfuse] SDK not available, observability disabled:', err);
      warned = true;
    }
    return null;
  }
}

/**
 * Build a trace inspector URL for a given Langfuse trace id. The
 * frontend "Why this output?" button opens this URL in a new tab.
 */
export function getTraceUrl(traceId: string): string {
  // Langfuse UI path for trace inspection
  return `${env.LANGFUSE_BASE_URL}/project/1person-main/traces/${traceId}`;
}
