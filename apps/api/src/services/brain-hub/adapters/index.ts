/**
 * Source adapter registry — Brain Hub Phase A.
 *
 * Phase A ships three adapter types:
 *   - manual_upload   (file upload → text → chunked events)
 *   - bulk_import     (pasted text or CSV → events)
 *   - internal_tap    (no adapter UI — wired directly by callers via
 *                      ingestInternalTap; this entry just provides
 *                      labels for the Sources tab)
 *
 * Phase C will add: oauth_api, webhook_inbound, polling_feed. The
 * registry shape doesn't need to change — just register new adapters.
 */
import type { BrainSourceType, EventType } from '@1person/core/db';

export interface AdapterDescriptor {
  type: BrainSourceType;
  label: string;
  description: string;
  /** Whether the user can manually create sources of this type via the Hub UI. */
  userCreatable: boolean;
  /** Default event type emitted by this adapter. */
  defaultEventType: EventType;
  /** Phase the adapter ships in (for "Coming soon" labels in the UI). */
  phase: 'A' | 'B' | 'C';
}

export const ADAPTERS: AdapterDescriptor[] = [
  {
    type: 'manual_upload',
    label: 'File upload',
    description: 'Upload PDFs, text files, markdown, or CSVs. Each file becomes one or more events.',
    userCreatable: true,
    defaultEventType: 'document',
    phase: 'A',
  },
  {
    type: 'bulk_import',
    label: 'Bulk import (paste)',
    description: 'Paste a block of text, a CSV, or a list of items. Brain Hub splits and ingests each row.',
    userCreatable: true,
    defaultEventType: 'document',
    phase: 'A',
  },
  {
    type: 'internal_tap',
    label: 'Internal tap (built-in)',
    description: 'Chatbot conversations, omnichannel inbox, lead captures, and growth-score changes flow in automatically. No setup required.',
    userCreatable: false,
    defaultEventType: 'other',
    phase: 'A',
  },
  {
    type: 'oauth_api',
    label: 'OAuth integration',
    description: 'Connect Stripe, Fireflies, Intercom, HubSpot, and friends. Coming in Phase C.',
    userCreatable: false,
    defaultEventType: 'other',
    phase: 'C',
  },
  {
    type: 'webhook_inbound',
    label: 'Webhook (inbound)',
    description: 'Any system POSTs events to your unique webhook URL. Coming in Phase C.',
    userCreatable: false,
    defaultEventType: 'other',
    phase: 'C',
  },
  {
    type: 'polling_feed',
    label: 'Polling feed',
    description: 'Google Trends, Reddit subreddits, RSS feeds, Hacker News. Coming in Phase C.',
    userCreatable: false,
    defaultEventType: 'trend',
    phase: 'C',
  },
];

export function getAdapter(type: BrainSourceType): AdapterDescriptor | undefined {
  return ADAPTERS.find((a) => a.type === type);
}
