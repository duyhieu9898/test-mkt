/**
 * Pre-seeded watcher templates — what every B2B founder gets out of
 * the box. Phase A internal taps (chatbot, omnichannel, leads) light
 * these up immediately; the trend-spike watchers wait for Phase C
 * polling sources but ship paused so the founder can see them in the
 * UI as "coming soon".
 */
import type {
  NewBrainWatcher,
  WatcherCondition,
  WatcherActionTemplate,
} from '@1person/core/db';

export interface DefaultWatcherTemplate {
  slug: string;
  name: string;
  description: string;
  condition: WatcherCondition;
  actions: WatcherActionTemplate[];
  cooldownHours: number;
  autoMode: 'review' | 'auto_high_conf';
  /** Default ON for Phase A taps; OFF for ones that need Phase C data. */
  enabledByDefault: boolean;
}

export const DEFAULT_WATCHERS: DefaultWatcherTemplate[] = [
  {
    slug: 'recurring_question',
    name: 'Recurring customer question',
    description:
      'Detects when the same topic comes up in ≥3 chatbot or Messenger conversations within a week. Drafts a chatbot FAQ answer and a blog post for review.',
    condition: {
      kind: 'recurring_topic',
      minOccurrences: 3,
      windowHours: 168,
      sentiment: 'question',
      sourceSubtypes: ['chatbot_message', 'omnichannel_message'],
    },
    actions: [
      { type: 'chatbot_faq_draft' },
      { type: 'blog_draft_launcher', params: { tone: 'explainer' } },
    ],
    cooldownHours: 168,
    autoMode: 'review',
    enabledByDefault: true,
  },
  {
    slug: 'sales_objection_cluster',
    name: 'Sales objection cluster',
    description:
      'Spots ≥3 events where prospects raise the same objection in the last 30 days. Drafts a comparison or counter-narrative blog post.',
    condition: {
      kind: 'recurring_topic',
      minOccurrences: 3,
      windowHours: 720,
      sentiment: 'objection',
    },
    actions: [
      { type: 'blog_draft_launcher', params: { tone: 'comparison' } },
      { type: 'chatbot_faq_draft' },
    ],
    cooldownHours: 168,
    autoMode: 'review',
    enabledByDefault: true,
  },
  {
    slug: 'customer_praise',
    name: 'Praise candidate (case-study fodder)',
    description:
      'Surfaces messages where customers spontaneously praise the product — great seed for testimonials, case studies, and LinkedIn posts.',
    condition: {
      kind: 'recurring_topic',
      minOccurrences: 1,
      windowHours: 168,
      sentiment: 'praise',
    },
    actions: [{ type: 'notify' }],
    cooldownHours: 24,
    autoMode: 'review',
    enabledByDefault: true,
  },
  {
    slug: 'lead_spike',
    name: 'Lead spike',
    description:
      '≥5 lead captures in 24 hours — surface the source so you can amplify what is working.',
    condition: {
      kind: 'event_spike',
      minCount: 5,
      windowHours: 24,
      type: 'lead',
    },
    actions: [{ type: 'notify' }],
    cooldownHours: 24,
    autoMode: 'review',
    enabledByDefault: true,
  },
  {
    slug: 'churn_risk_language',
    name: 'Churn-risk language',
    description:
      'Detects "cancel", "switch", "downgrade", "refund" in inbound messages so you can act before they leave.',
    condition: {
      kind: 'keyword_match',
      phrases: ['cancel', 'cancellation', 'switch to', 'downgrade', 'refund', 'leave'],
      minMatches: 1,
      windowHours: 24,
    },
    actions: [{ type: 'notify' }],
    cooldownHours: 1,
    autoMode: 'review',
    enabledByDefault: true,
  },
  {
    slug: 'competitor_mention',
    name: 'Competitor mentioned by prospect',
    description:
      'Inbound message names a competitor (configurable phrases). Drafts a "vs competitor" comparison page.',
    condition: {
      kind: 'keyword_match',
      // Founder edits this in UI — defaults are placeholders to make
      // the watcher discoverable, not opinionated about who you compete with.
      phrases: ['compared to', 'vs ', 'instead of', 'cheaper than'],
      minMatches: 1,
      windowHours: 168,
    },
    actions: [{ type: 'blog_draft_launcher', params: { tone: 'comparison' } }],
    cooldownHours: 168,
    autoMode: 'review',
    enabledByDefault: false, // founder should edit phrases first
  },
  {
    slug: 'icp_signal',
    name: 'High-fit lead (ICP signal)',
    description:
      'A lead with job title matching CTO / Head of Engineering / VP Sales / CMO lands — drafts a personalized outreach note.',
    condition: {
      kind: 'keyword_match',
      // Matches against the lead event subject which contains job title.
      phrases: ['CTO', 'Head of Engineering', 'VP Sales', 'VP of Engineering', 'CMO', 'Founder'],
      minMatches: 1,
      windowHours: 24,
    },
    actions: [{ type: 'notify' }],
    cooldownHours: 12,
    autoMode: 'review',
    enabledByDefault: true,
  },
  // ── Phase C teasers (shipped paused) ─────────────────────────────
  {
    slug: 'trend_spike',
    name: 'Trend spike (Phase C)',
    description:
      'When a polling feed (Google Trends, Reddit, HN) reports a topic score ≥80, draft blog + LinkedIn. Activates once you connect a polling source.',
    condition: {
      kind: 'event_spike',
      minCount: 1,
      windowHours: 24,
      type: 'trend',
    },
    actions: [{ type: 'blog_draft_launcher', params: { tone: 'newsjack' } }],
    cooldownHours: 48,
    autoMode: 'review',
    enabledByDefault: false,
  },
  {
    slug: 'competitor_announce',
    name: 'Competitor announces something (Phase C)',
    description:
      'Polled competitor RSS / news mentions "launched" or "raised" — draft a counter-narrative blog.',
    condition: {
      kind: 'keyword_match',
      phrases: ['launched', 'raised $', 'announces', 'introduces'],
      minMatches: 1,
      windowHours: 48,
    },
    actions: [{ type: 'blog_draft_launcher', params: { tone: 'thought-leadership' } }],
    cooldownHours: 72,
    autoMode: 'review',
    enabledByDefault: false,
  },
  {
    slug: 'geo_citation_spike',
    name: 'New GEO citation (Phase C)',
    description:
      'A page on your domain was newly cited by ChatGPT / Claude / Perplexity. Surfaces the win + suggests amplification (LinkedIn pin, social).',
    condition: {
      kind: 'event_spike',
      minCount: 1,
      windowHours: 168,
      type: 'mention',
    },
    actions: [{ type: 'notify' }],
    cooldownHours: 24,
    autoMode: 'review',
    enabledByDefault: false,
  },
];

export function templateToWatcher(
  companyId: string,
  tpl: DefaultWatcherTemplate,
): NewBrainWatcher {
  return {
    companyId,
    slug: tpl.slug,
    name: tpl.name,
    description: tpl.description,
    condition: tpl.condition,
    actions: tpl.actions,
    cooldownHours: tpl.cooldownHours,
    autoMode: tpl.autoMode,
    status: tpl.enabledByDefault ? 'active' : 'paused',
  };
}
