# 07 — Marketing & Execution Roadmap

> Companion to [`06-transparent-data-system.md`](./06-transparent-data-system.md).
> Doc 06 covers the **Trust** axis (data, privacy, lineage). This doc
> covers the **Outcome** axis (crawl → memory → generate → publish →
> run → track) — the user's "ideal flow."
>
> Last updated: 2026-04-08
> Status: Strategy doc — informs follow-up implementation plans.

---

## §1 — The ideal flow (the user's vision)

```
User enters website
  └─ System: crawl + extract data
  └─ System: build memory (Business Brain)
  └─ AI: generate SEO articles, ads copy, banners
  └─ Auto: publish landing pages, run ads
  └─ Track: performance + feedback loop → AI re-optimizes
```

This is **L1 → L2 → L4 → L5 → L6** of the six-layer model from doc 06
§4. Doc 06 owns the L2 (Memory / Business Brain) and L6 (Trust) gaps.
This doc owns L1, L4, and L5 — and explicitly tracks the **glue between
them**, because most of the failure mode in this kind of system is not
"a piece is missing" but "the pieces aren't wired into one continuous
button."

---

## §2 — Inventory: what is actually built (verified by reading the repo)

The honest answer is **way more than the `IMPLEMENTATION_STATUS.md`
(15–30%) suggests**. That doc tracks the abstract `packages/workflow`
engine layer; the *concrete* services in `apps/api/src/services` are
much further along. ~9,000 lines across the marketing/execution routes
alone.

### L1 — Data ingestion

| Capability | File | LOC | Status |
|---|---|---|---|
| Website crawler | `apps/api/src/agents/crawler-agent.ts` | 219 | ✅ Done |
| Website analyzer | `apps/api/src/services/website-analyzer.ts` | — | ✅ Done |
| Content extraction | `apps/api/src/agents/content-extraction-agent.ts` | 253 | ✅ Done |
| Knowledge extraction service | `apps/api/src/services/knowledge-extraction.ts` | — | ✅ Done |
| PDF extractor | `apps/api/src/services/pdf-extractor.ts` | — | ✅ Done |
| Knowledge upload UI | `apps/web/src/app/(dashboard)/[companyId]/knowledge/page.tsx` | — | ✅ Done |
| FTUX onboarding processor | `apps/api/src/services/ftux-processor.ts` | — | ✅ Done |
| FTUX HTTP route | `apps/api/src/routes/ftux.ts` | — | ✅ Done |
| Integrations connectors (Shopify, Notion, GDrive…) | `apps/api/src/routes/integrations.ts` | — | ⚠️ Partial — route exists, real OAuth/connectors thin |

**L1 verdict:** the user *can* paste a URL today and the system *will*
crawl + extract + create initial knowledge. Strong.

### L2 — Memory layer (Business Brain)

| Capability | File | Status |
|---|---|---|
| Vector + tags memory store | `packages/core/src/db/schema/memory.ts: agentMemories`, `knowledgeBase` | ✅ Done (unstructured) |
| Memory wrapper for agents | `apps/api/src/agents/memory.ts` | ✅ Done |
| Business understanding (derives company facts) | `apps/api/src/agents/business-understanding-agent.ts` (269 LOC) | ✅ Done |
| Brand identity service | `apps/api/src/services/brand-identity-service.ts` | ✅ Done |
| Business context builder (composes memory for prompts) | `apps/api/src/services/business-context.ts` | ✅ Done |
| **Structured Brand Voice store (editable, versioned)** | — | ❌ **Missing** |
| **Structured Persona store** | — | ❌ **Missing** |
| **Structured Product catalog** | — | ❌ **Missing** |
| **Structured Campaign-history store** | `campaigns` table exists for state, but no "lessons learned" derived store | ⚠️ Partial |

**L2 verdict:** memory exists but as an unstructured vector dump. The
**editable Business Brain** the user described — where a non-tech user
can open "Brand Voice" and edit "tone: friendly" — does not exist as a
structured product yet. **This is the same gap doc 06 §6a calls out
under L3 of its model.** Both docs converge on it.

### L4 — Agents

The agent layer is wider than expected.

| Agent | File | LOC | Status |
|---|---|---|---|
| Base / Registry | `base-agent.ts`, `agent-registry.ts`, `index.ts` | 64+62+56 | ✅ Done |
| Orchestrator | `orchestrator.ts` | 364 | ✅ Done |
| Planner | `planner-agent.ts` | 250 | ✅ Done |
| Crawler | `crawler-agent.ts` | 219 | ✅ Done |
| Content extraction | `content-extraction-agent.ts` | 253 | ✅ Done |
| Business understanding | `business-understanding-agent.ts` | 269 | ✅ Done |
| Landing page | `landing-page-agent.ts` | 246 | ✅ Done |
| Marketing | `marketing-agent.ts` | 96 | ⚠️ Thin |
| SEO audit | `seo-audit-agent.ts` | 112 | ⚠️ Thin |
| Social | `social-agent.ts` | 104 | ⚠️ Thin |
| Sales | `sales-agent.ts` | 54 | ⚠️ Thin |
| Social detection | `social-detection-agent.ts` | 51 | ⚠️ Thin |
| Growth Brain | `growth-brain.ts` | 366 | ✅ Done |
| Feedback loop | `feedback-loop.ts` | 145 | ✅ Done |
| Memory wrapper | `memory.ts` | 159 | ✅ Done |

Plus a richer **skills** layer in `services/skills/`:
`content-skills.ts`, `marketing-skills.ts`, `sales-skills.ts`,
`support-skills.ts`. And a **services/engines/** layer:
`agent-execution-loop.ts`, `content-planning-engine.ts`,
`content-research-engine.ts`, `seo-content-factory.ts`,
`seo-ranking-feedback-engine.ts`, `optimization-engine.ts`,
`landing-page-deployment-engine.ts`, `landing-page-seo-engine.ts`,
`market-intelligence-engine.ts`.

**L4 verdict:** the SEO / Marketing / Social / Sales agents themselves
are *thin* (96–112 LOC) but the heavy lifting moved to the *engines*
and *skills* layers. The agents act as glue / API surface. The
verticalized "SEO Agent / Ads Agent / Banner Agent" experience the user
wants exists in pieces, **but not as a unified, opinionated, business-
language UI.**

### L5 — Execution

| Capability | File | LOC | Status |
|---|---|---|---|
| Ads engine (campaigns, ad sets, ads, performance) | `services/ads-engine.ts`, `routes/ads.ts` | 341 (route) | ✅ Done |
| Ad-platform providers | `services/platforms/providers/` — `facebook.ts`, `google-ads.ts`, `instagram.ts`, `linkedin.ts`, `tiktok.ts`, `twitter.ts`, `youtube.ts` | — | ✅ Done (7 platforms) |
| Marketing engine HTTP route | `routes/marketing-engine.ts` | 1403 | ✅ Done |
| Marketing autonomous (end-to-end campaign flow) | `services/marketing-autonomous.ts` | — | ✅ Done |
| Marketing frameworks library | `services/marketing-frameworks.ts` | — | ✅ Done |
| Landing pages CRUD + sections | `routes/landing-pages.ts`, `services/landing-page-service.ts` | 1100 (route) | ✅ Done |
| Landing page renderer | `services/page-renderer-service.ts` | — | ✅ Done |
| Deployment service (Vercel + Cloudflare Pages + S3) | `services/deployment-service.ts`, `services/s3-deploy.ts` | — | ✅ Done |
| SEO engine | `routes/seo-engine.ts`, `services/seo-engine.ts` | 1085 (route) | ✅ Done |
| Google Search Console client | `services/gsc-client.ts` | — | ✅ Done |
| Outreach engine | `routes/outreach.ts`, `services/outreach-engine.ts` | 390 (route) | ✅ Done |
| Lead capture engine | `routes/lead-capture.ts`, `services/lead-capture-engine.ts` | 358 (route) | ✅ Done |
| Tracking engine (sessions, page views, events, conversions, daily metrics, attribution) | `routes/tracking.ts`, `services/tracking-engine.ts`, `services/attribution.ts` | 619 (route) | ✅ Done |
| Performance tracker | `services/performance-tracker.ts` | — | ✅ Done |
| Execution metrics | `routes/execution-metrics.ts`, `services/execution-metrics-service.ts` | 187 (route) | ✅ Done |
| CMS integration | `services/cms-integration.ts` | — | ⚠️ Partial |
| Distribution engine | `services/distribution-engine.ts` | — | ✅ Done |
| Asset generation (images, video) | `services/asset-generation-service.ts`, `services/image-generator.ts`, `services/video-engine.ts`, `services/creative-adapter.ts`, `services/creative-quality.ts` | — | ✅ Done |

**L5 verdict:** every box on the user's whiteboard exists as code.
Including 7 ad platforms, 3 deployment targets, full attribution and
daily metrics. **The platform is much further along than the user
believes.** What's missing is mostly *the connecting button*.

### Schema for the flow

`packages/core/src/db/schema/marketing.ts` already defines
`campaigns`, `banners`, `social_posts` with a full state machine:
`planned → generating → ready → launching → live → optimizing`. The
state machine matches the user's ideal flow exactly.

### Feedback loop

`agents/feedback-loop.ts` (145 LOC) plus `growth-brain.ts` (366) plus
`services/engines/seo-ranking-feedback-engine.ts` plus
`workers/feedback-cron.ts` together form a working background loop.

---

## §3 — The honest gaps

Based on §2, the gap list is shorter and more specific than the
"15–30% skeleton" framing suggests:

### G1. There is no single "1-click campaign" button
Each layer is callable, but there is no single entrypoint that says:
"User clicks 'Generate Campaign' → orchestrator runs Crawl (skip if
done) → Brain build → SEO + Ads + Banner generation → land in `ready`
state → user reviews → 1 click to launch all." The pieces exist; the
**continuous flow** does not. This is the single highest-leverage fix.

### G2. Structured Business Brain (shared with doc 06 §6a)
Brand voice, persona, products, and campaign learnings live as
unstructured vector entries. Non-tech users cannot open "Brand Voice"
and edit "tone: friendly, words to avoid: cheap, urgent". This is a
**shared gap with doc 06** — both axes need it. **Build once, list in
both docs.**

### G3. The thin verticalized agents need a real prompt + skill kit
`marketing-agent.ts` (96 LOC), `seo-audit-agent.ts` (112),
`social-agent.ts` (104), `sales-agent.ts` (54). The heavy lifting is
in `services/skills/` and `services/engines/`, but these agents don't
*compose* their skills into a polished, opinionated end-user
experience. Each needs: a clear input contract, a proven prompt
template, and a "ready output" the campaign flow can consume.

### G4. The integrations layer is thin
`routes/integrations.ts` exists but real OAuth and live data sync for
Shopify / Notion / Google Drive / WordPress are not built. For the
ideal flow, "crawl website" works; "import Shopify catalog" does not.

### G5. No campaign-level "Why this output?" view
Doc 06 §6b describes lineage for a single RAG query. For a campaign
output (a banner, an ad, a blog post) we need the same explainability:
*which brain entries fed this banner, which prompt, which model, which
references*. The data partly exists in `agentMemories.metadata` but
isn't surfaced.

### G6. The user-facing dashboard is split across 25+ pages
There is `marketing/`, `seo-engine/`, `landing-pages/`, `ads/`,
`assets/`, `growth-brain/`, `analytics/`, `leads/`, plus more. A
non-tech user does not want 25 menu items. They want: **Campaigns,
Brain, Performance, Settings.** The reorganization is its own
deliverable.

### G7. The two `documents` tables (also called out in doc 06)
The legacy `core.documents` path and the trust-grade
`ai_tenant_documents` path both exist. For the marketing flow this
matters because the Brain must read from one consolidated source.

---

## §4 — The execution model: Campaign Flow as the spine

The cleanest way to ship this is to **make `campaigns` the spine** of
the entire user experience, and treat every other surface as a view
onto a campaign:

```
campaign(id)
   │
   ├── inputs:   brain snapshot, goals, audience, budget
   ├── plan:     planner-agent → playbook
   ├── generate: parallel calls
   │     ├── seo-content-factory → blog/landing copy
   │     ├── marketing-agent     → ad copy variants
   │     └── creative-adapter    → banners
   ├── review:   user previews everything in ONE screen
   ├── launch:   ads-engine + deployment-service + distribution-engine
   ├── track:    tracking-engine + performance-tracker
   └── learn:    feedback-loop → growth-brain → next campaign suggestion
```

Every existing service maps to one of these stages. The work is **not
to build new services**, it is to **wire them into a single
state-machine-driven flow** with a single user-facing screen per stage.

The state machine already exists in `marketing.ts: campaigns`. We just
need to honor it.

---

## §5 — Recommended scope

**In scope for this doc's roadmap:**
- The 1-click campaign flow (G1)
- Verticalized agent polish (G3)
- Campaign explainability (G5)
- Dashboard simplification to 4 top-level surfaces (G6)
- A handful of high-value integrations (G4) — Shopify and WordPress first

**Shared with doc 06 (do not duplicate):**
- Structured Business Brain (G2 = doc 06 §6a)
- Documents table consolidation (G7 = doc 06 Phase 0)
- Lineage data model for explainability (G5 reuses doc 06 §6b lineage tables)

**Out of scope for this doc:**
- Trust UI / proof page / audit chain → doc 06
- External `@trustai/core` API → doc 06
- BYO LLM key UI → doc 06

---

## §6 — Phased roadmap

The phases are aligned with doc 06's phases so the team can run them in
parallel without collision.

### Phase 0 — Shared prerequisites (with doc 06)
- Consolidate `documents` tables (doc 06 Phase 0).
- Define the Business Brain schema **once** (brand voice, persona,
  products, campaign learnings) — used by both docs.

### Phase 1 — Campaign spine (the highest-leverage week)
- Build `POST /v1/campaigns/generate` end-to-end:
  1. Snapshot Business Brain
  2. Call planner-agent → playbook
  3. Call seo-content-factory + marketing-agent + creative-adapter in
     parallel
  4. Persist as `campaigns` with state `ready`, including all child
     `banners` and `social_posts`
- Build the **single Campaign Review screen** showing every generated
  asset for one campaign with edit-in-place + Approve / Regenerate.
- Build `POST /v1/campaigns/:id/launch` that fans out to ads-engine +
  deployment-service.

### Phase 2 — Verticalized agent polish (G3)
- Promote the four thin agents (`marketing`, `seo-audit`, `social`,
  `sales`) into proper "Business Agents" with: clear input contract,
  proven prompt template, output schema the campaign flow consumes,
  and skill composition from `services/skills/`.

### Phase 3 — Brain editor + explainability (shared with doc 06)
- UI for editable brand voice / persona / products (uses tables from
  Phase 0).
- "Why this output?" modal on every generated asset, sharing the
  lineage data model from doc 06 §6b.

### Phase 4 — Integrations + dashboard simplification
- Shopify product import + WordPress publish.
- Reorganize dashboard from 25+ pages to 4 surfaces:
  **Campaigns / Brain / Performance / Settings.**
  All other current pages become tabs or detail views.

---

## §7 — How docs 06 and 07 fit together

| Concern | Doc 06 (Trust) | Doc 07 (Outcome) |
|---|---|---|
| L1 Data ingestion | Hashes + audit | Crawl + extract pipeline |
| L2 Business Brain | Editable, versioned, lineage source | Editable, used for generation context |
| L3 RAG | Per-tenant isolation, sources[] | Retrieval feeds the generators |
| L4 Agents | Audited per-tenant | Verticalized for SEO/Ads/Banner |
| L5 Execution | — | Publish + run + track |
| L6 Trust surface | Proof page, lineage, audit chain | "Why this output?" reuses doc 06 lineage |
| External API | `@trustai/core` (sister projects) | Internal only — campaign flow stays in 1Person |
| Shared tables | Business Brain, lineage, consolidated documents | Same |

**Rule of thumb:** if a piece of work reads the Brain or the audit
chain, it lives under doc 06. If it writes to `campaigns`, `banners`,
`ads`, `landing_pages`, or `social_posts`, it lives under doc 07. The
shared tables (Business Brain, lineage) are built **once** in Phase 0
of either roadmap (whichever lands first).

---

## Appendix A — File map

| Concern | File |
|---|---|
| Crawler | `apps/api/src/agents/crawler-agent.ts` |
| Website analyzer | `apps/api/src/services/website-analyzer.ts` |
| FTUX | `apps/api/src/services/ftux-processor.ts`, `routes/ftux.ts` |
| Business understanding | `apps/api/src/agents/business-understanding-agent.ts` |
| Brand identity | `apps/api/src/services/brand-identity-service.ts` |
| Business context | `apps/api/src/services/business-context.ts` |
| Marketing autonomous | `apps/api/src/services/marketing-autonomous.ts` |
| Ads engine + 7 platforms | `apps/api/src/services/ads-engine.ts`, `services/platforms/providers/*` |
| Landing pages | `apps/api/src/routes/landing-pages.ts`, `services/landing-page-service.ts`, `services/page-renderer-service.ts` |
| Deployment | `apps/api/src/services/deployment-service.ts`, `services/s3-deploy.ts` |
| SEO engine | `apps/api/src/routes/seo-engine.ts`, `services/seo-engine.ts`, `services/engines/seo-content-factory.ts` |
| Tracking | `apps/api/src/routes/tracking.ts`, `services/tracking-engine.ts`, `services/attribution.ts`, `services/performance-tracker.ts` |
| Outreach | `apps/api/src/routes/outreach.ts`, `services/outreach-engine.ts` |
| Lead capture | `apps/api/src/routes/lead-capture.ts`, `services/lead-capture-engine.ts` |
| Feedback loop | `apps/api/src/agents/feedback-loop.ts`, `services/engines/seo-ranking-feedback-engine.ts`, `workers/feedback-cron.ts` |
| Growth brain | `apps/api/src/agents/growth-brain.ts` |
| Skills library | `apps/api/src/services/skills/*` |
| Campaign schema | `packages/core/src/db/schema/marketing.ts` |
| Memory schema | `packages/core/src/db/schema/memory.ts` |
| Knowledge schema | `packages/core/src/db/schema/knowledge.ts` |

## Appendix B — Open questions for the implementation plan
1. Phase 0 — do we build the Business Brain schema in `packages/core` (used by main app) or `packages/ai-tenant` (extractable)? Recommend `packages/ai-tenant` so external consumers via `@trustai/core` get it for free, with a thin re-export from `core`.
2. Phase 1 — does "Approve" auto-launch, or always require an explicit second click? Recommend explicit second click for v1 (lower risk).
3. Phase 4 — do we delete the old 25+ pages or hide them behind a "Power user" toggle? Recommend hide-then-delete after one release.
