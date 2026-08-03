# Architecture Overview

What the system does, the main concepts, and how pieces fit together. Read after [local-setup.md](./local-setup.md).

## The product in one paragraph

1Person is a **Business Operating System for a solo founder powered by AI agents**. A user types their business idea or URL → the system generates a company profile, brand, landing page, marketing campaigns, and a team of AI agents that execute daily. The founder (CEO) reviews insights, approves key moves, and steers strategy via a daily "CEO Advisor" brief. Everything is gamified (Growth Score, Daily Missions, Streaks) to make the founder want to come back every day.

## The mental model (5 layers)

```
┌─────────────────────────────────────────────────────┐
│  5. UI — Next.js dashboard, FTUX wizard, admin      │
├─────────────────────────────────────────────────────┤
│  4. API — Hono REST endpoints, auth, credits        │
├─────────────────────────────────────────────────────┤
│  3. Services — business logic, LLM calls, agents    │
├─────────────────────────────────────────────────────┤
│  2. Brain + Memory — tenant-scoped knowledge store  │
├─────────────────────────────────────────────────────┤
│  1. Data — Postgres + pgvector, Redis, Qdrant       │
└─────────────────────────────────────────────────────┘
```

All AI flows follow the same pattern: **UI → API route → Service → LLM + memory → save back to DB → return JSON.** When you add a feature, you touch all 5 layers end-to-end.

## Core concepts (vocabulary)

You'll see these terms in code and docs. Know them before you read any module.

| Term | What it is | Lives in |
|------|-----------|----------|
| **Company** | A business owned by a user. All data is scoped by `companyId`. | `packages/core/src/db/schema/companies.ts` |
| **Tenant** | The AI-layer twin of a company — owns the Brain, RAG store, audit trail. One tenant per company. | `packages/ai-tenant/` |
| **FTUX** | First-Time User Experience. The onboarding wizard that generates the entire company from a prompt or URL. | `apps/api/src/routes/ftux.ts`, `apps/web/src/app/(ftux)/` |
| **CEO Advisor** | Evidence-grounded CEO brief with market pulse, prioritized decisions, weekly actions, and execution owners. 10 credits per refresh. | `apps/api/src/services/{advisor-context-builder,ceo-advisor}.ts`, `routes/insights.ts` |
| **Brain** | Tenant-scoped memory: brand voice, personas, products, market position, learnings. Every AI call reads from it; many write back. | `packages/ai-tenant/src/brain-store.ts` |
| **Knowledge Base** | Versioned documents + extracted structured data. Crawl Data discovers verified public sources before selected items enter the review lifecycle. | `packages/core/src/db/schema/memory.ts`, `apps/api/src/routes/knowledge.ts` |
| **Agents** | Autonomous workers with roles, KPIs, budgets, and performance scores. The CEO manages a team of them. | `packages/core/src/db/schema/agents.ts` |
| **Credits** | The currency. Every AI action costs credits, shown in UI before charge. | `apps/api/src/lib/credits.ts` |
| **Campaign** | Marketing execution unit for banners, social posts, blog, and async AI video. State machine: draft→active→live→completed. | `packages/core/src/db/schema/marketing.ts` |
| **Landing Page** | AI-generated multi-block page, versioned, publishable, with analytics. | `apps/api/src/services/landing-page-service.ts` |
| **Market Intelligence** | Competitor tracking + signals + weekly digest + positioning map + memory loop to Brain. | `apps/api/src/services/{suggest-competitors,competitor-brief,market-digest,positioning-map}.ts` |
| **Growth Score** | 0–100 aggregate across Marketing/SEO/Automation/Revenue. Drives gamification. | `apps/api/src/services/growth-score.ts` |
| **Daily Missions** | 3–5 daily tasks generated from CEO Advisor actions. Completing builds streak. | `apps/api/src/services/daily-missions.ts` |

## Repository layout

```
1person/
├── apps/
│   ├── api/         Hono REST API — all backend business logic
│   ├── web/         Next.js 14 App Router — dashboard, FTUX, admin
│   ├── worker/      BullMQ background worker
│   └── cli/         Admin CLI tools
├── packages/
│   ├── core/        Shared domain: DB schemas (Drizzle), auth, utils
│   ├── ai-tenant/   Tenant AI layer: Brain store, RAG, audit, CEO advisor store
│   ├── workflow/    Placeholder for the 8-engine orchestration system (planned)
│   └── ui/          Shared shadcn/ui primitives
├── services/        Microservice placeholders (empty — future work)
├── docs/
│   ├── onboarding/  You are here
│   ├── architecture/  System design docs and current feature pipelines
│   ├── brainstorm/  160+ detailed feature specs
│   ├── guides/      CEO walkthrough, on-premise deploy
│   └── screen-specs/  UX mockups
├── docker-compose.yml       Local dev services
├── CLAUDE.md                Project vision + principles (READ THIS)
└── pnpm-workspace.yaml
```

### `apps/api` — structure

```
src/
├── index.ts         Hono app + all route registrations + server bootstrap
├── routes/          One file per domain: auth, companies, agents, tasks,
│                    ftux, insights (CEO advisor), market, knowledge,
│                    chatbot, blog, meetings, landing-pages, ...
├── services/        Business logic: each route delegates here.
│                    Examples: ceo-advisor.ts, growth-score.ts,
│                    daily-missions.ts, suggest-competitors.ts, etc.
├── lib/             Shared: db, env, auth (JWT), llm, credits, tenant-ai, seed
├── middleware/      authMiddleware, errorHandler
├── workers/         Background jobs (BullMQ consumers, feedback cron)
└── agents/          Legacy agent implementations (business-understanding,
                     crawler, landing-page, marketing, etc.)
```

**Route registration pattern** (in `index.ts`):
```ts
import xRouter from './routes/x';
api.route('/x', xRouter);
```

**Every route:**
1. Uses `authMiddleware` → `c.get('user')` gives `userId`
2. Verifies ownership (`companyId` belongs to `userId`)
3. Resolves tenant via `ensureTenantForCompany(companyId, companyName)`
4. Calls a service
5. Returns `{ success: true, data: ... }`

### `apps/web` — structure

```
src/
├── app/
│   ├── (auth)/           /login, /register
│   ├── (ftux)/           /welcome (onboarding)
│   ├── (dashboard)/      /[companyId]/* (all authenticated pages)
│   │   ├── page.tsx      Main dashboard (Growth Score, Missions, Stats)
│   │   ├── market/       Competitors + digest + positioning
│   │   ├── campaigns/    Marketing campaigns
│   │   ├── landing-pages/ Page builder
│   │   ├── brain/        Brain editor
│   │   ├── knowledge/    Knowledge base
│   │   ├── chatbot/      Chatbot builder
│   │   ├── insights/     CEO Advisor full view
│   │   └── ... (40+ pages total)
│   └── admin/            Admin-only panels
├── components/
│   ├── ui/               shadcn/ui primitives (Button, Card, Dialog, ...)
│   ├── dashboard/        Gamification widgets
│   ├── market/           Market intelligence components
│   ├── landing-pages/    Page builder blocks
│   ├── marketing/        Campaign components
│   ├── ftux/             Onboarding wizard views
│   └── layout/           Sidebar, header
├── lib/
│   ├── api/              client.ts + hooks.ts (React Query hooks)
│   ├── i18n.ts           Translations
│   └── utils.ts          cn(), formatters
└── stores/
    └── auth-store.ts     Zustand auth store
```

**Data-fetching pattern**: every page uses hooks from `lib/api/hooks.ts`. These wrap React Query + the auth token. Add a new hook when you add a new endpoint.

### `packages/core` — structure

```
src/db/
├── index.ts         createDb(), exports everything
└── schema/
    ├── companies.ts, users.ts, agents.ts, tasks.ts
    ├── marketing.ts (campaigns, banners, social posts)
    ├── landing-pages.ts, tracking.ts, ads.ts
    ├── knowledge.ts, memory.ts (knowledge_base, agent_memories)
    ├── chatbot.ts, meetings.ts, outreach.ts (leads, emails)
    ├── company-state.ts (health score, strategy, SWOT)
    ├── strategy-horizon.ts (OKRs)
    ├── economy.ts (credits, transactions)
    ├── gamification.ts (ceo_daily_missions, ceo_streaks) ← recent addition
    ├── onboarding.ts (guidance, progress)
    └── ... (32 total)
```

All schemas use Drizzle ORM. Each table exports a named constant (`export const users = pgTable(...)`) plus relations.

After schema changes:
```bash
pnpm --filter @1person/core build                # rebuild types
pnpm --filter @1person/core db:push              # push to DB (dev)
# OR for production:
pnpm --filter @1person/core db:generate          # generate migration
pnpm --filter @1person/core db:migrate           # apply migration
```

### `packages/ai-tenant` — structure

This package owns tenant-scoped AI data — the "Brain" of each company.

```
src/
├── index.ts             TenantAI singleton with namespaces: brain, market, 
│                        ceoAdvisor, knowledge, deals, agentRuntime
├── schema.ts            trustai_* tables (tenant, audit, market_competitors, ...)
├── brain-store.ts       getSnapshot, appendLearning, upsertMarketPosition, ...
├── market-scan-store.ts listCompetitors, createCompetitor, startScan, ...
├── ceo-advisor-store.ts appendBrief, getLatestBrief
├── config-store.ts      Per-tenant config
├── credit-store.ts      Credit ledger
├── rag-pipeline.ts      Document → chunks → embeddings → search
└── audit-trail.ts       Append-only tamper-detecting audit log
```

Usage in API:
```ts
import { getTenantAI } from '../lib/tenant-ai';

const ai = getTenantAI();
const snapshot = await ai.brain.getSnapshot(tenantId);
await ai.market.createCompetitor(tenantId, input, `user:${userId}`);
```

## Key workflows (end-to-end)

### 1. First-Time User Experience (FTUX)

User types business prompt or URL → 2-minute wizard that creates everything:

```
/welcome (UI wizard)
   ↓
POST /api/v1/ftux/process
   ↓ (async — poll GET /ftux/status/:sessionId)
1. Crawl website → BusinessProfile
2. Generate brand identity (colors, voice, logo)
3. Generate master plan (SEO, content, social)
4. Create company + landing page
5. Seed 2 marketing campaigns
6. Create agent team with roles
   ↓
Redirect to /[companyId] dashboard
```

Key files: `apps/api/src/routes/ftux.ts`, `apps/api/src/services/ftux-processor.ts`, `apps/web/src/app/(ftux)/welcome/page.tsx`.

### 2. Daily CEO flow

```
User opens /[companyId]
   ↓
Dashboard loads:
  - Growth Score widget (marketing/SEO/automation/revenue)
  - Today's Focus (3-5 missions from latest CEO Advisor brief)
  - Streak badge
  - Milestone toasts (if threshold crossed)
  - System progress bars
  - Achievements panel
   ↓
User clicks mission "Go" → navigates to relevant page
User completes action → clicks checkbox → streak increments
```

When the brief is stale, user clicks "Refresh advice" (10 credits) on `/insights` → `generateCeoBrief()` → new brief stored → dashboard re-derives missions.

The brief rebuilds a source-health-aware context from Company/Brand IQ, Brain
and Knowledge Hub, campaigns and videos, content, landing pages, Market scans,
sales, and Your AI Team. Every recommendation must cite evidence from that
context. See `docs/architecture/16-ceo-advisor-intelligence.md`.

### 3. Market Intelligence loop

```
1. User adds competitors (manual or AI-suggested from business context)
2. User clicks "Scan now" (5 credits)
   → fetches site (Jina) + news (Google News RSS)
   → LLM extracts signals
   → saves to market_competitors + creates scan record
   → saveScanToBrain() → appends learning + updates SWOT in Brain
3. Per-competitor: "Brief me" / "Create Us vs Them page" / signals → 1-click actions
4. Weekly digest aggregates all signals → 3 recommended actions
5. Positioning map: 2D scatter of you vs competitors on AI-picked axes
```

Key files: all `apps/api/src/services/{market-memory,competitor-brief,market-digest,positioning-map,suggest-competitors}.ts`.

### 4. Knowledge Crawl Data

```
1. User enters an optional website and/or topic
2. AI expands the topic and public discovery finds candidate sources
3. URL, identity, topic, and readable-content checks remove weak results
4. User selects only useful sources (none are preselected)
5. Selected URLs enter the normal Knowledge extraction and review lifecycle
```

Discovery costs 20 company credits; import has no second charge. See
`docs/architecture/15-knowledge-crawl-data.md`.

### 5. Campaign AI Video

```
Campaign Detail -> submit OpenRouter job -> return project/job ID
                -> VideoRenderCron polls -> save completed file to AWS S3
                -> charge 50 company credits -> apply to draft social posts
```

Failed video jobs are not charged. See
`docs/architecture/14-campaign-ai-video-pipeline.md`.

## Tech stack (quick reference)

**Backend**: Hono, Drizzle ORM, Zod, BullMQ  
**Frontend**: Next.js 14 (App Router), React Query, Zustand, shadcn/ui, Tailwind, Framer Motion, Recharts  
**Data**: Postgres 16 + pgvector, Redis 7, Qdrant (embeddings), Meilisearch (full-text)  
**AI**: Anthropic Claude (primary), OpenAI GPT-4 (fallback), OpenAI embeddings, local Whisper  
**Observability**: Langfuse (LLM traces), OpenTelemetry (planned)  
**Auth**: JWT (header or query-param for SSE)

## Coding conventions

- **Service over route.** Routes are thin: parse + auth + delegate. All logic in `services/`.
- **Type safety end-to-end.** Zod schemas on inputs, Drizzle schemas for DB, no `any`.
- **Credits upfront.** Before charging, show cost in UI. Call `ensureSufficientCredits` then `chargeFixedCredits`.
- **Tenant isolation.** Never cross `tenantId` boundaries. Always verify `companyId` ownership.
- **Dead code is forbidden.** If you add a backend endpoint, wire it to UI in the same PR.
- **Memory over ephemerality.** Anything worth remembering goes into Brain via `ai.brain.*`.

## Where the features live

| Feature | Backend service | Frontend page/component |
|---------|----------------|------------------------|
| Dashboard + Growth Score | `services/growth-score.ts`, `services/daily-missions.ts` | `app/(dashboard)/[companyId]/page.tsx`, `components/dashboard/*` |
| FTUX wizard | `routes/ftux.ts`, `services/ftux-processor.ts` | `app/(ftux)/welcome/page.tsx`, `components/ftux/*` |
| CEO Advisor | `services/ceo-advisor.ts`, `routes/insights.ts` | `app/(dashboard)/[companyId]/insights/page.tsx` |
| Market Intelligence | `services/{market-*,competitor-*,positioning-*,suggest-*}.ts` | `app/(dashboard)/[companyId]/market/page.tsx`, `components/market/*` |
| Campaigns + AI Video | `services/{marketing-autonomous,campaign-video-creative}.ts`, `workers/video-render-cron.ts`, `routes/marketing-engine.ts` | `app/(dashboard)/[companyId]/campaigns/*` |
| Landing Pages | `services/landing-page-service.ts`, `routes/landing-pages.ts` | `app/(dashboard)/[companyId]/landing-pages/*` |
| Knowledge Base + Crawl Data | `routes/knowledge.ts`, `services/{business-context,knowledge-crawl-discovery,public-discovery}.ts` | `app/(dashboard)/[companyId]/knowledge/*` |
| Brain editor | `routes/brain.ts`, `packages/ai-tenant/src/brain-store.ts` | `app/(dashboard)/[companyId]/brain/page.tsx` |
| Chatbot | `routes/chatbot.ts`, `packages/ai-tenant/src/rag-pipeline.ts` | `app/(dashboard)/[companyId]/chatbot/page.tsx` |

## Deeper reading

Once this overview makes sense, the deep dives live in:

- `docs/architecture/01-requirements-summary.md` → what problem we're solving
- `docs/architecture/02-system-architecture.md` → system diagram
- `docs/architecture/03-database-schema.md` → all 32 tables
- `docs/architecture/04-api-design.md` → REST conventions
- `docs/architecture/05-frontend-structure.md` → Next.js layout details
- `docs/architecture/10-venture-ceo-ia.md` → CEO Advisor interaction architecture
- `docs/architecture/13-ai-work-outputs.md` → reviewable outputs from AI recommendations
- `docs/architecture/14-campaign-ai-video-pipeline.md` → async campaign video generation
- `docs/architecture/15-knowledge-crawl-data.md` → public discovery and Knowledge import
- `docs/architecture/16-ceo-advisor-intelligence.md` → evidence-grounded CEO Advisor implementation
- `docs/architecture/workflow-architecture.md` → 8-engine orchestration (future)
- `docs/brainstorm/*.md` → 160+ feature specs (search by filename)
- `CLAUDE.md` → project vision + principles (always up to date)

## Next

Skim [codebase-tour.md](./codebase-tour.md) for a concrete "where is X?" reference, then start your first PR.
