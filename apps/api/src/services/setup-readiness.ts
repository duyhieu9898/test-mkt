/**
 * Setup Readiness — admin-facing checklist of what config is missing so
 * the platform can actually fulfil its features. Each item is scoped to
 * one capability (LLM, image gen, Stripe, etc.), produces a
 * concrete CTA (admin link) and a brief why.
 *
 * The list is the single source of truth surfaced by:
 *   - GET /api/v1/admin/setup/readiness
 *   - Admin Setup Readiness page (/admin/setup)
 *   - Dashboard banner when overall score < 100
 *
 * Add a new check by appending to RUN_CHECKS.
 */
import { db } from '../lib/db';
import { sql } from 'drizzle-orm';

export type ReadinessStatus = 'ok' | 'warn' | 'missing';
export type ReadinessCategory =
  | 'llm'
  | 'search'
  | 'image'
  | 'video'
  | 'payments'
  | 'email'
  | 'channels'
  | 'observability';

export interface ReadinessItem {
  id: string;
  category: ReadinessCategory;
  label: string;
  status: ReadinessStatus;
  detail: string;
  /** Where in the admin UI the user should go to fix this. */
  fixHref: string;
  /** Optional doc / external link, e.g. "How to get a Meta App ID". */
  helpUrl?: string;
  /** Which platform features depend on this. */
  enables: string[];
}

export interface ReadinessReport {
  score: number; // 0-100, weighted
  items: ReadinessItem[];
  summary: {
    total: number;
    ok: number;
    warn: number;
    missing: number;
  };
  generatedAt: string;
}

// ─── Individual checks ───────────────────────────────────────────────

async function checkLLMOpenAI(): Promise<ReadinessItem> {
  const hasKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-');
  return {
    id: 'llm.openai',
    category: 'llm',
    label: 'OpenAI API key',
    status: hasKey ? 'ok' : 'missing',
    detail: hasKey
      ? 'Configured. Used as default for content generation and GEO polling.'
      : 'No OPENAI_API_KEY found. Content generation, GEO tracking, content grader all need an LLM.',
    fixHref: '/admin/llm-config',
    helpUrl: 'https://platform.openai.com/api-keys',
    enables: ['Blog generation', 'GEO tracking', 'Content Grader', 'Chatbot', 'CEO Advisor'],
  };
}

async function checkLLMAnthropic(): Promise<ReadinessItem> {
  const hasKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-');
  return {
    id: 'llm.anthropic',
    category: 'llm',
    label: 'Anthropic (Claude) API key',
    status: hasKey ? 'ok' : 'warn',
    detail: hasKey
      ? 'Configured. GEO tracker polls Claude as a second AI search engine.'
      : 'Not configured. GEO tracking only sees OpenAI/ChatGPT; missing Claude visibility.',
    fixHref: '/admin/llm-config',
    helpUrl: 'https://console.anthropic.com/settings/keys',
    enables: ['GEO tracking (Claude)', 'Fallback LLM provider'],
  };
}

async function checkImageProvider(): Promise<ReadinessItem> {
  // OpenAI key is the same one used for DALL·E 3 — if OpenAI is configured,
  // image generation works out of the box. Banana key is optional upgrade.
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasBanana = !!process.env.BANANA_API_KEY;
  const status: ReadinessStatus = hasOpenAI ? 'ok' : 'missing';
  return {
    id: 'image.provider',
    category: 'image',
    label: 'Image generation provider',
    status,
    detail: hasBanana
      ? 'DALL·E 3 + Banana configured. You have full quality tiers (Standard/Pro/Ultra).'
      : hasOpenAI
        ? 'DALL·E 3 configured. Add Banana for Pro/Ultra tiers (optional).'
        : 'No image provider configured. Banner generation will fail.',
    fixHref: '/admin/llm-config',
    enables: ['Banner generation', 'Blog cover images', 'Landing page hero images'],
  };
}

async function checkVideoProvider(): Promise<ReadinessItem> {
  const model = process.env.OPENROUTER_VIDEO_MODEL || 'google/veo-3.1-fast';
  const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY;
  const hasS3Storage = !!(
    process.env.AWS_S3_BUCKET
    && (process.env.AWS_S3_REGION || process.env.AWS_REGION)
    && process.env.AWS_S3_ACCESS_KEY_ID
    && process.env.AWS_S3_SECRET_ACCESS_KEY
    && process.env.AWS_S3_PUBLIC_URL
  );
  const configured = hasOpenRouterKey && hasS3Storage;
  return {
    id: 'video.provider',
    category: 'video',
    label: 'Video generation provider',
    status: configured ? 'ok' : 'warn',
    detail:
      configured
        ? `OpenRouter video generation configured (${model}). Videos will be saved to S3.`
        : 'OpenRouter video generation is not fully configured. Set OPENROUTER_API_KEY plus AWS_S3_BUCKET, AWS_S3_REGION, AWS_S3_ACCESS_KEY_ID, AWS_S3_SECRET_ACCESS_KEY, and AWS_S3_PUBLIC_URL before rendering campaign videos.',
    fixHref: '/admin/llm-config',
    enables: ['Campaign AI video generation', 'Social video drafts'],
  };
}

async function checkStripe(): Promise<ReadinessItem> {
  const hasKey = !!process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_');
  const isLive = (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_');
  return {
    id: 'payments.stripe',
    category: 'payments',
    label: 'Stripe billing',
    status: hasKey ? (isLive ? 'ok' : 'warn') : 'missing',
    detail: hasKey
      ? isLive
        ? 'Live Stripe key configured. Subscriptions and outcome billing ready.'
        : 'Test-mode Stripe key configured. Switch to a live key before charging real customers.'
      : 'No Stripe key. Founder subscriptions and credit top-ups will fail.',
    fixHref: '/admin/credit-plans',
    helpUrl: 'https://dashboard.stripe.com/apikeys',
    enables: ['Subscriptions', 'Credit packs', 'Outcome billing (Block 7)'],
  };
}

async function checkEmailProvider(): Promise<ReadinessItem> {
  const hasResend = !!process.env.RESEND_API_KEY;
  const hasSendGrid = !!process.env.SENDGRID_API_KEY;
  const status: ReadinessStatus = hasResend || hasSendGrid ? 'ok' : 'warn';
  return {
    id: 'email.provider',
    category: 'email',
    label: 'Transactional email (Resend or SendGrid)',
    status,
    detail:
      hasResend && hasSendGrid
        ? 'Resend + SendGrid configured. Cold outreach + transactional emails work.'
        : hasResend
          ? 'Resend configured.'
          : hasSendGrid
            ? 'SendGrid configured.'
            : 'No email provider. Outreach sequences and notifications will fail to send.',
    fixHref: '/admin/llm-config',
    helpUrl: 'https://resend.com/api-keys',
    enables: ['Cold outreach sequences', 'Lead notifications', 'Admin alerts'],
  };
}

async function checkFbMessenger(): Promise<ReadinessItem> {
  // We don't store FB App credentials globally — each company connects its
  // own Page. So this check just looks for any active connection across the
  // platform to indicate the founder has at least gone through the flow.
  let activeCount = 0;
  try {
    const res = await db.execute(
      sql`SELECT COUNT(*)::int AS n FROM channel_connections WHERE channel = 'fb_messenger' AND status = 'active'`,
    );
    activeCount = Number((res as any)[0]?.n ?? 0);
  } catch {
    // Table may not exist if migrations not applied — treat as missing.
    activeCount = 0;
  }
  return {
    id: 'channels.fb_messenger',
    category: 'channels',
    label: 'Facebook Messenger connection',
    status: activeCount > 0 ? 'ok' : 'warn',
    detail:
      activeCount > 0
        ? `${activeCount} active Page connection${activeCount === 1 ? '' : 's'}. Inbound messages route to the Inbox.`
        : 'No active Facebook Page connected. Founders connect their Page from the Channels screen.',
    fixHref: '/admin/users', // admin can see who connected — actual setup is per-company
    helpUrl: 'https://developers.facebook.com/docs/messenger-platform/getting-started',
    enables: ['Omnichannel inbox', 'AI auto-reply to DMs', 'Lead capture from Messenger'],
  };
}

async function checkGSC(): Promise<ReadinessItem> {
  const hasClient = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  return {
    id: 'search.gsc_oauth',
    category: 'search',
    label: 'Google Search Console OAuth',
    status: hasClient ? 'ok' : 'warn',
    detail: hasClient
      ? 'Google OAuth credentials configured. Founders can connect their GSC for real ranking data.'
      : 'No Google OAuth credentials. Founders cannot connect Search Console — SEO Engine loses its real-data anchor.',
    fixHref: '/admin/llm-config',
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    enables: ['GSC integration', 'Real ranking positions', 'Clicks / impressions / CTR'],
  };
}

async function checkSentry(): Promise<ReadinessItem> {
  const hasDsn = !!process.env.SENTRY_DSN;
  return {
    id: 'observability.sentry',
    category: 'observability',
    label: 'Sentry error monitoring',
    status: hasDsn ? 'ok' : 'warn',
    detail: hasDsn
      ? 'Sentry DSN configured. Backend errors are captured.'
      : 'No SENTRY_DSN. Server-side errors are only logged to stdout — easy to miss in production.',
    fixHref: '/admin/security',
    helpUrl: 'https://sentry.io/settings/projects/',
    enables: ['Production error alerts', 'Performance traces'],
  };
}

async function checkBrandIqAdoption(): Promise<ReadinessItem> {
  // Cross-company adoption metric — what % of active companies have a
  // Brand IQ profile. Surfaces low founder adoption to the admin.
  let total = 0;
  let withProfile = 0;
  try {
    const totals = await db.execute(
      sql`SELECT COUNT(*)::int AS n FROM companies WHERE status IN ('setup', 'active')`,
    );
    total = Number((totals as any)[0]?.n ?? 0);
    const adopted = await db.execute(
      sql`SELECT COUNT(DISTINCT company_id)::int AS n FROM brand_iq_profiles WHERE is_active = true`,
    );
    withProfile = Number((adopted as any)[0]?.n ?? 0);
  } catch {
    // table may not exist before migration runs
    total = 0;
    withProfile = 0;
  }
  const pct = total > 0 ? Math.round((withProfile / total) * 100) : 0;
  const status: ReadinessStatus = total === 0 ? 'warn' : pct >= 80 ? 'ok' : pct >= 30 ? 'warn' : 'missing';
  return {
    id: 'observability.brand_iq_adoption',
    category: 'observability',
    label: 'Brand IQ adoption across companies',
    status,
    detail:
      total === 0
        ? 'No active companies yet — once founders sign up, this measures how many have set up their Brand IQ.'
        : `${withProfile} of ${total} active companies (${pct}%) have an active Brand IQ profile. Until set up, every agent uses generic AI tone instead of brand voice.`,
    fixHref: '/admin/users',
    enables: ['Consistent brand voice across all agent outputs', 'Audience-aware personas', 'Style guide enforcement'],
  };
}

async function checkJwtSecret(): Promise<ReadinessItem> {
  const secret = process.env.JWT_SECRET ?? '';
  const isDefault =
    secret === '' ||
    secret === 'your-super-secret-jwt-key-change-in-production' ||
    secret.length < 32;
  return {
    id: 'observability.jwt_secret',
    category: 'observability',
    label: 'JWT signing secret',
    status: isDefault ? 'missing' : 'ok',
    detail: isDefault
      ? 'JWT_SECRET is missing or still the default placeholder. Change it before any public deployment — anyone with this string can forge admin sessions.'
      : `JWT_SECRET configured (${secret.length} chars).`,
    fixHref: '/admin/security',
    enables: ['Session security', 'Token encryption (Block 6 page tokens)'],
  };
}

// ─── Runner ──────────────────────────────────────────────────────────

const RUN_CHECKS = [
  checkLLMOpenAI,
  checkLLMAnthropic,
  checkImageProvider,
  checkVideoProvider,
  checkStripe,
  checkEmailProvider,
  checkFbMessenger,
  checkGSC,
  checkSentry,
  checkBrandIqAdoption,
  checkJwtSecret,
];

const WEIGHTS: Record<ReadinessStatus, number> = { ok: 1, warn: 0.5, missing: 0 };

export async function getSetupReadiness(): Promise<ReadinessReport> {
  const items = await Promise.all(RUN_CHECKS.map((fn) => fn()));
  const totalWeight = items.length;
  const earned = items.reduce((sum, it) => sum + WEIGHTS[it.status], 0);
  const score = Math.round((earned / totalWeight) * 100);
  return {
    score,
    items,
    summary: {
      total: items.length,
      ok: items.filter((i) => i.status === 'ok').length,
      warn: items.filter((i) => i.status === 'warn').length,
      missing: items.filter((i) => i.status === 'missing').length,
    },
    generatedAt: new Date().toISOString(),
  };
}
