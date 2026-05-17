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
} from 'lucide-react';

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
        description: 'Paste your URL + samples. Get a structured brand voice, audience personas, style guide that every agent will reuse.',
        href: null,
        status: 'soon',
        icon: Sparkles,
        block: 'Block 2',
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
        description: 'Draft, schedule, and publish to Facebook + Instagram + LinkedIn from one queue.',
        href: `/${companyId}/social`,
        status: 'live',
        icon: Share2,
      },
      {
        name: 'Real video rendering (TikTok / YouTube auto-publish)',
        description: 'End-to-end pipeline: blog → script → rendered video → upload with SEO metadata.',
        href: null,
        status: 'soon',
        icon: Video,
        block: 'Block 8',
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
        name: 'Channels (FB Messenger)',
        description: 'Connect your Facebook Page. Inbound DMs land in the omnichannel inbox; AI auto-reply is opt-in.',
        href: `/${companyId}/channels`,
        status: 'live',
        icon: Link2,
        block: 'Block 6',
        whatItDoes:
          'Founder pastes Page Access Token + Verify Token from Meta dashboard. We surface the webhook URL to paste back into Meta. Tokens are AES-256 encrypted at rest.',
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
        name: 'Growth Score & Daily Missions',
        description: '0-100 score across 4 areas + daily quests with streaks and rewards.',
        href: `/${companyId}`,
        status: 'live',
        icon: Flame,
      },
      {
        name: 'AI Employees with personalities',
        description: 'Named team members (Cleo CEO, Seomi SEO, etc.) with KPI dashboards and weekly check-ins.',
        href: null,
        status: 'soon',
        icon: Users,
        block: 'Block 3',
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
  const sections = SECTIONS(companyId);

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

      {/* Quick start */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary" /> Quick start — 5 minutes
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
                and paste your website URL + a few sample documents. This is what every agent will
                read before answering anything.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                2
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
                3
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
                4
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
                5
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
