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
import { normalizeAppLanguage, type AppLanguage } from '@/lib/app-language';
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

const WALKTHROUGH_COPY: Record<AppLanguage, {
  pageTitle: string;
  introBeforeLive: string;
  introAfterLive: string;
  introBeforeSoon: string;
  introAfterSoon: string;
  featuresLive: string;
  roadmap: string;
  expertTitle: string;
  expertDescription: string;
  frameworksLive: string;
  knowledgeAdapted: string;
  browsePlaybooks: string;
  quickStartTitle: (steps: number) => string;
  mostImpactful: string;
  complete: string;
  recommended: string;
  open: string;
  roadmapButton: string;
  powers: string;
  recipeTitle: string;
  recipeDescription: string;
  missingTitle: string;
  missingLink: string;
  missingSuffix: string;
  websiteLiveTitle: string;
  websiteDraftTitle: string;
  websiteCreateTitle: string;
  websiteLiveDesc: string;
  websiteDraftDesc: (count: number) => string;
  websiteCreateDesc: string;
  manageWebsite: string;
  reviewDrafts: string;
  createWebsite: string;
  quickSteps: {
    knowledge: string;
    brand: string;
    competitors: string;
    geo: string;
    editor: string;
    channels: string;
  };
  recipeSteps: string[];
  status: Record<FeatureStatus, string>;
}> = {
  en: {
    pageTitle: 'What you can do here',
    introBeforeLive: 'The full feature map. Click',
    introAfterLive: 'on anything that says',
    introBeforeSoon: 'to try it. Items marked',
    introAfterSoon: 'are on the build plan with a reference to the block they belong to.',
    featuresLive: 'features live',
    roadmap: 'See the full roadmap at',
    expertTitle: 'Powered by expert marketing frameworks',
    expertDescription: 'Your AI now writes using senior-practitioner playbooks, not generic prompts. Every generation below silently applies a battle-tested framework, then adapts it to your Brand IQ voice.',
    frameworksLive: '4 of 41 expert frameworks are live',
    knowledgeAdapted: 'Knowledge adapted from the open-source marketingskills library (MIT).',
    browsePlaybooks: 'Browse all 41 playbooks',
    quickStartTitle: (steps) => `Quick start - ${steps} steps, ~10 minutes`,
    mostImpactful: 'most impactful',
    complete: 'Complete',
    recommended: 'Recommended',
    open: 'Open',
    roadmapButton: 'On the roadmap',
    powers: 'Powers:',
    recipeTitle: 'Recipe - B2B service company on WordPress',
    recipeDescription: 'Example: a blockchain development agency wants enterprise buyers to find them via Google + LinkedIn + ChatGPT. End-to-end workflow using only Live features.',
    missingTitle: 'Missing something you need?',
    missingLink: 'Tell your CEO Advisor',
    missingSuffix: 'it routes founder requests into the platform backlog.',
    websiteLiveTitle: 'Your first website is live',
    websiteDraftTitle: 'Finish your first website',
    websiteCreateTitle: 'Create your first website',
    websiteLiveDesc: 'Your public page is ready for visitors. You can update or add more pages at any time.',
    websiteDraftDesc: (count) => `AI prepared ${count} starter page${count === 1 ? '' : 's'}. Review one, make any changes, then publish it.`,
    websiteCreateDesc: 'Answer a few simple questions and AI will create a complete home page. No coding needed.',
    manageWebsite: 'Manage website',
    reviewDrafts: 'Review drafts',
    createWebsite: 'Create website',
    quickSteps: {
      knowledge: 'Go to Knowledge and add your product information, FAQs, or sample documents. This is what every agent reads before answering anything.',
      brand: 'Set up Brand IQ. AI builds it automatically from your company data. Review the result and add extra context only when something important is missing.',
      competitors: 'Add 3-5 competitors at Market & Competitors. This unlocks Share-of-Voice scoring on the GEO page.',
      geo: 'Open AI Visibility (GEO) and add one prompt your customers would type into ChatGPT. Click Run Now. In about 10 seconds you see whether you are mentioned.',
      editor: 'Try the Content Editor: paste a draft blog post and target keyword, hit Grade, and act on the top suggestion.',
      channels: 'Connect your Facebook Page at Channels so inbound DMs land in the unified inbox.',
    },
    recipeSteps: [
      'Brand IQ: paste your WordPress site URL and 1-2 case study writeups. The system extracts your B2B voice, audience personas, and visual palette.',
      'Connect WordPress: paste your site URL and an Application Password. Drafts will land in WordPress for you to review.',
      'Connect LinkedIn via the platform connections. This is usually the most important channel for enterprise B2B.',
      'Add 3-5 competitors in Market & Competitors, such as similar agencies or alternative vendors.',
      'Open AI Visibility (GEO) and add prompts your buyers ask AI tools, then run a baseline check.',
      'Open Campaign Launcher. Choose a keyword, turn WordPress and LinkedIn on, then launch. You get a draft blog, draft social post, and GEO tracking.',
      'Review in WordPress, publish, then repeat weekly with new keywords. Watch GEO Share-of-Voice over 4-8 weeks.',
    ],
    status: { live: 'Live', partial: 'Partial', soon: 'Coming soon' },
  },
  vi: {
    pageTitle: 'Bạn có thể làm gì ở đây',
    introBeforeLive: 'Đây là bản đồ tính năng đầy đủ. Bấm',
    introAfterLive: 'ở những mục có nhãn',
    introBeforeSoon: 'để dùng thử. Các mục có nhãn',
    introAfterSoon: 'đang nằm trong kế hoạch phát triển và có ghi block liên quan.',
    featuresLive: 'tính năng đang hoạt động',
    roadmap: 'Xem roadmap đầy đủ tại',
    expertTitle: 'Được hỗ trợ bởi các framework marketing chuyên sâu',
    expertDescription: 'AI không chỉ viết bằng prompt chung chung. Mỗi nội dung được tạo ra sẽ áp dụng framework marketing đã được kiểm chứng, rồi điều chỉnh theo Brand IQ của doanh nghiệp.',
    frameworksLive: '4/41 framework chuyên gia đang hoạt động',
    knowledgeAdapted: 'Kiến thức được tham khảo từ thư viện mã nguồn mở marketingskills (MIT).',
    browsePlaybooks: 'Xem toàn bộ 41 playbook',
    quickStartTitle: (steps) => `Quick start - ${steps} bước, khoảng 10 phút`,
    mostImpactful: 'quan trọng nhất',
    complete: 'Hoàn tất',
    recommended: 'Đề xuất',
    open: 'Mở',
    roadmapButton: 'Đang trong roadmap',
    powers: 'Dùng cho:',
    recipeTitle: 'Quy trình mẫu - Công ty dịch vụ B2B dùng WordPress',
    recipeDescription: 'Ví dụ: một agency blockchain muốn khách hàng doanh nghiệp tìm thấy họ qua Google, LinkedIn và ChatGPT. Đây là flow end-to-end chỉ dùng các tính năng đã Live.',
    missingTitle: 'Bạn cần thêm tính năng khác?',
    missingLink: 'Nói với CEO Advisor',
    missingSuffix: 'yêu cầu của founder sẽ được đưa vào backlog sản phẩm.',
    websiteLiveTitle: 'Website đầu tiên đã live',
    websiteDraftTitle: 'Hoàn thiện website đầu tiên',
    websiteCreateTitle: 'Tạo website đầu tiên',
    websiteLiveDesc: 'Trang công khai của bạn đã sẵn sàng cho khách truy cập. Bạn có thể cập nhật hoặc thêm trang mới bất cứ lúc nào.',
    websiteDraftDesc: (count) => `AI đã chuẩn bị ${count} trang nháp ban đầu. Hãy review một trang, chỉnh sửa nếu cần rồi publish.`,
    websiteCreateDesc: 'Trả lời vài câu hỏi đơn giản, AI sẽ tạo một home page hoàn chỉnh. Không cần biết code.',
    manageWebsite: 'Quản lý website',
    reviewDrafts: 'Review bản nháp',
    createWebsite: 'Tạo website',
    quickSteps: {
      knowledge: 'Vào Knowledge và thêm thông tin sản phẩm, FAQ hoặc tài liệu mẫu. Đây là nguồn mà mọi agent đọc trước khi trả lời.',
      brand: 'Thiết lập Brand IQ. AI tự tạo từ dữ liệu công ty, bạn chỉ cần review và bổ sung khi thiếu thông tin quan trọng.',
      competitors: 'Thêm 3-5 đối thủ tại Market & Competitors. Việc này giúp mở khóa điểm Share-of-Voice ở trang GEO.',
      geo: 'Mở AI Visibility (GEO), thêm một câu hỏi khách hàng có thể hỏi ChatGPT, rồi bấm Run Now. Sau khoảng 10 giây bạn sẽ biết thương hiệu có được nhắc tới không.',
      editor: 'Thử Content Editor: dán bản nháp blog và target keyword, bấm Grade, rồi xử lý đề xuất quan trọng nhất.',
      channels: 'Kết nối Facebook Page tại Channels để tin nhắn từ khách hàng đi vào unified inbox.',
    },
    recipeSteps: [
      'Brand IQ: dán URL WordPress và 1-2 case study. Hệ thống sẽ rút ra giọng B2B, chân dung khách hàng và màu sắc thương hiệu.',
      'Kết nối WordPress: nhập URL website và Application Password. Bài nháp sẽ được đẩy vào WordPress để bạn review.',
      'Kết nối LinkedIn trong phần platform connections. Đây thường là kênh quan trọng nhất với B2B enterprise.',
      'Thêm 3-5 đối thủ trong Market & Competitors, ví dụ các agency tương tự hoặc nhà cung cấp thay thế.',
      'Mở AI Visibility (GEO), thêm các câu hỏi khách hàng hay hỏi AI, rồi chạy baseline.',
      'Mở Campaign Launcher. Chọn keyword, bật WordPress và LinkedIn, rồi launch. Bạn sẽ có blog draft, social draft và GEO tracking.',
      'Review trong WordPress, publish, sau đó lặp lại hằng tuần với keyword mới. Theo dõi GEO Share-of-Voice trong 4-8 tuần.',
    ],
    status: { live: 'Đang hoạt động', partial: 'Một phần', soon: 'Sắp có' },
  },
  ja: {
    pageTitle: 'ここでできること',
    introBeforeLive: '機能マップ全体です。',
    introAfterLive: 'をクリックして、',
    introBeforeSoon: 'の項目を試してください。',
    introAfterSoon: 'の項目は開発計画に含まれ、関連ブロックも表示されています。',
    featuresLive: '件の機能が利用可能',
    roadmap: 'ロードマップ全体:',
    expertTitle: '専門的なマーケティングフレームワークで生成',
    expertDescription: 'AIは汎用プロンプトではなく、実務で使われるマーケティングフレームワークを適用し、Brand IQの声に合わせて調整します。',
    frameworksLive: '41個中4個の専門フレームワークが利用可能',
    knowledgeAdapted: 'オープンソースの marketingskills ライブラリ（MIT）を参照しています。',
    browsePlaybooks: '41個のプレイブックを見る',
    quickStartTitle: (steps) => `Quick start - ${steps}ステップ、約10分`,
    mostImpactful: '最重要',
    complete: '完了',
    recommended: 'おすすめ',
    open: '開く',
    roadmapButton: 'ロードマップ上',
    powers: '用途:',
    recipeTitle: 'レシピ - WordPressを使うB2Bサービス会社',
    recipeDescription: '例: ブロックチェーン開発会社がGoogle、LinkedIn、ChatGPT経由で企業顧客に見つけてもらうための、Live機能だけを使った流れです。',
    missingTitle: '必要な機能がありませんか？',
    missingLink: 'CEO Advisorに伝える',
    missingSuffix: 'founderの要望としてプロダクトバックログに送られます。',
    websiteLiveTitle: '最初のWebサイトが公開済みです',
    websiteDraftTitle: '最初のWebサイトを仕上げる',
    websiteCreateTitle: '最初のWebサイトを作成',
    websiteLiveDesc: '公開ページは訪問者に表示できます。いつでも更新やページ追加ができます。',
    websiteDraftDesc: (count) => `AIが${count}件の初期ページ下書きを用意しました。1件を確認し、必要に応じて修正して公開してください。`,
    websiteCreateDesc: 'いくつかの簡単な質問に答えるだけで、AIがホームページを作成します。コードは不要です。',
    manageWebsite: 'Webサイト管理',
    reviewDrafts: '下書きを確認',
    createWebsite: 'Webサイト作成',
    quickSteps: {
      knowledge: 'Knowledgeに商品情報、FAQ、サンプル資料を追加します。すべてのagentが回答前に読む情報です。',
      brand: 'Brand IQを確認します。AIが会社データから自動作成するので、重要な情報が足りない時だけ補足してください。',
      competitors: 'Market & Competitorsで競合を3-5社追加します。GEOページのShare-of-Voice分析に使われます。',
      geo: 'AI Visibility (GEO)を開き、顧客がChatGPTに聞きそうな質問を1つ追加してRun Nowを押します。',
      editor: 'Content Editorでブログ下書きとtarget keywordを貼り付け、Gradeを実行し、最重要提案から改善します。',
      channels: 'ChannelsでFacebook Pageを接続し、顧客DMをunified inboxに集約します。',
    },
    recipeSteps: [
      'Brand IQ: WordPress URLと1-2件の事例を貼り付けます。B2Bの声、顧客像、ビジュアルを抽出します。',
      'WordPressを接続: サイトURLとApplication Passwordを入力します。下書きがWordPressに送られます。',
      'LinkedInを接続します。企業向けB2Bでは最重要チャネルになりやすいです。',
      'Market & Competitorsで類似会社や代替ベンダーを3-5社追加します。',
      'AI Visibility (GEO)で買い手がAIに聞く質問を追加し、baselineを測定します。',
      'Campaign Launcherを開き、keywordを選び、WordPressとLinkedInをONにしてlaunchします。',
      'WordPressで確認して公開します。毎週新しいkeywordで繰り返し、GEO Share-of-Voiceを追跡します。',
    ],
    status: { live: 'Live', partial: '一部対応', soon: '近日公開' },
  },
};

const WALKTHROUGH_TRANSLATIONS: Record<AppLanguage, Record<string, string>> = {
  en: {},
  vi: {
    '1 · Get found by AI & Google': '1. Được tìm thấy bởi AI & Google',
    'How your brand shows up in ChatGPT, Claude, Google AI Overviews, and traditional search.': 'Cách thương hiệu của bạn xuất hiện trong ChatGPT, Claude, Google AI Overviews và tìm kiếm truyền thống.',
    '2 · Publish content automatically': '2. Tự động xuất bản nội dung',
    'Blog posts, banners, social posts, landing pages — generated and ready to ship.': 'Blog, banners, social posts và landing pages được tạo sẵn để review và triển khai.',
    '3 · Talk to customers': '3. Trò chuyện với khách hàng',
    'Chatbot on your site + connected messaging channels with a unified inbox.': 'Chatbot trên website và các kênh nhắn tin được gom về một inbox.',
    '4 · Sell': '4. Bán hàng',
    'Pipeline, leads, outreach — convert visitors to revenue.': 'Pipeline, leads và outreach giúp biến visitor thành doanh thu.',
    '5 · See your AI company at work': '5. Xem AI company đang vận hành',
    'Agents, growth score, daily missions — the founder cockpit.': 'Agents, growth score và daily missions trong một màn điều hành cho founder.',
    '6 · Brain Hub — what reacts to your business in real time': '6. Brain Hub - lớp phản ứng realtime theo doanh nghiệp',
    'A source-agnostic intelligence layer. Every chatbot message, FB inbound, lead, and uploaded file flows in; watchers detect patterns; reactions draft the response.': 'Lớp intelligence gom dữ liệu từ chatbot, Facebook, leads và file upload; watchers phát hiện pattern và reactions tạo bản nháp phản hồi.',
    'Track how often your brand is named when people ask ChatGPT/Claude questions in your space.': 'Theo dõi thương hiệu của bạn được nhắc tới bao nhiêu lần khi khách hàng hỏi ChatGPT/Claude trong lĩnh vực của bạn.',
    'Paste a draft + target keyword. Get a 0-100 score against the live Google top-10.': 'Dán bản nháp và target keyword để nhận điểm 0-100 so với top 10 Google hiện tại.',
    'Track competitor websites, get weekly briefs, surface positioning gaps.': 'Theo dõi website đối thủ, nhận brief hằng tuần và tìm khoảng trống định vị.',
    'Feed your docs, FAQs, and product info so every AI agent answers in context.': 'Cung cấp tài liệu, FAQ và thông tin sản phẩm để mọi AI agent trả lời đúng ngữ cảnh.',
    'AI builds your voice, audience, positioning, and style from existing company data; add extra context whenever needed.': 'AI tạo voice, audience, positioning và style từ dữ liệu công ty; bạn có thể bổ sung thêm khi cần.',
    'Wrap a goal (launch, lead gen, awareness) into a 7-30 day plan the agents execute against.': 'Biến một mục tiêu như launch, lead gen hoặc awareness thành kế hoạch 7-30 ngày để agents triển khai.',
    'AI-built landing pages with hero, features, FAQ, lead form. Publish to a subdomain in one click.': 'Landing page do AI tạo với hero, features, FAQ và lead form. Publish chỉ với một click.',
    'Centralise logos, colors, hero images, banners — everything the creative engine can reuse.': 'Lưu logo, màu sắc, hero images và banners để creative engine tái sử dụng.',
    'Draft, schedule, and publish from one queue. Facebook Page publishing is live; Instagram + LinkedIn are draft-only for now.': 'Soạn, lên lịch và publish từ một hàng đợi. Facebook Page đã publish được; Instagram và LinkedIn hiện là draft.',
    'Add your topics once → the platform writes 1-2 SEO/GEO blog posts a day and publishes WordPress drafts for your approval. No daily effort.': 'Thêm topic một lần, hệ thống viết 1-2 bài SEO/GEO mỗi ngày và tạo WordPress draft để bạn duyệt.',
    'One keyword → blog + hero + in-content images + WordPress draft + LinkedIn/FB drafts + GEO tracking, all in one orchestrated run.': 'Một keyword tạo ra blog, hero image, ảnh trong bài, WordPress draft, LinkedIn/FB drafts và GEO tracking.',
    'Connect your WordPress site (Application Password). Blog drafts + featured images push straight in.': 'Kết nối WordPress bằng Application Password để đẩy blog draft và featured image trực tiếp.',
    'End-to-end pipeline: blog → script → rendered video → upload with SEO metadata.': 'Pipeline end-to-end: blog thành script, render video rồi upload kèm SEO metadata.',
    'Embed a chat widget on your site. Trained on your knowledge base, captures leads, handles support and sales questions.': 'Nhúng chatbot vào website. Chatbot đọc Knowledge Base, thu lead và trả lời câu hỏi sales/support.',
    'Connect a Facebook Page and publish approved campaign posts without copying tokens.': 'Kết nối Facebook Page và publish post đã duyệt mà không cần copy token thủ công.',
    'Unified thread view across all connected channels. Reply manually when AI auto-reply is off.': 'Xem toàn bộ hội thoại từ các kênh đã kết nối trong một inbox.',
    'Same unified inbox, more chat platforms. Schema is ready; awaiting platform API approvals.': 'Cùng một inbox cho nhiều nền tảng chat hơn. Schema đã sẵn sàng, chờ duyệt API.',
    'Track deals, lead scores, conversion stages. Powered by lead capture + email signals.': 'Theo dõi deals, lead scores và conversion stages dựa trên lead capture và email signals.',
    'Build sequences, enroll leads, track opens/clicks/replies. Send via Resend or SendGrid.': 'Tạo sequence, thêm leads, theo dõi opens/clicks/replies và gửi qua Resend hoặc SendGrid.',
    'Pay per published article, per qualified lead, per resolved ticket — not per seat.': 'Tính phí theo bài publish, qualified lead hoặc ticket xử lý xong, không theo seat.',
    "One screen: growth score, today's missions, agent activity, pipeline at a glance.": 'Một màn hình gồm growth score, nhiệm vụ hôm nay, hoạt động agent và pipeline.',
    "Strategic insights from your CEO Agent — what to focus on, what's working, what to drop.": 'Insight chiến lược từ CEO Agent: nên tập trung gì, cái gì đang hiệu quả, cái gì nên bỏ.',
    'Connect Google once → see real sessions, users, conversions, top pages and traffic channels from GA4.': 'Kết nối Google một lần để xem sessions, users, conversions, top pages và traffic channels từ GA4.',
    'Too technical to connect a platform? Drop a screenshot of Facebook Ads Manager, GA4, or any report and the AI reads the numbers and tells you what to do.': 'Nếu kết nối platform quá kỹ thuật, hãy upload screenshot từ Ads Manager, GA4 hoặc report; AI sẽ đọc số liệu và đề xuất việc cần làm.',
    '0-100 score across 4 areas + daily quests with streaks and rewards.': 'Điểm 0-100 trên 4 nhóm, kèm nhiệm vụ hằng ngày, streak và phần thưởng.',
    'Run any of 41 senior-practitioner playbooks — SEO audit, CRO, copywriting, pricing, churn, launch, and more — on demand.': 'Chạy 41 playbook chuyên gia như SEO audit, CRO, copywriting, pricing, churn, launch khi cần.',
    'Seven named team members (Cleo CEO, Cassie Support, Soshie Social, Seomi SEO, Geoffrey GEO, Penn Copy, Vio Video) — each with KPI dashboard and DM chat.': 'Các AI team member có vai trò riêng, mỗi người có KPI dashboard và chat riêng.',
    'Every agent A/B tests its own prompts weekly and learns from outcomes. The moat.': 'Mỗi agent tự A/B test prompt hằng tuần và học từ kết quả.',
    'One place for every signal — chatbot conversations, FB Messenger inbox, lead captures, plus any PDF/CSV/text you upload or paste.': 'Một nơi gom mọi tín hiệu: chatbot, Facebook Messenger, lead captures và các file PDF/CSV/text bạn upload hoặc dán vào.',
    '7 default watchers ship enabled: recurring questions, sales-objection clusters, praise candidates, lead spikes, churn-risk language, ICP signals, competitor mentions.': 'Có 7 watchers mặc định: câu hỏi lặp lại, objection sales, lời khen, lead spike, churn risk, ICP signals và competitor mentions.',
    'When a watcher fires, the Brain composes a draft (chatbot FAQ, comparison blog brief, or a "heads up" notification) for one-click review.': 'Khi watcher phát hiện tín hiệu, Brain sẽ tạo draft như chatbot FAQ, blog brief so sánh hoặc cảnh báo để bạn review một click.',
    'Polled trend feeds + OAuth connectors (Stripe / Fireflies / Intercom / HubSpot) so the Brain reacts to market shifts too.': 'Trend feeds và OAuth connectors giúp Brain phản ứng với thay đổi thị trường.',
    'AI Visibility (GEO)': 'AI Visibility (GEO)',
    'Content Editor (real-time SEO grader)': 'Content Editor (chấm điểm SEO realtime)',
    'Market & Competitors': 'Market & Competitors',
    'Knowledge Base & Business Brain': 'Knowledge Base & Business Brain',
    'Brand IQ (auto voice + audience extract)': 'Brand IQ (tự động tạo voice và audience)',
    'Campaigns': 'Campaigns',
    'Landing Pages': 'Landing Pages',
    'Brand Assets Library': 'Thư viện Brand Assets',
    'Social Media': 'Social Media',
    'Content Autopilot (1-2 blogs/day, automatic)': 'Content Autopilot (tự động 1-2 blog/ngày)',
    'Campaign Launcher (one-click multi-channel)': 'Campaign Launcher (multi-channel một click)',
    'WordPress publishing': 'Publish lên WordPress',
    'Real video rendering (TikTok / YouTube auto-publish)': 'Render video thật (TikTok / YouTube auto-publish)',
    'Site Chatbot': 'Chatbot website',
    'Channels (Facebook Page)': 'Channels (Facebook Page)',
    'Inbox · Messages': 'Inbox & Messages',
    'Zalo + WhatsApp + Instagram channels': 'Kênh Zalo + WhatsApp + Instagram',
    'Sales Pipeline': 'Sales Pipeline',
    'Outreach (cold email sequences)': 'Outreach (chuỗi cold email)',
    'Outcome-based billing': 'Tính phí theo kết quả',
    'Dashboard': 'Dashboard',
    'CEO Advisor': 'CEO Advisor',
    'Real analytics (Google Analytics 4)': 'Analytics thật (Google Analytics 4)',
    'Analyze a screenshot (no connection needed)': 'Phân tích screenshot (không cần kết nối)',
    'Growth Score & Daily Missions': 'Growth Score & Daily Missions',
    'Marketing Playbooks (41 expert frameworks)': 'Marketing Playbooks (41 framework chuyên gia)',
    'AI Employees with personalities': 'AI Employees có cá tính riêng',
    'Agent evolution loop (auto-improving prompts)': 'Vòng tiến hóa agent (tự cải thiện prompt)',
    'Brain Hub — Sources & Event Stream': 'Brain Hub - Sources & Event Stream',
    'Watchers — pattern detection': 'Watchers - phát hiện pattern',
    "Today's Reactions — proactive drafts": 'Today’s Reactions - draft chủ động',
    'External signals (Google Trends, Reddit, OAuth apps)': 'Tín hiệu bên ngoài (Google Trends, Reddit, OAuth apps)',
    'Blog posts & long-form content': 'Blog posts và nội dung dài',
    'Landing page hero & value-prop copy': 'Hero landing page và value proposition',
    'Ads — headlines, primary text, CTAs': 'Ads - headlines, primary text, CTAs',
    'Outreach sequences & nurture emails': 'Chuỗi outreach và email nurture',
  },
  ja: {
    '1 · Get found by AI & Google': '1. AIとGoogleで見つけられる',
    'How your brand shows up in ChatGPT, Claude, Google AI Overviews, and traditional search.': 'ChatGPT、Claude、Google AI Overviews、通常検索でブランドがどう表示されるかを把握します。',
    '2 · Publish content automatically': '2. コンテンツを自動公開する',
    'Blog posts, banners, social posts, landing pages — generated and ready to ship.': 'ブログ、バナー、SNS投稿、ランディングページを生成し、公開準備まで進めます。',
    '3 · Talk to customers': '3. 顧客と会話する',
    'Chatbot on your site + connected messaging channels with a unified inbox.': 'サイトのチャットボットと接続済みメッセージをunified inboxに集約します。',
    '4 · Sell': '4. 販売する',
    'Pipeline, leads, outreach — convert visitors to revenue.': 'Pipeline、leads、outreachで訪問者を売上に変えます。',
    '5 · See your AI company at work': '5. AI会社の稼働状況を見る',
    'Agents, growth score, daily missions — the founder cockpit.': 'Agents、growth score、daily missionsを一画面で確認します。',
    '6 · Brain Hub — what reacts to your business in real time': '6. Brain Hub - リアルタイムに反応する知能レイヤー',
    'A source-agnostic intelligence layer. Every chatbot message, FB inbound, lead, and uploaded file flows in; watchers detect patterns; reactions draft the response.': 'チャット、Facebook、lead、アップロード資料を取り込み、watchersがパターンを検出して反応案を作ります。',
    'Content Editor (real-time SEO grader)': 'Content Editor（リアルタイムSEO採点）',
    'Knowledge Base & Business Brain': 'Knowledge Base & Business Brain',
    'Brand IQ (auto voice + audience extract)': 'Brand IQ（voiceとaudienceを自動抽出）',
    'Brand Assets Library': 'ブランドアセットライブラリ',
    'Content Autopilot (1-2 blogs/day, automatic)': 'Content Autopilot（1日1-2本のブログ自動生成）',
    'Campaign Launcher (one-click multi-channel)': 'Campaign Launcher（ワンクリック・マルチチャネル）',
    'WordPress publishing': 'WordPress公開',
    'Real video rendering (TikTok / YouTube auto-publish)': '動画レンダリング（TikTok / YouTube自動公開）',
    'Site Chatbot': 'サイトチャットボット',
    'Channels (Facebook Page)': 'Channels（Facebook Page）',
    'Inbox · Messages': 'Inbox・Messages',
    'Zalo + WhatsApp + Instagram channels': 'Zalo + WhatsApp + Instagramチャネル',
    'Sales Pipeline': 'Sales Pipeline',
    'Outreach (cold email sequences)': 'Outreach（コールドメールシーケンス）',
    'Outcome-based billing': '成果ベース課金',
    'Real analytics (Google Analytics 4)': 'リアル分析（Google Analytics 4）',
    'Analyze a screenshot (no connection needed)': 'スクリーンショット分析（接続不要）',
    'Growth Score & Daily Missions': 'Growth Score & Daily Missions',
    'Marketing Playbooks (41 expert frameworks)': 'Marketing Playbooks（41個の専門フレームワーク）',
    'AI Employees with personalities': '個性を持つAI社員',
    'Agent evolution loop (auto-improving prompts)': 'Agent進化ループ（prompt自動改善）',
    'Brain Hub — Sources & Event Stream': 'Brain Hub - Sources & Event Stream',
    'Watchers — pattern detection': 'Watchers - パターン検出',
    "Today's Reactions — proactive drafts": 'Today’s Reactions - 能動的な下書き',
    'External signals (Google Trends, Reddit, OAuth apps)': '外部シグナル（Google Trends、Reddit、OAuth apps）',
    'Blog posts & long-form content': 'ブログ記事と長文コンテンツ',
    'Landing page hero & value-prop copy': 'ランディングページのheroと価値提案コピー',
    'Ads — headlines, primary text, CTAs': '広告のheadline、primary text、CTA',
    'Outreach sequences & nurture emails': 'アウトリーチシーケンスとナーチャリングメール',
  },
};

function translateWalkthroughString(language: AppLanguage, value?: string) {
  if (!value) return value;
  return WALKTHROUGH_TRANSLATIONS[language]?.[value] ?? value;
}

function localizeSections(sections: Section[], language: AppLanguage): Section[] {
  return sections.map((section) => ({
    ...section,
    title: translateWalkthroughString(language, section.title) || section.title,
    subtitle: translateWalkthroughString(language, section.subtitle) || section.subtitle,
    features: section.features.map((feature) => {
      const localizedWhatItDoes = translateWalkthroughString(language, feature.whatItDoes);
      return {
        ...feature,
        name: translateWalkthroughString(language, feature.name) || feature.name,
        description: translateWalkthroughString(language, feature.description) || feature.description,
        whatItDoes: language === 'en' || localizedWhatItDoes !== feature.whatItDoes
          ? localizedWhatItDoes
          : undefined,
      };
    }),
  }));
}

const STATUS_BADGES: Record<FeatureStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  live: { label: 'Live', className: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  partial: { label: 'Partial', className: 'bg-amber-100 text-amber-700 border-amber-200', icon: Wrench },
  soon: { label: 'Coming soon', className: 'bg-slate-100 text-slate-600 border-slate-200', icon: Clock },
};

function FeatureRow({ feature, copy }: { feature: Feature; copy: typeof WALKTHROUGH_COPY[AppLanguage] }) {
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
              <StatusIcon className="w-2.5 h-2.5" /> {copy.status[feature.status]}
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
                {copy.open} <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          ) : (
            <Button size="sm" variant="ghost" disabled>
              {copy.roadmapButton}
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
  const language = normalizeAppLanguage(company?.settings?.language);
  const copy = WALKTHROUGH_COPY[language] || WALKTHROUGH_COPY.en;
  const sections = localizeSections(SECTIONS(companyId), language);
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
          <Sparkles className="w-7 h-7 text-primary" /> {copy.pageTitle}
        </h1>
        <p className="text-muted-foreground mt-2">
          {copy.introBeforeLive} <em>{copy.open}</em> {copy.introAfterLive}{' '}
          <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 align-middle mx-1">
            {copy.status.live}
          </Badge>
          {copy.introBeforeSoon}{' '}
          <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 align-middle mx-1">
            {copy.status.soon}
          </Badge>
          {copy.introAfterSoon}
        </p>
      </div>

      {/* Snapshot card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-5 flex items-center gap-6 flex-wrap">
          <div className="flex items-baseline gap-2">
            <div className="text-4xl font-bold text-primary tabular-nums">{totals.live}</div>
            <div className="text-sm text-muted-foreground">{copy.featuresLive}</div>
          </div>
          <div className="flex-1 min-w-[200px] text-sm space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> {totals.live} {copy.status.live}
              </span>
              <span className="flex items-center gap-1 text-amber-700">
                <Wrench className="w-3.5 h-3.5" /> {totals.partial} {copy.status.partial}
              </span>
              <span className="flex items-center gap-1 text-slate-600">
                <Clock className="w-3.5 h-3.5" /> {totals.soon} {copy.status.soon}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {copy.roadmap} <code className="bg-white px-1 py-0.5 rounded">docs/strategy/build-now-plan.md</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Expert frameworks — the knowledge layer powering generations */}
      <Card className="border-amber-200 bg-gradient-to-br from-amber-50/70 to-orange-50/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600" /> {copy.expertTitle}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {copy.expertDescription} <strong>{copy.frameworksLive}</strong>.
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
                        <CheckCircle2 className="w-2.5 h-2.5" /> {copy.status.live}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {copy.powers} {translateWalkthroughString(language, item.powers)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] text-muted-foreground">
              {copy.knowledgeAdapted}
            </p>
            <Link href={`/${companyId}/playbooks`}>
              <Button size="sm" variant="outline" className="gap-1">
                <BookOpen className="w-3 h-3" /> {copy.browsePlaybooks} <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Quick start */}
      <Card data-guided-tour="walkthrough-quick-start">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary" /> {copy.quickStartTitle(showWebsiteStep ? 7 : 6)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <span>{copy.quickSteps.knowledge}</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <span>
                {copy.quickSteps.brand}
                <span className="inline-block ml-1 text-[10px] uppercase font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                  {copy.mostImpactful}
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
                            ? copy.websiteLiveTitle
                            : hasWebsiteDrafts
                              ? copy.websiteDraftTitle
                              : copy.websiteCreateTitle}
                      </span>
                      <Badge
                        variant="outline"
                        className={`h-5 px-1.5 text-[10px] font-medium ${
                          publishedWebsitePage
                            ? 'border-emerald-300 bg-white/80 text-emerald-700'
                            : 'border-indigo-300 bg-white/80 text-indigo-700'
                        }`}
                      >
                          {publishedWebsitePage ? copy.complete : copy.recommended}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                        {publishedWebsitePage
                          ? copy.websiteLiveDesc
                          : hasWebsiteDrafts
                            ? copy.websiteDraftDesc(landingPages.length)
                            : copy.websiteCreateDesc}
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
                          ? copy.manageWebsite
                          : hasWebsiteDrafts
                            ? copy.reviewDrafts
                            : copy.createWebsite}
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
              <span>{copy.quickSteps.competitors}</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                {showWebsiteStep ? '5' : '4'}
              </span>
              <span>
                {copy.quickSteps.geo}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                {showWebsiteStep ? '6' : '5'}
              </span>
              <span>{copy.quickSteps.editor}</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                {showWebsiteStep ? '7' : '6'}
              </span>
              <span>{copy.quickSteps.channels}</span>
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
                <FeatureRow key={f.name} feature={f} copy={copy} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Recipe: B2B + WordPress (bap-blockchain.com style) */}
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-blue-50/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="w-4 h-4 text-indigo-600" /> {copy.recipeTitle}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {copy.recipeDescription}
          </p>
        </CardHeader>
        <CardContent>
          <ol className={`space-y-2 text-sm ${language === 'en' ? '' : 'hidden'}`}>
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
          {language !== 'en' && (
            <ol className="space-y-2 text-sm">
              {copy.recipeSteps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="p-5 text-center text-sm text-muted-foreground">
          {copy.missingTitle}{' '}
          <Link href={`/${companyId}/insights`} className="text-primary underline font-medium">
            {copy.missingLink}
          </Link>{' '}
          - {copy.missingSuffix}
        </CardContent>
      </Card>
    </div>
  );
}
