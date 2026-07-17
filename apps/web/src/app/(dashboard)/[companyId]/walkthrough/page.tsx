'use client';

/**
 * Walkthrough — guided tour of everything the platform can do, organised
 * by job-to-be-done. Each feature shows:
 *   - status (Live / Beta / Coming soon)
 *   - one-line description in plain language
 *   - "Open" button that deep-links to the actual page
 *   - which 2027-plan block it belongs to (for transparency)
 *
 * Goal: a non-technical founder lands here on day 1, scrolls once, and
 * knows exactly what is available, what is partial, and what is on the
 * way. Linked from sidebar at unlockLevel 1.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Clock,
  Wrench,
  Search,
  FileEdit,
  Link2,
  Inbox,
  Megaphone,
  Rocket,
  MessageSquare,
  Share2,
  Globe,
  BookOpen,
  Flame,
  Brain,
  Image as ImageIcon,
  Video,
  Users,
  CreditCard,
  Lightbulb,
  Bell,
  TrendingUp,
} from 'lucide-react';
import { useCompany, useLandingPages } from '@/lib/api/hooks';

type FeatureStatus = 'live' | 'partial' | 'soon';

interface Feature {
  name: string;
  description: string;
  href: string | null; // null when not yet routable
  status: FeatureStatus;
  icon: typeof Sparkles;
  block?: string; // ref to docs/strategy/build-now-plan.md block
  whatItDoes?: string;
}

interface Section {
  title: string;
  subtitle: string;
  icon: typeof Sparkles;
  features: Feature[];
}

const SECTIONS = (companyId: string): Section[] => [
  {
    title: '1 · Get found by AI & Google',
    subtitle: 'How your brand shows up in ChatGPT, Claude, Google AI Overviews, and traditional search.',
    icon: Search,
    features: [
      {
        name: 'AI Visibility (GEO)',
        description: 'Track how often your brand is named when people ask ChatGPT/Claude questions in your space.',
        href: `/${companyId}/geo`,
        status: 'live',
        icon: Search,
        block: 'Block 1',
        whatItDoes:
          'Add prompts your customers might type into AI chat. We poll each AI engine, score your AI Share of Voice, and list which competitors get named instead.',
      },
      {
        name: 'Content Editor (real-time SEO grader)',
        description: 'Paste a draft + target keyword. Get a 0-100 score against the live Google top-10.',
        href: `/${companyId}/editor`,
        status: 'live',
        icon: FileEdit,
        block: 'Block 4',
        whatItDoes:
          'Five sub-scores (entity coverage, topic coverage, brand voice, AI-citation likelihood, readability) plus 5-10 ranked suggestions to lift your draft.',
      },
      {
        name: 'Market & Competitors',
        description: 'Track competitor websites, get weekly briefs, surface positioning gaps.',
        href: `/${companyId}/market`,
        status: 'live',
        icon: Globe,
      },
      {
        name: 'Knowledge Base & Business Brain',
        description: 'Feed your docs, FAQs, and product info so every AI agent answers in context.',
        href: `/${companyId}/knowledge`,
        status: 'live',
        icon: BookOpen,
      },
      {
        name: 'Brand IQ (auto voice + audience extract)',
        description: 'AI builds your voice, audience, positioning, and style from existing company data; add extra context whenever needed.',
        href: `/${companyId}/brand-iq`,
        status: 'live',
        icon: Sparkles,
        block: 'Block 2',
        whatItDoes:
          'Single source of truth for voice + audience + positioning + style + visuals + OKRs. Now also extracts product-marketing depth: why customers switch (JTBD Four Forces), their verbatim language, who is NOT a fit, and objection handling. Every blog, banner, ad, social post, chat reply, landing page automatically reads it — no per-agent setup needed.',
      },
    ],
  },
  {
    title: '2 · Publish content automatically',
    subtitle: 'Blog posts, banners, social posts, landing pages — generated and ready to ship.',
    icon: Rocket,
    features: [
      {
        name: 'Campaigns',
        description: 'Wrap a goal (launch, lead gen, awareness) into a 7-30 day plan the agents execute against.',
        href: `/${companyId}/campaigns`,
        status: 'live',
        icon: Rocket,
      },
      {
        name: 'Landing Pages',
        description: 'AI-built landing pages with hero, features, FAQ, lead form. Publish to a subdomain in one click.',
        href: `/${companyId}/landing-pages`,
        status: 'live',
        icon: FileEdit,
      },
      {
        name: 'Brand Assets Library',
        description: 'Centralise logos, colors, hero images, banners — everything the creative engine can reuse.',
        href: `/${companyId}/assets`,
        status: 'live',
        icon: ImageIcon,
      },
      {
        name: 'Social Media',
        description: 'Draft, schedule, and publish from one queue. Facebook Page publishing is live; Instagram + LinkedIn are draft-only for now.',
        href: `/${companyId}/social`,
        status: 'live',
        icon: Share2,
        block: 'P5',
        whatItDoes:
          'Connect a Facebook Page in Channels, then hit "Publish now" — the post goes straight to your Page feed via the Graph API (needs the pages_manage_posts permission). Instagram + LinkedIn stay as drafts until their connectors ship.',
      },
      {
        name: 'Content Autopilot (1-2 blogs/day, automatic)',
        description: 'Add your topics once → the platform writes 1-2 SEO/GEO blog posts a day and publishes WordPress drafts for your approval. No daily effort.',
        href: `/${companyId}/autopilot`,
        status: 'live',
        icon: Rocket,
        block: 'P8',
        whatItDoes:
          'The unattended version of Campaign Launcher. Set posts/day + a queue of topics; a scheduler generates each post in your Brand IQ voice, publishes a WordPress draft (you approve in WP), seeds GEO tracking, and rotates to the next topic. Use "Run one now" to test instantly. Perfect for a WordPress site (e.g. a blockchain agency) that needs a steady stream of SEO content to get found + recommended by AI search.',
      },
      {
        name: 'Campaign Launcher (one-click multi-channel)',
        description: 'One keyword → blog + hero + in-content images + WordPress draft + LinkedIn/FB drafts + GEO tracking, all in one orchestrated run.',
        href: `/${companyId}/launch`,
        status: 'live',
        icon: Rocket,
        block: 'Block 8',
        whatItDoes:
          'Pick a target keyword + which platforms to publish to. The orchestrator generates the blog post (using your Brand IQ), 1 hero + 2 in-content images, embeds for AI memory, uploads featured image + publishes draft to your connected WordPress site, drafts platform-native social posts, and seeds a GEO tracking prompt — typically in 30-60 seconds.',
      },
      {
        name: 'WordPress publishing',
        description: 'Connect your WordPress site (Application Password). Blog drafts + featured images push straight in.',
        href: `/${companyId}/seo-engine`,
        status: 'live',
        icon: FileEdit,
        block: 'Block 8',
        whatItDoes:
          'Existing site? Connect with Application Password, the launcher then publishes drafts (with featured image upload) you can review and ship from within WP itself.',
      },
      {
        name: 'Real video rendering (TikTok / YouTube auto-publish)',
        description: 'End-to-end pipeline: blog → script → rendered video → upload with SEO metadata.',
        href: null,
        status: 'soon',
        icon: Video,
        block: 'Block 8 v2',
      },
    ],
  },
  {
    title: '3 · Talk to customers',
    subtitle: 'Chatbot on your site + connected messaging channels with a unified inbox.',
    icon: MessageSquare,
    features: [
      {
        name: 'Site Chatbot',
        description: 'Embed a chat widget on your site. Trained on your knowledge base, captures leads, handles support and sales questions.',
        href: `/${companyId}/chatbot`,
        status: 'live',
        icon: MessageSquare,
      },
      {
        name: 'Channels (Facebook Page)',
        description: 'Connect a Facebook Page and publish approved campaign posts without copying tokens.',
        href: `/${companyId}/channels`,
        status: 'live',
        icon: Link2,
        block: 'Block 6',
        whatItDoes:
          'Sign in with Facebook, choose a Page you manage, and 1Person securely configures campaign publishing for you.',
      },
      {
        name: 'Inbox · Messages',
        description: 'Unified thread view across all connected channels. Reply manually when AI auto-reply is off.',
        href: `/${companyId}/inbox/messages`,
        status: 'live',
        icon: Inbox,
        block: 'Block 6',
      },
      {
        name: 'Zalo + WhatsApp + Instagram channels',
        description: 'Same unified inbox, more chat platforms. Schema is ready; awaiting platform API approvals.',
        href: null,
        status: 'soon',
        icon: MessageSquare,
        block: 'Block 6',
      },
    ],
  },
  {
    title: '4 · Sell',
    subtitle: 'Pipeline, leads, outreach — convert visitors to revenue.',
    icon: Megaphone,
    features: [
      {
        name: 'Sales Pipeline',
        description: 'Track deals, lead scores, conversion stages. Powered by lead capture + email signals.',
        href: `/${companyId}/sales`,
        status: 'live',
        icon: Megaphone,
      },
      {
        name: 'Outreach (cold email sequences)',
        description: 'Build sequences, enroll leads, track opens/clicks/replies. Send via Resend or SendGrid.',
        href: `/${companyId}/sales`,
        status: 'partial',
        icon: Megaphone,
        whatItDoes: 'Backend ready; visual drip builder UI is partial. Use API for now.',
      },
      {
        name: 'Outcome-based billing',
        description: 'Pay per published article, per qualified lead, per resolved ticket — not per seat.',
        href: null,
        status: 'soon',
        icon: CreditCard,
        block: 'Block 7',
      },
    ],
  },
  {
    title: '5 · See your AI company at work',
    subtitle: 'Agents, growth score, daily missions — the founder cockpit.',
    icon: Brain,
    features: [
      {
        name: 'Dashboard',
        description: 'One screen: growth score, today\'s missions, agent activity, pipeline at a glance.',
        href: `/${companyId}`,
        status: 'live',
        icon: Sparkles,
      },
      {
        name: 'CEO Advisor',
        description: 'Strategic insights from your CEO Agent — what to focus on, what\'s working, what to drop.',
        href: `/${companyId}/insights`,
        status: 'live',
        icon: Sparkles,
      },
      {
        name: 'Real analytics (Google Analytics 4)',
        description: 'Connect Google once → see real sessions, users, conversions, top pages and traffic channels from GA4.',
        href: `/${companyId}/analytics`,
        status: 'live',
        icon: TrendingUp,
        block: 'P4',
        whatItDoes:
          'Reuses the same Google connection as Search Console (one consent covers both). Paste your GA4 Property ID once; the Analytics page then pulls live numbers on demand — no background polling.',
      },
      {
        name: 'Analyze a screenshot (no connection needed)',
        description: 'Too technical to connect a platform? Drop a screenshot of Facebook Ads Manager, GA4, or any report and the AI reads the numbers and tells you what to do.',
        href: `/${companyId}/analytics`,
        status: 'live',
        icon: Sparkles,
        block: 'C1',
        whatItDoes:
          'Zero setup — no OAuth, no tokens. Open any dashboard, screenshot it, drop or paste it on the Analytics page, optionally ask a question, and Claude reads the chart/numbers and returns findings + prioritized actions in your brand context.',
      },
      {
        name: 'Growth Score & Daily Missions',
        description: '0-100 score across 4 areas + daily quests with streaks and rewards.',
        href: `/${companyId}`,
        status: 'live',
        icon: Flame,
      },
      {
        name: 'Marketing Playbooks (41 expert frameworks)',
        description: 'Run any of 41 senior-practitioner playbooks — SEO audit, CRO, copywriting, pricing, churn, launch, and more — on demand.',
        href: `/${companyId}/playbooks`,
        status: 'live',
        icon: BookOpen,
        block: 'P6',
        whatItDoes:
          'Pick a playbook, describe what you need ("write a 5-email welcome sequence", "audit my pricing page"), and get a deliverable written with that expert framework — automatically grounded in your Brand IQ voice, audience, and positioning.',
      },
      {
        name: 'AI Employees with personalities',
        description: 'Seven named team members (Cleo CEO, Cassie Support, Soshie Social, Seomi SEO, Geoffrey GEO, Penn Copy, Vio Video) — each with KPI dashboard and DM chat.',
        href: `/${companyId}/team`,
        status: 'live',
        icon: Users,
        block: 'Block 3',
        whatItDoes:
          'Each employee now carries expert marketing playbooks for their domain (e.g. Seomi → SEO audit + site architecture; Cleo → pricing, GTM launch, marketing psychology; Cassie → churn prevention + referrals). They reply in their own voice, read your Brand IQ, apply their playbooks, and run semantic search across your knowledge base + blog posts + GEO mentions before answering. Open any card to see their specialties and chat — every answer cites the memory snippets it leaned on.',
      },
      {
        name: 'Agent evolution loop (auto-improving prompts)',
        description: 'Every agent A/B tests its own prompts weekly and learns from outcomes. The moat.',
        href: null,
        status: 'soon',
        icon: Brain,
        block: 'Block 5',
      },
    ],
  },
  {
    title: '6 · Brain Hub — what reacts to your business in real time',
    subtitle: 'A source-agnostic intelligence layer. Every chatbot message, FB inbound, lead, and uploaded file flows in; watchers detect patterns; reactions draft the response.',
    icon: Brain,
    features: [
      {
        name: 'Brain Hub — Sources & Event Stream',
        description: 'One place for every signal — chatbot conversations, FB Messenger inbox, lead captures, plus any PDF/CSV/text you upload or paste.',
        href: `/${companyId}/brain-hub`,
        status: 'live',
        icon: Inbox,
        block: 'Brain Hub Phase A',
        whatItDoes:
          'Internal taps (chatbot + omnichannel + leads) wire automatically — you don\'t need to configure anything. Upload PDFs/CSVs, paste FAQs in bulk, semantic-search across everything from one bar. Every event gets auto-tagged with topic + sentiment.',
      },
      {
        name: 'Watchers — pattern detection',
        description: '7 default watchers ship enabled: recurring questions, sales-objection clusters, praise candidates, lead spikes, churn-risk language, ICP signals, competitor mentions.',
        href: `/${companyId}/brain-hub?tab=watchers`,
        status: 'live',
        icon: Search,
        block: 'Brain Hub Phase B',
        whatItDoes:
          'Watchers re-evaluate automatically every time a new event arrives — no background polling, no extra cost. Each one has a cooldown so you never get spammed with duplicates. Pause / enable / tune cooldown per watcher from the UI.',
      },
      {
        name: "Today's Reactions — proactive drafts",
        description: 'When a watcher fires, the Brain composes a draft (chatbot FAQ, comparison blog brief, or a "heads up" notification) for one-click review.',
        href: `/${companyId}/brain-hub?tab=reactions`,
        status: 'live',
        icon: Bell,
        block: 'Brain Hub Phase B',
        whatItDoes:
          'Approve a chatbot-FAQ draft → it lands in your knowledge base and the chatbot answers in seconds. Approve a blog draft → Campaign Launcher kicks in with the keyword + brief pre-filled. Dismiss anything you don\'t want.',
      },
      {
        name: 'External signals (Google Trends, Reddit, OAuth apps)',
        description: 'Polled trend feeds + OAuth connectors (Stripe / Fireflies / Intercom / HubSpot) so the Brain reacts to market shifts too.',
        href: null,
        status: 'soon',
        icon: TrendingUp,
        block: 'Brain Hub Phase C',
      },
    ],
  },
];

const STATUS_BADGES: Record<FeatureStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  live: { label: 'Live', className: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  partial: { label: 'Partial', className: 'bg-amber-100 text-amber-700 border-amber-200', icon: Wrench },
  soon: { label: 'Coming soon', className: 'bg-slate-100 text-slate-600 border-slate-200', icon: Clock },
};

function FeatureRow({ feature }: { feature: Feature }) {
  const meta = STATUS_BADGES[feature.status];
  const StatusIcon = meta.icon;
  const Icon = feature.icon;
  return (
    <div className="border rounded-lg p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium text-sm">{feature.name}</div>
            <Badge variant="outline" className={`gap-1 ${meta.className}`}>
              <StatusIcon className="w-2.5 h-2.5" /> {meta.label}
            </Badge>
            {feature.block && (
              <span className="text-[10px] text-muted-foreground font-mono">{feature.block}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{feature.description}</p>
          {feature.whatItDoes && (
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              <Lightbulb className="w-3 h-3 inline-block mr-1 text-amber-500" />
              {feature.whatItDoes}
            </p>
          )}
        </div>
        <div className="shrink-0">
          {feature.href ? (
            <Link href={feature.href}>
              <Button size="sm" variant="outline" className="gap-1">
                Open <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          ) : (
            <Button size="sm" variant="ghost" disabled>
              On the roadmap
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WalkthroughPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { data: company, isLoading: companyLoading } = useCompany(companyId);
  const { data: landingPages = [], isLoading: landingPagesLoading } = useLandingPages(companyId);
  const sections = SECTIONS(companyId);
  const showWebsiteStep = !companyLoading
    && !landingPagesLoading
    && company?.websiteProfile?.startingFresh === true;
  const publishedWebsitePage = landingPages.find((page) => page.status === 'published');
  const hasWebsiteDrafts = landingPages.length > 0;

  const totals = sections.reduce(
    (acc, s) => {
      for (const f of s.features) acc[f.status]++;
      return acc;
    },
    { live: 0, partial: 0, soon: 0 } as Record<FeatureStatus, number>,
  );

  return (
    <div className="space-y-8 max-w-4xl mx-auto p-1">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-primary" /> What you can do here
        </h1>
        <p className="text-muted-foreground mt-2">
          The full feature map. Click <em>Open</em> on anything that says <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 align-middle mx-1">Live</Badge>
          to try it. Items marked <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 align-middle mx-1">Coming soon</Badge>
          are on the build plan with a reference to the block they belong to.
        </p>
      </div>

      {/* Snapshot card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-5 flex items-center gap-6 flex-wrap">
          <div className="flex items-baseline gap-2">
            <div className="text-4xl font-bold text-primary tabular-nums">{totals.live}</div>
            <div className="text-sm text-muted-foreground">features live</div>
          </div>
          <div className="flex-1 min-w-[200px] text-sm space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> {totals.live} Live
              </span>
              <span className="flex items-center gap-1 text-amber-700">
                <Wrench className="w-3.5 h-3.5" /> {totals.partial} Partial
              </span>
              <span className="flex items-center gap-1 text-slate-600">
                <Clock className="w-3.5 h-3.5" /> {totals.soon} Coming soon
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              See the full roadmap at <code className="bg-white px-1 py-0.5 rounded">docs/strategy/build-now-plan.md</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Expert frameworks — the knowledge layer powering generations */}
      <Card className="border-amber-200 bg-gradient-to-br from-amber-50/70 to-orange-50/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600" /> Powered by expert marketing frameworks
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Your AI now writes using senior-practitioner playbooks — not generic prompts. Every
            generation below silently applies a battle-tested framework, then adapts it to your
            Brand IQ voice. <strong>4 of 41 expert frameworks are live</strong>; more roll out each release.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              { fw: 'Copywriting', powers: 'Blog posts & long-form content', icon: FileEdit, href: `/${companyId}/editor` },
              { fw: 'CRO', powers: 'Landing page hero & value-prop copy', icon: FileEdit, href: `/${companyId}/landing-pages` },
              { fw: 'Ad creative', powers: 'Ads — headlines, primary text, CTAs', icon: Megaphone, href: `/${companyId}/campaigns` },
              { fw: 'Email & Cold-email', powers: 'Outreach sequences & nurture emails', icon: Megaphone, href: `/${companyId}/sales` },
            ].map((item) => {
              const I = item.icon;
              return (
                <Link
                  key={item.fw}
                  href={item.href}
                  className="flex items-center gap-3 border rounded-lg p-3 bg-white/60 hover:shadow-sm transition-shadow"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <I className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      {item.fw}
                      <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Live
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">Powers: {item.powers}</p>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] text-muted-foreground">
              Knowledge adapted from the open-source{' '}
              <span className="font-mono">marketingskills</span> library (MIT).
            </p>
            <Link href={`/${companyId}/playbooks`}>
              <Button size="sm" variant="outline" className="gap-1">
                <BookOpen className="w-3 h-3" /> Browse all 41 playbooks <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Quick start */}
      <Card data-guided-tour="walkthrough-quick-start">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary" /> Quick start — {showWebsiteStep ? '7' : '6'} steps, ~10 minutes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <span>
                Go to{' '}
                <Link href={`/${companyId}/knowledge`} className="text-primary underline font-medium">
                  Knowledge
                </Link>{' '}
                and add your product information, FAQs, or sample documents. This is what every
                agent reads before answering anything.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <span>
                Set up{' '}
                <Link href={`/${companyId}/brand-iq`} className="text-primary underline font-medium">
                  Brand IQ
                </Link>{' '}
                — AI builds it automatically from your company data. Review the result and add
                extra context only when something important is missing.
                <span className="inline-block ml-1 text-[10px] uppercase font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                  most impactful
                </span>
              </span>
            </li>
            {showWebsiteStep && (
              <li className="flex items-start gap-3">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                  publishedWebsitePage
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 text-white'
                }`}>
                  {publishedWebsitePage ? <CheckCircle2 className="h-4 w-4" /> : '3'}
                </span>
                <div className={`flex min-w-0 flex-1 flex-col gap-2 rounded-md border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${
                  publishedWebsitePage
                    ? 'border-emerald-200 bg-emerald-50/70'
                    : 'border-indigo-200 bg-indigo-50/70'
                }`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Globe className={`h-3.5 w-3.5 shrink-0 ${publishedWebsitePage ? 'text-emerald-700' : 'text-indigo-700'}`} />
                      <span className="font-semibold">
                          {publishedWebsitePage
                            ? 'Your first website is live'
                            : hasWebsiteDrafts
                              ? 'Finish your first website'
                              : 'Create your first website'}
                      </span>
                      <Badge
                        variant="outline"
                        className={`h-5 px-1.5 text-[10px] font-medium ${
                          publishedWebsitePage
                            ? 'border-emerald-300 bg-white/80 text-emerald-700'
                            : 'border-indigo-300 bg-white/80 text-indigo-700'
                        }`}
                      >
                          {publishedWebsitePage ? 'Complete' : 'Recommended'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                        {publishedWebsitePage
                          ? 'Your public page is ready for visitors. You can update or add more pages at any time.'
                          : hasWebsiteDrafts
                            ? `AI prepared ${landingPages.length} starter page${landingPages.length === 1 ? '' : 's'}. Review one, make any changes, then publish it.`
                            : 'Answer a few simple questions and AI will create a complete home page. No coding needed.'}
                    </p>
                  </div>
                  <Link
                    href={hasWebsiteDrafts
                      ? `/${companyId}/landing-pages`
                      : `/${companyId}/landing-pages?action=generate`}
                    className="shrink-0"
                  >
                    <Button
                      size="sm"
                      variant={publishedWebsitePage ? 'outline' : 'default'}
                      className="h-8 w-full gap-1 px-3 text-xs sm:w-auto"
                    >
                        {publishedWebsitePage
                          ? 'Manage website'
                          : hasWebsiteDrafts
                            ? 'Review drafts'
                            : 'Create website'}
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </li>
            )}
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                {showWebsiteStep ? '4' : '3'}
              </span>
              <span>
                Add 3-5 competitors at{' '}
                <Link href={`/${companyId}/market`} className="text-primary underline font-medium">
                  Market &amp; Competitors
                </Link>
                . This unlocks Share-of-Voice scoring on the GEO page.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                {showWebsiteStep ? '5' : '4'}
              </span>
              <span>
                Open{' '}
                <Link href={`/${companyId}/geo`} className="text-primary underline font-medium">
                  AI Visibility (GEO)
                </Link>{' '}
                and add one prompt your customers would type into ChatGPT. Click <em>Run Now</em> —
                in ~10 seconds you see whether you are mentioned.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                {showWebsiteStep ? '6' : '5'}
              </span>
              <span>
                Try the{' '}
                <Link href={`/${companyId}/editor`} className="text-primary underline font-medium">
                  Content Editor
                </Link>
                : paste a draft blog post + target keyword, hit <em>Grade</em>, and act on the top
                suggestion.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                {showWebsiteStep ? '7' : '6'}
              </span>
              <span>
                Connect your Facebook Page at{' '}
                <Link href={`/${companyId}/channels`} className="text-primary underline font-medium">
                  Channels
                </Link>{' '}
                so inbound DMs land in the unified inbox.
              </span>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Feature sections */}
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <div key={section.title} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Icon className="w-5 h-5 text-primary" /> {section.title}
              </h2>
              <p className="text-sm text-muted-foreground">{section.subtitle}</p>
            </div>
            <div className="space-y-2">
              {section.features.map((f) => (
                <FeatureRow key={f.name} feature={f} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Recipe: B2B + WordPress (bap-blockchain.com style) */}
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-blue-50/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="w-4 h-4 text-indigo-600" /> Recipe — B2B service company on WordPress
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Example: a blockchain development agency wants enterprise buyers to find them via Google
            + LinkedIn + ChatGPT. End-to-end workflow using only Live features.
          </p>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
              <span>
                <Link href={`/${companyId}/brand-iq`} className="text-indigo-700 underline font-medium">
                  Brand IQ
                </Link>{' '}
                — paste your WordPress site URL + 1-2 case study writeups. The system auto-extracts
                your B2B voice, audience personas (CTO, Head of Eng, etc.) and your visual palette.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
              <span>
                <Link href={`/${companyId}/seo-engine`} className="text-indigo-700 underline font-medium">
                  Connect WordPress
                </Link>{' '}
                — paste your site URL + an Application Password (WP Admin → Users → Profile →
                Application Passwords). Drafts will land in WP for you to review.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
              <span>
                Connect{' '}
                <Link href={`/${companyId}/social`} className="text-indigo-700 underline font-medium">
                  LinkedIn
                </Link>{' '}
                via the platform connections. (Most important channel for enterprise B2B.)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">4</span>
              <span>
                Add 3-5 competitors at{' '}
                <Link href={`/${companyId}/market`} className="text-indigo-700 underline font-medium">
                  Market &amp; Competitors
                </Link>{' '}
                (e.g. Consensys, Chainstack, similar agencies).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">5</span>
              <span>
                Open{' '}
                <Link href={`/${companyId}/geo`} className="text-indigo-700 underline font-medium">
                  AI Visibility (GEO)
                </Link>{' '}
                and add prompts your buyers ask AI tools — e.g. <em>"best blockchain development
                companies for enterprise"</em>, <em>"top Web3 dev agencies 2026"</em>. Click Run Now
                to baseline today.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">6</span>
              <span>
                Open{' '}
                <Link href={`/${companyId}/launch`} className="text-indigo-700 underline font-medium">
                  Campaign Launcher
                </Link>
                . Keyword: <em>"enterprise blockchain development services"</em>. Toggle WordPress +
                LinkedIn ON. Click Launch. In ~60 seconds you have a draft blog with hero image
                in WP, a draft LinkedIn post in your social queue, and the keyword tracked in GEO.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">7</span>
              <span>
                Review in WP, hit Publish. Repeat the launcher once a week with new keywords. Watch
                GEO Share-of-Voice trend up over 4-8 weeks.
              </span>
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="p-5 text-center text-sm text-muted-foreground">
          Missing something you need?{' '}
          <Link href={`/${companyId}/insights`} className="text-primary underline font-medium">
            Tell your CEO Advisor
          </Link>{' '}
          — it routes founder requests into the platform backlog.
        </CardContent>
      </Card>
    </div>
  );
}
